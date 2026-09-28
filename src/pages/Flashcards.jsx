import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Pencil, Trash2, Search, Shuffle } from 'lucide-react';
import AppLayout from '../components/Layout/AppLayout';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Modal from '../components/common/Modal';
import { useApp } from '../context/AppContext';

export default function Flashcards() {
  const { flashcards, pdfs, updateFlashcard, deleteFlashcard, pushToast } = useApp();
  const [query,setQuery] = useState('');
  const [params] = useSearchParams();
  const [source,setSource] = useState(params.get('pdf')||'');
  const [page,setPage] = useState(0);
  const [revealed,setRevealed] = useState({});
  const [editing,setEditing] = useState(null);
  const [deleting,setDeleting] = useState(null);
  const [shuffled,setShuffled] = useState(false);
  const [order, setOrder] = useState([]);

  const displayList = useMemo(() => {
    let list = flashcards.filter(c=>(!source || c.pdfId === source) && `${c.question} ${c.answer} ${c.subject} ${(c.tags||[]).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
    if (shuffled) {
      return [...list].sort((a,b) => (order.indexOf(a.id) > -1 ? order.indexOf(a.id) : 999) - (order.indexOf(b.id) > -1 ? order.indexOf(b.id) : 999));
    }
    return list;
  }, [flashcards, source, query, shuffled, order]);

  const toggleShuffle = () => {
    if (!shuffled) {
      setOrder(flashcards.map(c=>c.id).sort(() => Math.random() - 0.5));
    }
    setShuffled(!shuffled);
    setPage(0);
  };

  const currentPage = Math.min(page, Math.max(0,displayList.length-1));

  return <AppLayout title="Flashcards" subtitle={`${flashcards.length} cards / ${flashcards.filter(c=>c.reviews > 0).length} reviewed`} actions={<Link className="btn btn-primary" to="/quiz">Practice quiz</Link>}>
    {!flashcards.length ? <EmptyState icon={BookOpen} title="Your next study session starts here" description="Open a PDF and highlight a complete lesson idea. Cards and questions are saved automatically." action={<Link to="/pdfs" className="btn btn-primary">Import PDF</Link>} /> : <>
      <div className="toolbar"><div className="search-box"><Search size={16}/><input className="input" aria-label="Search flashcards" placeholder="Search concepts or answers" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></div><select className="select source-filter" aria-label="Flashcard document" value={source} onChange={e=>{setSource(e.target.value);setPage(0);}}><option value="">All documents</option>{pdfs.filter(p=>p.kind !== 'note').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className={`btn ${shuffled ? 'btn-primary' : 'btn-secondary'}`} onClick={toggleShuffle} title="Shuffle mode"><Shuffle size={16}/></button></div>
      {!displayList.length && <EmptyState icon={Search} title="No matching cards" description="Try another document or search."/>}
      <p className="study-position">Card {displayList.length?currentPage+1:0} of {displayList.length}</p><div className="study-grid">{displayList.slice(currentPage,currentPage+1).map(c=><section className="card study-card gizmo-card" key={c.id}>
        <div className="study-card-meta"><span className="badge badge-info">Page {c.sourcePage || '-'}</span><span>{c.subject}</span>{c.level>0 && <span className="badge badge-live">{c.rating||'Reviewed'}</span>}</div>
        
        <div className={`flip-container ${revealed[c.id] ? 'flipped' : ''}`}>
          <div className="flip-inner">
            <button className="flip-front" tabIndex={revealed[c.id]?-1:0} aria-hidden={!!revealed[c.id]} onClick={()=>setRevealed(p=>({...p,[c.id]:true}))} aria-label="Tap to reveal answer">
              <h2>{c.question}</h2>
              <span className="flip-hint">Tap to reveal answer</span>
            </button>
            <div className="flip-back" inert={revealed[c.id]?undefined:''} aria-hidden={!revealed[c.id]}>
              <p className="study-answer-text">{c.answer}</p>
              {c.explanation && <p className="study-explanation">{c.explanation}</p>}
              <div className="note-actions">
                <button className="btn btn-ghost btn-sm" onClick={()=>{updateFlashcard(c.id,{level:0,rating:'Again',reviews:(c.reviews||0)+1,dueAt:new Date(Date.now()+600000).toISOString()});setRevealed(p=>({...p,[c.id]:false}));}}>Again</button>
                <button className="btn btn-secondary btn-sm" onClick={()=>{updateFlashcard(c.id,{level:(c.level||0)+1,rating:'Hard',reviews:(c.reviews||0)+1,dueAt:new Date(Date.now()+86400000).toISOString()});setRevealed(p=>({...p,[c.id]:false}));}}>Hard</button>
                <button className="btn btn-secondary btn-sm" onClick={()=>{updateFlashcard(c.id,{level:(c.level||0)+2,rating:'Good',reviews:(c.reviews||0)+1,dueAt:new Date(Date.now()+259200000).toISOString()});setRevealed(p=>({...p,[c.id]:false}));}}>Good</button>
                <button className="btn btn-primary btn-sm" onClick={()=>{updateFlashcard(c.id,{level:(c.level||0)+3,rating:'Easy',reviews:(c.reviews||0)+1,dueAt:new Date(Date.now()+604800000).toISOString()});setRevealed(p=>({...p,[c.id]:false}));}}>Easy</button>
              </div>
            </div>
          </div>
        </div>
        
        <details className="study-source"><summary>Highlighted source</summary><p>{c.sourceText}</p></details><div className="study-card-footer">{c.pdfId && <Link to={`/pdfs/${c.pdfId}?page=${c.sourcePage||1}`}>Open source</Link>}<div><button className="btn btn-ghost btn-icon" aria-label="Edit flashcard" title="Edit flashcard" onClick={()=>setEditing({...c})}><Pencil size={16}/></button><button className="btn btn-ghost btn-icon" aria-label="Delete flashcard" title="Delete flashcard" onClick={()=>setDeleting(c)}><Trash2 size={16}/></button></div></div>
      </section>)}</div>
      {displayList.length>1 && <div className="pagination"><button className="btn btn-secondary" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>Previous</button><span>Card {currentPage+1} of {displayList.length}</span><button className="btn btn-secondary" disabled={currentPage+1>=displayList.length} onClick={()=>setPage(currentPage+1)}>Next</button></div>}
    </>}
    {deleting && <ConfirmDialog title="Delete flashcard?" message="This card and its review progress will be removed. The PDF and note are kept." onCancel={()=>setDeleting(null)} onConfirm={()=>{if(deleteFlashcard(deleting.id))setDeleting(null);}}/>}
    {editing && <Modal title="Edit flashcard" onClose={()=>setEditing(null)}><form onSubmit={e=>{e.preventDefault();if(updateFlashcard(editing.id,{question:editing.question.trim(),answer:editing.answer.trim(),subject:editing.subject,tags:editing.tags||[],edited:true})){setEditing(null);pushToast('Flashcard saved.','success');}}}><div className="field"><label htmlFor="card-question">Question</label><textarea id="card-question" required className="textarea" value={editing.question} onChange={e=>setEditing({...editing,question:e.target.value})}/></div><div className="field"><label htmlFor="card-answer">Answer</label><textarea id="card-answer" required className="textarea" value={editing.answer} onChange={e=>setEditing({...editing,answer:e.target.value})}/></div><div className="field"><label htmlFor="card-tags">Tags, separated by commas</label><input id="card-tags" className="input" value={(editing.tags||[]).join(', ')} onChange={e=>setEditing({...editing,tags:e.target.value.split(',').map(t=>t.trim())})}/></div><button className="btn btn-primary" disabled={!editing.question.trim() || !editing.answer.trim()}>Save changes</button></form></Modal>}
  </AppLayout>;
}
