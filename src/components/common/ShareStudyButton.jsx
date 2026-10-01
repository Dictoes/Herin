import React, {useCallback, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {FileText, Share2, Trash2, Upload} from 'lucide-react';
import Modal from './Modal';
import SharedStudyContent from './SharedStudyContent';
import {useAuth} from '../../context/AuthContext';
import {useApp} from '../../context/AppContext';
import {supabase} from '../../lib/supabase';
import {flushCloud} from '../../utils/cloudStore';
import {databaseId} from '../../utils/cloudRepository';
import {studySnapshot, studyShareUrl} from '../../utils/studyShare';
import {requestSharedPdf, validateSharedPdf} from '../../utils/sharedPdf';

const formatFileSize = size => size < 1024 * 1024
 ? `${Math.max(1, Math.round(size / 1024))} KB`
 : `${(size / (1024 * 1024)).toFixed(1)} MB`;

export default function ShareStudyButton({source,title,subject='',content='',contentChoices,flashcards=[],quizzes=[]}) {
 const auth=useAuth(),{pushToast}=useApp();
 const [draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[url,setUrl]=useState('');
 const [attachment,setAttachment]=useState(null),[pdfState,setPdfState]=useState(''),[pdfError,setPdfError]=useState('');
 const trigger=useRef(null),token=useRef(''),pending=useRef(false),upload=useRef(null),titleId=useId(),fileInput=useRef(null);
 const close=useCallback(async()=>{
  if(pending.current||upload.current||pdfState==='removing')return;
  if(attachment&&!url){
   setPdfState('removing');setPdfError('');
   try{await requestSharedPdf(supabase,'remove',{shareId:token.current});setAttachment(null);}
   catch(e){setPdfState('failed');setPdfError(e.message||'The PDF could not be removed. Please retry.');return;}
  }
  setDraft(null);trigger.current?.focus();
 },[attachment,url,pdfState]);
 function open(){
  token.current=crypto.randomUUID();setUrl('');setError('');setPdfError('');setPdfState('');setAttachment(null);
  setDraft({title,subject,content,source:{...source},choices:contentChoices||[],cards:flashcards,questions:quizzes,includeCards:source.kind==='flashcard',includeQuiz:source.kind==='quiz'});
 }
 function changeSelection(patch){setError('');setDraft(d=>({...d,...patch}));}
 const preview=draft?{text:draft.content,flashcards:draft.includeCards?draft.cards.map(c=>({question:c.question,answer:c.answer,explanation:c.explanation||'',options:[]})):[],quizzes:draft.includeQuiz?draft.questions.map(q=>({question:q.question,answer:q.correctAnswer,explanation:q.explanation||'',options:q.options||[]})):[]}:null;

 async function selectPdf(event){
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  setPdfError('');
  let validation;
  try{validation=await validateSharedPdf(file);}
  catch{validation='This file could not be read as a PDF.';}
  if(validation){setPdfState('');setPdfError(validation);return;}
  if(attachment&&attachment.fingerprint===`${file.name}:${file.size}:${file.lastModified}`){setPdfState('attached');return;}
  if(attachment){
   setPdfState('removing');
   try{await requestSharedPdf(supabase,'remove',{shareId:token.current});setAttachment(null);}
   catch(e){setPdfState('failed');setPdfError(e.message||'The attached PDF could not be replaced. Please retry.');return;}
  }
  const controller=new AbortController();upload.current=controller;setPdfState('uploading');
  try{
   const result=await requestSharedPdf(supabase,'upload',{shareId:token.current,file,signal:controller.signal});
   setAttachment({...result,fingerprint:`${file.name}:${file.size}:${file.lastModified}`});setPdfState('attached');
  }catch(e){
   if(e.name==='AbortError'){
    try{await requestSharedPdf(supabase,'remove',{shareId:token.current});setAttachment(null);setPdfState('');}
    catch(removeError){setPdfState('failed');setPdfError(removeError.message||'The cancelled PDF upload could not be removed. Please retry.');}
   }else{
    setPdfState('failed');setPdfError('The PDF could not be uploaded. You can still share the note without the PDF.');
   }
  }finally{if(upload.current===controller)upload.current=null;}
 }

 async function removePdf(){
  setPdfState('removing');setPdfError('');
  try{await requestSharedPdf(supabase,'remove',{shareId:token.current});setAttachment(null);setPdfState('');}
  catch(e){setPdfState('failed');setPdfError(e.message||'The attached PDF could not be removed. Please retry.');}
 }

 async function share(){
  if(pending.current||pdfState==='uploading'||pdfState==='removing')return;
  pending.current=true;setBusy(true);setError('');
  try{
   let link=url;
   if(!link){
    const snapshot=studySnapshot({content:draft.content,flashcards:draft.includeCards?draft.cards:[],quizzes:draft.includeQuiz?draft.questions:[]});
    if(!auth?.session?.user.id)throw Error('Sign in to share your study content.');
    await flushCloud();
    const {data,error}=await supabase.rpc('create_study_share',{
     p_share_id:token.current,p_kind:draft.source.kind,p_source:await databaseId(draft.source.id,auth.session.user.id),
     p_item:draft.source.item||null,p_title:draft.title,p_subject:draft.subject,p_snapshot:snapshot,
     p_pdf_file_name:attachment?.file_name||null,p_pdf_file_size:attachment?.file_size||null,p_pdf_mime_type:attachment?.mime_type||null,
    });
    if(error)throw Error(error.message);if(!data)throw Error('The study link could not be created. Please retry.');
    link=studyShareUrl(data);setUrl(link);
   }
   try{await navigator.clipboard.writeText(link);pushToast('Study link copied!','success');}
   catch{setError('Your link is ready. Clipboard access was blocked; select and copy the link below.');}
  }catch(e){setError(e.message||'Could not share this study item. Please retry.');}
  finally{pending.current=false;setBusy(false);}
 }

 const pdfBusy=pdfState==='uploading'||pdfState==='removing';
 return <><button ref={trigger} type="button" className="btn btn-secondary" aria-haspopup="dialog" onClick={open}><Share2 size={16} aria-hidden="true"/>Share</button>{draft&&createPortal(<Modal title="Share study link" labelledBy={titleId} onClose={close} footer={<><button className="btn btn-secondary" disabled={busy||pdfBusy} onClick={close}>Close</button><button className="btn btn-primary" disabled={busy||pdfBusy} onClick={share}>{busy?'Creating link…':url?'Copy link':'Create & copy link'}</button></>}><div className="share-dialog"><p>Anyone with this link can read the snapshot below, including answers. Share only content you have permission to publish. Your account details and progress stay private. Only a PDF you choose to attach can be downloaded.</p><h4>{draft.title}</h4>{draft.subject&&<p>{draft.subject}</p>}
 {!url&&<fieldset disabled={busy||pdfBusy}><legend>Include in this snapshot</legend>{draft.choices.length>0&&<label>Study text<select className="select" value={draft.content} onChange={e=>changeSelection({content:e.target.value})}>{draft.choices.map((c,i)=><option key={i} value={c.value}>{c.label}</option>)}</select></label>}{draft.cards.length>0&&<label className="share-check"><input type="checkbox" checked={draft.includeCards} onChange={e=>changeSelection({includeCards:e.target.checked})}/>Flashcards ({draft.cards.length})</label>}{draft.questions.length>0&&<label className="share-check"><input type="checkbox" checked={draft.includeQuiz} onChange={e=>changeSelection({includeQuiz:e.target.checked})}/>Quiz questions and answers ({draft.questions.length})</label>}</fieldset>}
 {!url&&<section className="share-pdf" aria-label="Optional PDF attachment"><input ref={fileInput} className="share-pdf-input" type="file" accept=".pdf,application/pdf" aria-label="Choose PDF to attach" onChange={selectPdf}/>{attachment?<div className="share-pdf-file"><FileText size={20} aria-hidden="true"/><span><strong>{attachment.file_name}</strong><small>{formatFileSize(attachment.file_size)} · {pdfState==='uploading'?'Uploading PDF':'PDF attached'}</small></span><button type="button" className="btn btn-ghost" disabled={pdfBusy||busy} onClick={removePdf} aria-label="Remove attached PDF"><Trash2 size={16} aria-hidden="true"/>Remove</button><button type="button" className="btn btn-ghost" disabled={pdfBusy||busy} onClick={()=>fileInput.current?.click()}>Replace</button></div>:<button type="button" className="btn btn-secondary" disabled={pdfBusy||busy} onClick={()=>fileInput.current?.click()}><Upload size={16} aria-hidden="true"/>Attach PDF</button>}{pdfState==='uploading'&&<p role="status">Uploading PDF <button className="btn btn-ghost" type="button" onClick={()=>upload.current?.abort()}>Cancel upload</button></p>}{pdfState==='removing'&&<p role="status">Removing PDF…</p>}{pdfState==='attached'&&<p role="status">PDF attached</p>}{pdfState==='failed'&&<p role="status">Upload failed</p>}{pdfError&&<p role="alert">{pdfError}</p>}</section>}
 {url&&<div className="field"><label htmlFor={`${titleId}-link`}>Public study link</label><input id={`${titleId}-link`} className="input" readOnly value={url} onFocus={e=>e.target.select()}/><a href={url} target="_blank" rel="noopener noreferrer">Open shared page</a><p role="status">Snapshot saved. Manage or stop sharing in Settings → Shared study links.</p></div>}
 {error&&<p role="alert">{error}</p>}<div className="share-preview"><SharedStudyContent snapshot={preview}/></div><p className="share-caption">Later edits will not change this snapshot. Deleting the source or stopping sharing disables the link. Recipients can still keep their own copies.</p></div></Modal>,document.body)}</>;
}
