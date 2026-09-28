import React, {useEffect, useRef, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {Loader2, Sparkles} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {supabase} from '../../lib/supabase';
import {cloudUser, flushCloud, refreshCloud} from '../../utils/cloudStore';
import {databaseId} from '../../utils/cloudRepository';
import {storage} from '../../utils/storage';
import {processPdf} from '../../utils/processPdf';

export default function AIStudyAssistant({meta}) {
  const app=useApp(),navigate=useNavigate();
  const [quantity,setQuantity]=useState(10),[difficulty,setDifficulty]=useState('mixed'),[topicId,setTopicId]=useState('');
  const [topics,setTopics]=useState([]),[summaries,setSummaries]=useState([]),[status,setStatus]=useState('Ready'),[error,setError]=useState('');
  const [busy,setBusy]=useState(false),[result,setResult]=useState(null),[topicForm,setTopicForm]=useState(false);
  const [topicName,setTopicName]=useState(''),[start,setStart]=useState(1),[end,setEnd]=useState(meta.pageCount||1);
  const flight=useRef(false),retry=useRef(null),mounted=useRef(true);
  const owner=useRef(cloudUser());
  const current=()=>mounted.current&&cloudUser()===owner.current;
  async function loadExtras() {
    const pdfId=await databaseId(meta.id,owner.current);
    const [t,g]=await Promise.all([
      supabase.from('study_topics').select('*').eq('pdf_id',pdfId).eq('user_id',owner.current).order('start_page'),
      supabase.from('study_generations').select('id,result,created_at').eq('pdf_id',pdfId).eq('user_id',owner.current).eq('status','completed').order('created_at',{ascending:false}).limit(20)
    ]);
    if(t.error||g.error)throw Error('AI setup is not complete. Apply the AI study migration and deploy the Edge Function.');
    if(current()){setTopics(t.data);setSummaries(g.data.filter(r=>r.result?.summaries?.length));}
  }
  useEffect(()=>{mounted.current=true;loadExtras().catch(e=>{if(current())setError(e.message);});return()=>{mounted.current=false;};},[meta.id]);
  async function generate(contentType, isRetry=false) {
    if(flight.current)return;
    flight.current=true;setBusy(true);setError('');setResult(null);
    try {
      if(!owner.current)throw Error('Sign in to generate study materials.');
      if(!isRetry||!retry.current){
        retry.current={pdfId:await databaseId(meta.id,owner.current),classId:await databaseId(meta.classId,owner.current),topicId:topicId||null,contentType,quantity:Number(quantity),difficulty,requestId:crypto.randomUUID()};
        sessionStorage.setItem(`herin:ai:${owner.current}:${meta.id}`,JSON.stringify(retry.current));
      }
      let extracted=storage.getExtractedTexts()[meta.id];
      if(!(typeof extracted==='string'?extracted:extracted?.text)?.trim()) {
        setStatus('Extracting PDF text');
        const file=await app.getPdfFile(meta.id);
        if(!file)throw Error('The original PDF is unavailable. Reopen it and retry.');
        await processPdf(file,meta,app);
        extracted=storage.getExtractedTexts()[meta.id];
      }
      if(!(typeof extracted==='string'?extracted:extracted?.text)?.trim())throw Error('This PDF has no readable text. Run OCR before importing a scanned PDF.');
      if(!current())return;
      await flushCloud();
      setStatus(retry.current.contentType==='summary'?'Generating summary':retry.current.contentType==='quiz'?'Generating quiz':retry.current.contentType==='both'?'Generating flashcards and quiz':'Generating flashcards');
      const {data,error:invokeError}=await supabase.functions.invoke('generate-study-content',{body:retry.current});
      if(invokeError){
        let code;try{code=(await invokeError.context?.json())?.code;}catch{}
        const messages={MODEL_UNAVAILABLE:'The configured Gemini model is unavailable. Ask the owner to check model access.',PROVIDER_UNAVAILABLE:'Google AI is temporarily unavailable. Wait before retrying.',UNAVAILABLE:'The AI server could not complete the request. Please report error code UNAVAILABLE.',INVALID_REQUEST:'These generation options are invalid. Start a new generation.',REQUEST_CONFLICT:'These options differ from the original request. Start a new generation.',QUOTA:'AI quota or rate limit reached. Wait before retrying.',DAILY_LIMIT:'Daily study limit reached. Try again tomorrow.',NOT_CONFIGURED:'Ask the owner to add the Gemini server secret.',PROVIDER_CONFIGURATION:'Ask the owner to check the Gemini server key and model access.',IN_PROGRESS:'This generation is still running. Wait a few minutes, then retry.',EMPTY_PDF:'This topic has no readable text. Select another topic or run OCR.',PDF_TOO_LARGE:'Select a smaller topic and retry (up to 240,000 text characters).',AUTH_REQUIRED:'Your session expired. Sign in again.',INVALID_RESPONSE:'AI returned an incomplete response. Try fewer items.',DATABASE_ERROR:'Results could not be saved. Check the AI migration, then retry.',TIMEOUT:'Generation timed out. Try a smaller topic.',NOT_FOUND:'The selected PDF, class, or topic is unavailable.'};
        throw Error(messages[code]||'AI could not finish. Check the server setup and connection, then retry.');
      }
      if(!current())return;
      setStatus('Saving results');await refreshCloud();await loadExtras();
      if(current()){setResult(data);setStatus('Completed');sessionStorage.removeItem(`herin:ai:${owner.current}:${meta.id}`);retry.current=null;}
    }catch(e){if(current()){setError(e.message);setStatus('Error');}}
    finally{flight.current=false;if(current())setBusy(false);}
  }
  useEffect(()=>{try{const saved=JSON.parse(sessionStorage.getItem(`herin:ai:${owner.current}:${meta.id}`));if(saved){retry.current=saved;setError('An earlier request may have been interrupted. Retry to retrieve its results without duplicate saves.');}}catch{}},[meta.id]);
  async function addTopic(event){
    event.preventDefault();setError('');
    try{
      const pdfId=await databaseId(meta.id,owner.current);
      const {data,error:saveError}=await supabase.from('study_topics').insert({user_id:owner.current,pdf_id:pdfId,name:topicName.trim(),start_page:Number(start),end_page:Number(end)}).select().single();
      if(saveError)throw Error('Topic could not be saved. Check the AI setup and page range.');
      setTopics(p=>[...p,data]);setTopicId(data.id);setTopicForm(false);setTopicName('');
    }catch(e){setError(e.message);}
  }
  return <section className="card ai-study" aria-label="AI Study Assistant">
    <h2><Sparkles size={20}/> AI Study Assistant</h2>
    <p>Generate from this PDF only. Selected text is processed by Gemini. Review answers against the source.</p>
    <div className="ai-controls">
      <label className="field">Selected PDF<select className="select" value={meta.id} disabled={busy} onChange={e=>navigate(`/pdfs/${e.target.value}`)}>{app.pdfs.filter(p=>p.kind!=='note').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="field">Class<select className="select" value={meta.classId||''} disabled={busy} onChange={e=>app.updatePdfMeta(meta.id,{classId:e.target.value})}><option value="">No class linked</option>{app.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="field">Topic<select className="select" value={topicId} disabled={busy} onChange={e=>setTopicId(e.target.value)}><option value="">Entire PDF</option>{topics.map(t=><option key={t.id} value={t.id}>{t.name} (pages {t.start_page}–{t.end_page})</option>)}</select></label>
      <label className="field">Items per type<input className="input" type="number" min="1" max="30" value={quantity} disabled={busy} onChange={e=>setQuantity(e.target.value)}/></label>
      <label className="field">Difficulty<select className="select" value={difficulty} disabled={busy} onChange={e=>setDifficulty(e.target.value)}>{['mixed','easy','medium','hard'].map(d=><option key={d} value={d}>{d[0].toUpperCase()+d.slice(1)}</option>)}</select></label>
    </div>
    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={()=>setTopicForm(p=>!p)}>Add page-range topic</button>
    {topicForm&&<form className="ai-controls" onSubmit={addTopic}>
      <label className="field">Topic name<input className="input" required maxLength={150} value={topicName} onChange={e=>setTopicName(e.target.value)}/></label>
      <label className="field">First page<input className="input" required type="number" min="1" max={meta.pageCount||9999} value={start} onChange={e=>setStart(e.target.value)}/></label>
      <label className="field">Last page<input className="input" required type="number" min={start} max={meta.pageCount||9999} value={end} onChange={e=>setEnd(e.target.value)}/></label>
      <button className="btn btn-secondary" disabled={busy}>Save topic</button>
    </form>}
    <div className="ai-actions">{[['flashcards','Generate Flashcards'],['quiz','Generate Quiz'],['both','Generate Both'],['summary','Summarize topic']].map(([type,label])=><button className={`btn ${type==='both'?'btn-primary':'btn-secondary'}`} key={type} disabled={busy||meta.status==='processing'||!Number.isInteger(Number(quantity))||quantity<1||quantity>30} onClick={()=>generate(type)}>{label}</button>)}</div>
    <p role="status" aria-live="polite">{busy&&<Loader2 className="ai-spinner" size={16}/>} {meta.status==='processing'&&!busy?'Extracting PDF text':status}{busy?' · Large PDFs may take longer. Results save automatically.':''}</p>
    {error&&<div role="alert"><p>{error}</p>{retry.current&&<button className="btn btn-secondary" disabled={busy} onClick={()=>generate(retry.current.contentType,true)}>Retry AI generation</button>}</div>}
    {result&&<div><p>Saved {result.flashcardCount} flashcards and {result.quizCount} quiz questions.</p><Link className="btn btn-secondary" to={`/flashcards?pdf=${meta.id}`}>Review generated flashcards</Link> <Link className="btn btn-secondary" to={`/quiz?pdf=${meta.id}`}>Start generated quiz</Link></div>}
    {summaries.map(g=><details key={g.id}><summary>Saved summary · {new Date(g.created_at).toLocaleString()}</summary>{g.result.summaries.map((s,i)=><div key={i}><p>Pages {s.pages.join(', ')}</p><p className="ai-summary">{s.text}</p></div>)}</details>)}
  </section>;
}
