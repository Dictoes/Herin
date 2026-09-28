import {StudyError, validateRequest, sectionsFrom, generateSections} from './core.js';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply = (body, status = 200) => new Response(JSON.stringify(body), {status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const success = result => reply({...result,success:true,saved:true,flashcards:result.flashcards||[],quiz_questions:(result.quiz?.questions||[]).map(q=>({question:q.question,choices:q.options,correct_answer:q.correctAnswer,explanation:q.explanation,difficulty:q.difficulty,source_page:q.sourcePage}))});
const failure = error => {
  const detail={code:error.code,message:error.message,...(Number.isInteger(error.providerStatus)?{providerStatus:error.providerStatus}:{})};
  // Top-level fields retain compatibility with tabs running an earlier app version.
  return reply({success:false,error:detail,...detail},error.status);
};
const dbError = error => {
  const known = {IN_PROGRESS:['Generation is still running. Wait a few minutes, then retry.',409],REQUEST_CONFLICT:['This request has changed. Start a new generation.',409],DAILY_LIMIT:['The daily study limit was reached. Try again tomorrow.',429],NOT_FOUND:['The PDF, class, or topic is unavailable.',404]};
  const match = Object.keys(known).find(k=>error?.message?.includes(k));
  return match ? new StudyError(match,...known[match]) : new StudyError('DATABASE_ERROR','Study results could not be saved. Check the AI database migration, then retry.',503);
};
export function createHandler({createClient, env, generate = generateSections}) {
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null,{headers:cors});
    if (request.method !== 'POST') return failure(new StudyError('INVALID_REQUEST','Use POST.',405));
    let client, input, lease, claimed = false,stage='authentication';
    try {
      const authorization = request.headers.get('Authorization');
      if (!authorization?.startsWith('Bearer ')) throw new StudyError('AUTH_REQUIRED','Sign in to generate study materials.',401);
      client = createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:{user},error:authError} = await client.auth.getUser(authorization.slice(7));
      if (authError || !user) throw new StudyError('AUTH_REQUIRED','Your session expired. Sign in again.',401);
      stage='request_validation';
      const raw = await request.text();
      if (raw.length > 4096) throw new StudyError('INVALID_REQUEST','Request is too large.');
      try {input = validateRequest(JSON.parse(raw));} catch (e) { if (e instanceof StudyError) throw e; throw new StudyError('INVALID_REQUEST','Choose a PDF and generation options.'); }
      stage='ownership';
      const pdf = await client.from('pdfs').select('id,user_id,class_id,extracted_text').eq('id',input.pdfId).eq('user_id',user.id).maybeSingle();
      if (pdf.error) throw dbError(pdf.error);
      if (!pdf.data) throw new StudyError('NOT_FOUND','This PDF is unavailable.',404);
      input.classId ||= pdf.data.class_id || null;
      if (input.classId) {
        const cls = await client.from('classes').select('id').eq('id',input.classId).eq('user_id',user.id).maybeSingle();
        if (cls.error || !cls.data) throw new StudyError('NOT_FOUND','This class is unavailable.',404);
        if (pdf.data.class_id && pdf.data.class_id !== input.classId) throw new StudyError('INVALID_REQUEST','Select the class linked to this PDF.');
      }
      let topic;
      if (input.topicId) {
        const result = await client.from('study_topics').select('id,start_page,end_page').eq('id',input.topicId).eq('pdf_id',input.pdfId).eq('user_id',user.id).maybeSingle();
        if (result.error || !result.data) throw new StudyError('NOT_FOUND','This topic is unavailable for the selected PDF.',404);
        topic = result.data;
      }
      lease = crypto.randomUUID();
      stage='claim';
      const claim = await client.rpc('claim_study_generation',{p_request:input,p_lease:lease});
      if (claim.error) throw dbError(claim.error);
      if (claim.data.completed) return success(claim.data.result);
      claimed = true;
      // The UI uses Herin's PDF.js extraction before invoking this function. Raw PDF bytes
      // remain private. Direct callers must also finish extraction before generating.
      stage='text_validation';
      const sections = sectionsFrom(pdf.data.extracted_text, topic);
      stage='gemini';
      const result = await generate(sections,input,{key:env('GEMINI_API_KEY'),model:env('GEMINI_MODEL') || 'gemini-3.5-flash-lite'});
      stage='database_save';
      const saved = await client.rpc('finish_study_generation',{p_id:input.requestId,p_lease:lease,p_result:result});
      if (saved.error) throw dbError(saved.error);
      return success(saved.data);
    } catch (error) {
      const safe = error instanceof StudyError ? error : new StudyError('UNAVAILABLE','Study generation is unavailable. Please retry later.',503);
      if (claimed) {
        // No content or provider errors are stored/logged. A lease expires if this best-effort update fails.
        try { await client.from('study_generations').update({status:'failed',result:{errorCode:safe.code,stage,...(Number.isInteger(safe.providerStatus)?{providerStatus:safe.providerStatus}:{})}}).eq('id',input.requestId).eq('lease',lease).eq('status','processing'); } catch {}
      }
      console.warn(JSON.stringify({event:'study_generation_failed',stage,code:safe.code,...(Number.isInteger(safe.providerStatus)?{providerStatus:safe.providerStatus}:{})}));
      return failure(safe);
    }
  };
}
