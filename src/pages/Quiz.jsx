import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import AppLayout from '../components/Layout/AppLayout';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmptyState from '../components/common/EmptyState';
import { useApp } from '../context/AppContext';
import usePersistedState from '../utils/usePersistedState';
import {storage} from '../utils/storage';
import { checkQuizAnswer } from '../utils/flashcardUtils';

const labels = {multiple:'Multiple choice',identification:'Identification',enumeration:'Enumeration','true-false':'True or false',application:'Understanding'};
export default function Quiz() {
  const { quizQuestions, pdfs,updateQuizQuestion,deleteQuizQuestion } = useApp();
  const [editing,setEditing]=useState(null),[deleting,setDeleting]=useState(null);
  const [session,setSession] = usePersistedState(storage.getQuizSession,storage.setQuizSession);
  const {source='',type='',index=0,answer='',status=null,score=0}=session;
  const setAnswer=answer=>setSession(p=>({...p,answer}));
  const questions=quizQuestions.filter(q=>(!source||q.pdfId===source)&&(!type||q.type===type));
  const signature=questions.map(q=>q.id+q.question+q.correctAnswer).join('|');
  useEffect(()=>{if(session.signature!==signature)setSession(p=>({...p,signature,index:0,answer:'',status:null,score:0}));},[signature]);
  const reset=()=>setSession(p=>({...p,index:0,answer:'',status:null,score:0}));
  const q=questions[index];
  function check(val){if(status!==null||!q)return;const correct=checkQuizAnswer(q,val);setSession(p=>({...p,answer:val,status:correct?'correct':'incorrect',score:p.score+(correct?1:0)}));}
  return <AppLayout title="Quiz practice" subtitle="Recall, check, and build your understanding">
    <div className="toolbar"><select className="select source-filter" aria-label="Quiz document" value={source} onChange={e=>{setSession(p=>({...p,source:e.target.value,index:0,answer:'',status:null,score:0}));}}><option value="">All documents</option>{pdfs.filter(p=>p.kind!=='note').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><select className="select source-filter" aria-label="Question type" value={type} onChange={e=>{setSession(p=>({...p,type:e.target.value,index:0,answer:'',status:null,score:0}));}}><option value="">All question types</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
    {!questions.length ? <EmptyState icon={ListChecks} title="No questions in this selection" description="Highlight a complete lesson idea in a PDF or select another question type. Multiple choice needs distinct terms; enumeration needs a list in the source." action={<Link className="btn btn-primary" to="/pdfs">My PDFs</Link>}/> : !q ? <section className="card quiz-card"><span className="badge badge-live">Session complete</span><h2>{score} of {questions.length} correct</h2><p>Review the source for anything you missed.</p><button className="btn btn-primary" onClick={reset}>Practice again</button></section> : <section className="card quiz-card">
      <div className="quiz-progress"><span>Question {index+1} of {questions.length}</span><span>{score} correct</span></div><progress value={index} max={questions.length} aria-label="Quiz progress"/>
      <div className="study-card-meta"><span className="badge badge-info">{labels[q.type] || q.type}</span><span>Page {q.sourcePage || '-'}</span>{q.pdfId && <Link to={`/pdfs/${q.pdfId}?page=${q.sourcePage||1}`}>Source</Link>}</div>
      <h2>{q.question}</h2><div className="note-actions"><button className="btn btn-ghost btn-sm" onClick={()=>setEditing({...q})}>Edit question</button><button className="btn btn-ghost btn-sm" onClick={()=>setDeleting(q)}>Delete question</button></div>
      {(q.type === 'multiple' || q.type === 'true-false') ? <div className="quiz-options">{q.options.map((opt,i)=><button key={i} className={`btn btn-secondary ${status !== null && opt===q.correctAnswer ? 'answer-correct' : ''} ${status==='incorrect' && opt===answer ? 'answer-incorrect' : ''}`} disabled={status!==null} onClick={()=>check(opt)}><span className="option-letter">{String.fromCharCode(65+i)}</span>{opt}</button>)}</div> : <form onSubmit={e=>{e.preventDefault();check(answer);}}><label className="field" htmlFor="quiz-answer">{q.type==='enumeration'?'List the items, separated by commas':'Your answer'}</label><textarea id="quiz-answer" className="textarea" value={answer} onChange={e=>setAnswer(e.target.value)} disabled={status!==null} rows={3}/>{status===null && <button className="btn btn-primary" disabled={!answer.trim()}>Check answer</button>}</form>}
      {status!==null && <div className={`quiz-feedback ${status}`} role="status"><h3>{status==='correct'?'Correct':'Review this answer'}</h3><p><strong>Correct answer:</strong> {q.correctAnswer}</p><p>{q.explanation}</p><button className="btn btn-primary" onClick={()=>{setSession(p=>({...p,index:p.index+1,status:null,answer:''}));}}>{index===questions.length-1?'See results':'Next question'}</button></div>}
    </section>}
    {deleting&&<ConfirmDialog title="Delete question?" message="Remove this question from practice?" onCancel={()=>setDeleting(null)} onConfirm={()=>{if(deleteQuizQuestion(deleting.id))setDeleting(null);}}/>}
    {editing&&<Modal title="Edit question" onClose={()=>setEditing(null)}><form onSubmit={e=>{e.preventDefault();const patch={...editing,question:editing.question.trim(),correctAnswer:editing.correctAnswer.trim()};if(editing.type==='enumeration')patch.expectedItems=editing.correctAnswer.split(/,|;/).map(s=>s.trim()).filter(Boolean);if(updateQuizQuestion(editing.id,patch))setEditing(null);}}><div className="field"><label htmlFor="edit-q">Question</label><textarea id="edit-q" className="textarea" required value={editing.question} onChange={e=>setEditing({...editing,question:e.target.value})}/></div><div className="field"><label htmlFor="edit-a">Correct answer</label>{editing.options?<select id="edit-a" className="select" value={editing.correctAnswer} onChange={e=>setEditing({...editing,correctAnswer:e.target.value})}>{editing.options.map(o=><option key={o}>{o}</option>)}</select>:<textarea id="edit-a" className="textarea" required value={editing.correctAnswer} onChange={e=>setEditing({...editing,correctAnswer:e.target.value})}/>}</div><div className="field"><label htmlFor="edit-explanation">Explanation</label><textarea id="edit-explanation" className="textarea" value={editing.explanation} onChange={e=>setEditing({...editing,explanation:e.target.value})}/></div><button className="btn btn-primary" disabled={!editing.question.trim()||!editing.correctAnswer.trim()}>Save question</button></form></Modal>}
  </AppLayout>;
}
