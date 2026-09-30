import React, {useCallback, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Share2} from 'lucide-react';
import Modal from './Modal';
import SharedStudyContent from './SharedStudyContent';
import {useAuth} from '../../context/AuthContext';
import {useApp} from '../../context/AppContext';
import {supabase} from '../../lib/supabase';
import {flushCloud} from '../../utils/cloudStore';
import {databaseId} from '../../utils/cloudRepository';
import {studySnapshot,studyShareUrl} from '../../utils/studyShare';

export default function ShareStudyButton({source,title,subject='',content='',contentChoices,flashcards=[],quizzes=[]}) {
 const auth=useAuth(),{pushToast}=useApp();
 const [draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[url,setUrl]=useState('');
 const trigger=useRef(null),token=useRef(''),pending=useRef(false),titleId=useId();
 const close=useCallback(()=>{if(!pending.current){setDraft(null);trigger.current?.focus();}},[]);
 function open(){token.current=crypto.randomUUID();setUrl('');setError('');setDraft({title,subject,content,source:{...source},choices:contentChoices||[],cards:flashcards,questions:quizzes,includeCards:source.kind==='flashcard',includeQuiz:source.kind==='quiz'});}
 function changeSelection(patch){token.current=crypto.randomUUID();setError('');setDraft(d=>({...d,...patch}));}
 const preview=draft?{text:draft.content,flashcards:draft.includeCards?draft.cards.map(c=>({question:c.question,answer:c.answer,explanation:c.explanation||'',options:[]})):[],quizzes:draft.includeQuiz?draft.questions.map(q=>({question:q.question,answer:q.correctAnswer,explanation:q.explanation||'',options:q.options||[]})):[]}:null;
 async function share(){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');
  try{
   let link=url;
   if(!link){
    const snapshot=studySnapshot({content:draft.content,flashcards:draft.includeCards?draft.cards:[],quizzes:draft.includeQuiz?draft.questions:[]});
    if(!auth?.session?.user.id)throw Error('Sign in to share your study content.');
    await flushCloud();
    const {data,error}=await supabase.rpc('create_study_share',{p_share_id:token.current,p_kind:draft.source.kind,p_source:await databaseId(draft.source.id,auth.session.user.id),p_item:draft.source.item||null,p_title:draft.title,p_subject:draft.subject,p_snapshot:snapshot});
    if(error)throw Error(error.message);if(!data)throw Error('The study link could not be created. Please retry.');link=studyShareUrl(data);setUrl(link);
   }
   try{await navigator.clipboard.writeText(link);pushToast('Study link copied!','success');}
   catch{setError('Your link is ready. Clipboard access was blocked; select and copy the link below.');}
  }catch(e){setError(e.message||'Could not share this study item. Please retry.');}
  finally{pending.current=false;setBusy(false);}
 }
 return <><button ref={trigger} type="button" className="btn btn-secondary" aria-haspopup="dialog" onClick={open}><Share2 size={16} aria-hidden="true"/>Share</button>{draft&&createPortal(<Modal title="Share study link" labelledBy={titleId} onClose={close} footer={<><button className="btn btn-secondary" disabled={busy} onClick={close}>Close</button><button className="btn btn-primary" disabled={busy} onClick={share}>{busy?'Creating link…':url?'Copy link':'Create & copy link'}</button></>}><div className="share-dialog"><p>Anyone with this link can read the snapshot below, including answers. Share only content you have permission to publish. Your account details, progress, and original PDF stay private.</p><h4>{draft.title}</h4>{draft.subject&&<p>{draft.subject}</p>}
 {!url&&<fieldset disabled={busy}><legend>Include in this snapshot</legend>{draft.choices.length>0&&<label>Study text<select className="select" value={draft.content} onChange={e=>changeSelection({content:e.target.value})}>{draft.choices.map((c,i)=><option key={i} value={c.value}>{c.label}</option>)}</select></label>}{draft.cards.length>0&&<label className="share-check"><input type="checkbox" checked={draft.includeCards} onChange={e=>changeSelection({includeCards:e.target.checked})}/>Flashcards ({draft.cards.length})</label>}{draft.questions.length>0&&<label className="share-check"><input type="checkbox" checked={draft.includeQuiz} onChange={e=>changeSelection({includeQuiz:e.target.checked})}/>Quiz questions and answers ({draft.questions.length})</label>}</fieldset>}
 {url&&<div className="field"><label htmlFor={`${titleId}-link`}>Public study link</label><input id={`${titleId}-link`} className="input" readOnly value={url} onFocus={e=>e.target.select()}/><a href={url} target="_blank" rel="noopener noreferrer">Open shared page</a><p role="status">Snapshot saved. Manage or stop sharing in Settings → Shared study links.</p></div>}
 {error&&<p role="alert">{error}</p>}<div className="share-preview"><SharedStudyContent snapshot={preview}/></div><p className="share-caption">Later edits will not change this snapshot. Deleting the source or stopping sharing disables the link. Recipients can still keep their own copies.</p></div></Modal>,document.body)}</>;
}
