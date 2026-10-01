// Only display allowlisted diagnostics, never arbitrary provider response text.
const messages = {
  MISSING_API_KEY:'The AI service is not configured in Supabase. The owner must add GEMINI_API_KEY to Edge Function secrets.',
  NOT_CONFIGURED:'The AI service is not configured in Supabase. The owner must add GEMINI_API_KEY to Edge Function secrets.',
  AUTH_REQUIRED:'Your session expired. Sign in again.',
  NOT_FOUND:'The selected PDF, class, or topic is unavailable to this account.',
  INVALID_REQUEST:'The generation options are invalid. Select a PDF and start a new generation.',
  REQUEST_CONFLICT:'The options differ from the original request. Start a new generation.',
  IN_PROGRESS:'This request is still running. Wait before retrying; it will not save duplicate results.',
  EMPTY_PDF:'This selection has no readable text. Select another topic or run OCR before importing a scan.',
  PDF_TOO_LARGE:'Select a smaller topic containing at most 240,000 text characters.',
  QUOTA:'AI quota or rate limit reached. Wait before retrying.',
  DAILY_LIMIT:'The daily study limit was reached. Try again tomorrow.',
  MODEL_UNAVAILABLE:'The configured Gemini model is unavailable for this Google project.',
  PROVIDER_CONFIGURATION:'Google rejected the AI configuration. The owner must check the server key and model access.',
  PROVIDER_UNAVAILABLE:'Google AI is temporarily unavailable. Wait a minute before retrying.',
  TIMEOUT:'Generation timed out. Try fewer items or a smaller topic.',
  INVALID_RESPONSE:'Gemini returned empty or invalid study content. Try fewer items.',
  INSUFFICIENT_SOURCE:'The selected material did not contain enough information to generate the requested quiz. Select a different topic or request fewer questions.',
  DATABASE_ERROR:'The generated content could not be saved to Supabase. Retry without changing the request.',
  FUNCTION_NOT_DEPLOYED:'The generate-study-content backend is not deployed at the configured Supabase project.',
  NETWORK_ERROR:'The AI backend could not be reached. Check your connection and retry.',
  INVALID_BACKEND_RESPONSE:'The backend returned an invalid response. Reload the app and retry.',
  UNAVAILABLE:'The AI backend could not complete the request. Retry shortly.'
};
export async function readStudyResponse({data,error,response}, request) {
  let body=data, http=response || error?.context;
  if(error&&http?.json) { try { body=await (http.clone?.()||http).json(); } catch {} }
  if(error||body?.success===false) {
    let code=body?.error?.code || body?.code;
    if(!Object.hasOwn(messages,code)) code=http?.status===404?'FUNCTION_NOT_DEPLOYED':http?.status===401?'AUTH_REQUIRED':http?.status===429?'QUOTA':http?.status>=500?'UNAVAILABLE':error?.name==='FunctionsFetchError'?'NETWORK_ERROR':'INVALID_BACKEND_RESPONSE';
    const status=body?.error?.providerStatus;
    const detail=Number.isInteger(status)&&status>=400&&status<=599?` (Google HTTP ${status})`:'';
    const safe=new Error(`${messages[code]}${detail} [${code}]`);safe.code=code;throw safe;
  }
  if(!body || body.saved===false || !Number.isInteger(body.flashcardCount) || !Number.isInteger(body.quizCount))throw new Error(`${messages.INVALID_BACKEND_RESPONSE} [INVALID_BACKEND_RESPONSE]`);
  if(request&&['quiz','both'].includes(request.contentType)){
    const questions=body.quiz_questions,selected=request.quizType||'multiple';
    const allowed=selected==='all'?['multiple','identification','enumeration','application']:[selected];
    if(!Array.isArray(questions)||questions.length!==body.quizCount||(request.contentType==='quiz'&&!questions.length)||questions.length>request.quantity||questions.some(q=>!q||!allowed.includes(q.type)||typeof q.question!=='string'||!q.question.trim()||typeof q.correct_answer!=='string'||!q.correct_answer.trim()||typeof q.explanation!=='string'||!q.explanation.trim()))throw new Error(`${messages.INVALID_BACKEND_RESPONSE} [INVALID_BACKEND_RESPONSE]`);
    const seen=new Set();
    for(const q of questions){
      const normalized=q.question.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ');
      if(seen.has(normalized))throw new Error(`${messages.INVALID_BACKEND_RESPONSE} [INVALID_BACKEND_RESPONSE]`);
      seen.add(normalized);
      if(q.type==='multiple'&&(!Array.isArray(q.choices)||q.choices.length!==4||q.choices.some(choice=>typeof choice!=='string'||!choice.trim())||new Set(q.choices.map(choice=>choice.trim().toLocaleLowerCase())).size!==4||!q.choices.includes(q.correct_answer)||q.expected_items!==undefined))throw new Error(`${messages.INVALID_BACKEND_RESPONSE} [INVALID_BACKEND_RESPONSE]`);
      if(q.type==='enumeration'){
        if(!Array.isArray(q.expected_items)||q.expected_items.length<2||q.expected_items.some(item=>typeof item!=='string'||!item.trim())||new Set(q.expected_items.map(item=>item.trim().toLocaleLowerCase())).size!==q.expected_items.length||q.choices!==undefined)throw new Error(`${messages.INVALID_BACKEND_RESPONSE} [INVALID_BACKEND_RESPONSE]`);
        const normalize=value=>value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
        if(normalize(q.correct_answer)!==normalize(q.expected_items.join('; ')))throw new Error(`${messages.INVALID_BACKEND_RESPONSE} [INVALID_BACKEND_RESPONSE]`);
      }
      if(['identification','application'].includes(q.type)&&(q.choices!==undefined||q.expected_items!==undefined))throw new Error(`${messages.INVALID_BACKEND_RESPONSE} [INVALID_BACKEND_RESPONSE]`);
    }
  }
  return body;
}
