import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Trash2,
  AlertTriangle,
  Loader2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import AppLayout from '../components/Layout/AppLayout';
import PDFPage from '../components/common/PDFPage';
import ConfirmDialog from '../components/common/ConfirmDialog';
import HighlightableText, {HIGHLIGHT_COLORS} from '../components/common/HighlightableText';
import { useApp } from '../context/AppContext';
import { loadPdfDocument } from '../utils/pdfUtils';
import { generateClearNotes, generateStudyMaterials } from '../utils/flashcardUtils';
import { processPdf } from '../utils/processPdf';
import StudyNote from '../components/common/StudyNote';
import AIStudyAssistant from '../components/common/AIStudyAssistant';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return new Date(iso).toLocaleDateString();
}

export default function PDFViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const route = useLocation();
  const app = useApp();
  const {
    pdfs,
    updatePdfMeta,
    setExtractedText,
    updateHighlight,
    getPdfFile,
    getExtractedText,
    getNote,
    setNoteContent,
    getHighlights,
    addHighlight,
    deleteHighlight,
    deletePdf,
    pushToast,
    addFlashcard,
    setQuizQuestions,
  } = app;

  const meta = pdfs.find((p) => p.id === id);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.25);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState('notes');
  const [confirmClearNote, setConfirmClearNote] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [genStatus, setGenStatus] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [confirmStructure, setConfirmStructure] = useState(false);
  const [fitWidth, setFitWidth] = useState(true);
  const [deleteHl,setDeleteHl] = useState(null);
  const canvasWrap = useRef(null);
  const highlightToolbar = useRef(null);

  useEffect(() => {
    if (!pdfDoc || !fitWidth || !canvasWrap.current) return;
    let active = true;
    const fit = async () => {
      const page = await pdfDoc.getPage(pageNum);
      if (active && canvasWrap.current) setScale(Math.max(0.1, (canvasWrap.current.clientWidth - 48) / page.getViewport({scale:1}).width));
    };
    const observer = new ResizeObserver(() => { fit().catch(() => {}); });
    observer.observe(canvasWrap.current);
    fit().catch(() => {});
    return () => {active = false; observer.disconnect();};
  }, [pdfDoc, fitWidth, pageNum]);

  const extractedText = getExtractedText(id);
  const note = getNote(id);
  const highlights = getHighlights(id);

  useEffect(() => {
    if (meta?.kind === 'note') setTab('notes');
  }, [id]);

  useEffect(() => {
    let cancelled = false, loaded;
    setPdfDoc(null); setLoadError(false); setPageNum(1);
    if (!meta || meta.kind === 'note') return;
    (async () => {
      try {
        const blob = await getPdfFile(id);
        if (!blob) throw new Error('Missing file');
        loaded = await loadPdfDocument(blob);
        if (cancelled) await loaded.destroy();
        else {setPdfDoc(loaded);setPageNum(Math.min(loaded.numPages, Math.max(1, Number(new URLSearchParams(route.search).get('page')) || 1)));}
      } catch { if (!cancelled) setLoadError(true); }
    })();
    return () => { cancelled = true; loaded?.destroy(); };
  }, [id, getPdfFile, route.search]);

  if (!meta) {
    return (
      <AppLayout title="File not found">
        <p style={{ color: 'var(--ink-soft)' }}>
          This PDF may have been deleted. <Link to="/pdfs">Back to My PDFs</Link>
        </p>
      </AppLayout>
    );
  }

  function processHighlightForStudy(h) { app.generateForHighlight(id,h); }
  function handleCreateHighlight({start,end,text,color}) {
    return addHighlight(id,{start,end,text,color,source:'text'});
  }
  function handleDeleteHighlight(hlId) { setDeleteHl(hlId); }

  async function regenerate() {
    setGenStatus('Reading the complete PDF...');
    try {
      const file = await getPdfFile(id);
      if (!file) throw new Error('Original PDF is missing. Please import it again.');
      const result = await processPdf(file, meta, app, p => setGenStatus(`${p.state === 'reading' ? 'Reading' : 'Preparing'} page ${p.page} of ${p.totalPages}`));
      pushToast(result.summary, result.flashcards.length ? 'success' : 'info');
    } catch (error) { pushToast(error.message, 'error'); }
    finally { setGenStatus(''); }
  }

  return (
    <AppLayout
      title={meta.name}
      subtitle={meta.pageCount ? `${meta.pageCount} page${meta.pageCount === 1 ? '' : 's'}` : undefined}
      actions={
        <>
          <button className="btn btn-secondary" onClick={() => navigate('/pdfs')}>
            <ArrowLeft size={15} /> Back
          </button>
          <button className="btn btn-ghost btn-icon" aria-label="Delete file" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} />
          </button>
        </>
      }
    >
      {meta.kind === 'note' && <div className="field"><label htmlFor="note-title">Note title</label><input id="note-title" className="input" value={meta.name} onChange={e=>updatePdfMeta(id,{name:e.target.value})} /></div>}
      <div className="material-meta"><label htmlFor="subject">Subject</label><input id="subject" className="input" value={meta.subject || ''} placeholder="e.g. Biology" onChange={e=>updatePdfMeta(id, {subject:e.target.value})} />
        {meta.kind !== 'note' && <button className="btn btn-primary" disabled={!!genStatus || meta.status === 'processing'} onClick={regenerate}>{genStatus ? 'Preparing study materials...' : 'Refresh extracted notes'}</button>}
        {meta.kind !== 'note' && <button className="btn btn-secondary" onClick={async()=>{try {const file=await getPdfFile(id); if(!file) throw Error(); const url=URL.createObjectURL(file); const a=document.createElement('a');a.href=url;a.download=meta.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);} catch {pushToast('Original file could not be downloaded.', 'error');}}}>Download original</button>}
      </div>
      {meta.status === 'error' && <div className="import-error" role="alert"><p>{meta.error}</p><button className="btn btn-secondary" disabled={!!genStatus} onClick={regenerate}>Retry extraction</button></div>}
      {genStatus && <p role="status" className="generation-status">{genStatus}</p>}
      {meta.studyDetails && <details className="coverage-report"><summary>{meta.studySummary}</summary><p>Local, text-based study aids. Review answers against the source. Pages without selectable text need manual notes; OCR is not installed.</p><div className="coverage-pages">{meta.studyDetails.coverage?.map(p=><span className={`badge ${p.cards ? 'badge-info' : 'badge-soon'}`} key={p.page}>Page {p.page}: {p.characters} text characters</span>)}</div>{meta.studyWarnings?.map(w=><p key={w}>{w}</p>)}<Link to="/flashcards">Review flashcards</Link> / <Link to="/quiz">Practice quiz</Link></details>}
      {meta.kind !== 'note' && <AIStudyAssistant key={id} meta={meta}/>}
      <div className={`viewer-layout ${meta.kind === 'note' ? 'standalone-layout' : ''}`}>
        {meta.kind !== 'note' && <div className="viewer-panel">
          <div className="viewer-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                className="btn btn-ghost btn-icon"
                disabled={pageNum <= 1}
                onClick={() => setPageNum((n) => Math.max(1, n - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft size={17} />
              </button>
              <span style={{ fontSize: 13, color: 'var(--ink-soft)', minWidth: 90, textAlign: 'center' }}>
                Page {pageNum} of {meta.pageCount || ''}
              </span>
              <button
                className="btn btn-ghost btn-icon"
                disabled={!meta.pageCount || pageNum >= meta.pageCount}
                onClick={() => setPageNum((n) => (meta.pageCount ? Math.min(meta.pageCount, n + 1) : n))}
                aria-label="Next page"
              >
                <ChevronRight size={17} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-secondary btn-sm" aria-pressed={fitWidth} onClick={() => setFitWidth(true)}>Fit width</button>
              <button className="btn btn-ghost btn-icon" aria-label="Zoom out" onClick={() => {setFitWidth(false); setScale((s) => Math.max(0.2, s - 0.15));}}>
                <ZoomOut size={16} />
              </button>
              <button className="btn btn-ghost btn-icon" aria-label="Zoom in" onClick={() => {setFitWidth(false); setScale((s) => Math.min(2.4, s + 0.15));}}>
                <ZoomIn size={16} />
              </button>
            </div>
          </div>
          <div ref={highlightToolbar} className="highlight-toolbar-host"/><div className="viewer-canvas-wrap" ref={canvasWrap}>
            {loadError ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>
                <AlertTriangle size={28} style={{ marginBottom: 10 }} />
                <p>This file couldn't be displayed, but it's still saved in your library.</p>
              </div>
            ) : !pdfDoc ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-faint)' }}>
                <Loader2 size={22} className="spin" style={{ marginBottom: 8 }} />
                <p>Loading document…</p>
              </div>
            ) : (
              <PDFPage toolbarHost={highlightToolbar.current} doc={pdfDoc} pageNum={pageNum} scale={scale} highlights={highlights} onCreate={h => addHighlight(id,h)} />
            )}
          </div>
        </div>}

        <div className="notes-panel">
          <div className="notes-tabs" role="tablist" aria-label="Notes and highlights">
            <button role="tab" aria-selected={tab === 'text'} className={`notes-tab ${tab === 'text' ? 'active' : ''}`} onClick={() => setTab('text')}>
              Extracted text
            </button>
            <button role="tab" aria-selected={tab === 'notes'} className={`notes-tab ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>
              My notes
            </button>
            <button role="tab" aria-selected={tab === 'highlights'} className={`notes-tab ${tab === 'highlights' ? 'active' : ''}`} onClick={() => setTab('highlights')}>
              Highlights ({highlights.length})
            </button>
          </div>

          <div className="notes-tab-body">
            {tab === 'text' && (
              meta.status === 'unreadable' ? (
                <div style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>
                  <AlertTriangle size={18} style={{ marginBottom: 8, color: 'var(--accent-ink)' }} />
                  <p>
                    No readable text was found in this PDF  it's likely a scanned document. The original file is
                    still saved and viewable on the left. You can still write your own notes in the "My notes" tab.
                  </p>
                </div>
              ) : meta.status === 'processing' ? (
                <p style={{ color: 'var(--ink-faint)', fontSize: 13.5 }}>Extracting text from this file…</p>
              ) : !extractedText ? (
                <p style={{ color: 'var(--ink-faint)', fontSize: 13.5 }}>No extracted text is available for this file.</p>
              ) : (
                <>
                  <p className="field-hint" style={{ marginBottom: 10 }}>
                    Highlight a complete definition or explanation to create flashcards and quiz questions automatically. Click a highlight to remove it.
                  </p>
                  <HighlightableText
                    text={typeof extractedText === 'string' ? extractedText : (extractedText?.text || '')}
                    highlights={highlights.filter(h=>h.source !== 'pdf')}
                    onCreate={handleCreateHighlight}
                    onDelete={handleDeleteHighlight}
                  />
                </>
              )
            )}

            {tab === 'notes' && (
              <>
                <div className="note-actions"><button className="btn btn-secondary btn-sm" aria-pressed={editingNote} onClick={()=>setEditingNote(!editingNote)}>{editingNote ? 'Read note' : 'Edit note'}</button>{meta.kind !== 'note' && <button className="btn btn-secondary btn-sm" disabled={!extractedText || !!genStatus} onClick={()=>setConfirmStructure(true)}>Create clearer outline</button>}</div>
                <div className="note-actions"><button className="btn btn-secondary btn-sm" disabled={!note.content} onClick={()=>{const url=URL.createObjectURL(new Blob([note.content],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download=meta.name.replace(/\.pdf$/i,'')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Export note</button><button className="btn btn-ghost btn-sm" disabled={!note.content} onClick={()=>setConfirmClearNote(true)}>Clear note</button></div>
                {editingNote || !note.content ? <textarea
                  className="textarea"
                  rows={16}
                  value={note.content}
                  onChange={(e) => setNoteContent(id, e.target.value)}

                  placeholder="Write your own notes about this file here. They're saved automatically."
                  aria-label="Your notes for this file"
                /> : <StudyNote content={note.content} />}
                <p className="field-hint" style={{ marginTop: 8 }}>
                  {note.updatedAt ? `Saved ${timeAgo(note.updatedAt)}` : 'Start writing  changes save as you type.'}
                </p>
              </>
            )}

            {tab === 'highlights' &&
              (highlights.length === 0 ? (
                <p style={{ color: 'var(--ink-faint)', fontSize: 13.5 }}>
                  No highlights yet. Go to the "Extracted text" tab and select text to highlight it.
                </p>
              ) : (
                [...highlights]
                  .sort((a, b) => a.start - b.start)
                  .map((h) => (
                    <div className={`highlight-item ${h.color}`} key={h.id}>
                      <div className="htext">"{h.text}"</div><input className="input" aria-label={`Comment on highlight ${h.text.slice(0,30)}`} placeholder="Add your explanation…" value={h.comment || ''} onChange={e=>updateHighlight(id,h.id,{comment:e.target.value})} />
                      <div className="hmeta" style={{display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start'}}>
                        {h.generationMessage && <p role="status">{h.generationMessage}</p>}
                        <select className="select" aria-label="Highlight color" value={h.color} onChange={e=>updateHighlight(id,h.id,{color:e.target.value})}>{HIGHLIGHT_COLORS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>
                        <div style={{display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', width: '100%', justifyContent: 'space-between'}}>
                          <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                            <button className="btn btn-secondary btn-sm" onClick={() => processHighlightForStudy(h)}>{h.generationStatus==='error'?'Retry':h.generationStatus==='ready'?'Regenerate':'Generate flashcards'}</button>
                            <span style={{fontSize: '12px'}}>{h.page ? `Page ${h.page} · ` : ''}{timeAgo(h.createdAt)}</span>
                          </div>
                          <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                            {h.page && meta.kind !== 'note' && <button className="btn btn-ghost btn-sm" onClick={()=>setPageNum(h.page)}>Go to page</button>}
                            <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteHighlight(h.id)}>
                              <Trash2 size={13} /> Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
              ))}
          </div>
        </div>
      </div>

      {deleteHl && <ConfirmDialog title="Remove highlight?" message="Remove this mark? Saved study cards are kept with their original source text." onCancel={()=>setDeleteHl(null)} onConfirm={()=>{if(deleteHighlight(id,deleteHl))setDeleteHl(null);}}/>}
      {confirmStructure && <ConfirmDialog title="Replace with a clearer outline?" confirmLabel="Create outline" message="This replaces your current note with page headings, key terms, key points, and recall prompts. Export your edited note first if you want to keep it. The original PDF and highlights stay unchanged." onCancel={()=>setConfirmStructure(false)} onConfirm={()=>{if(setNoteContent(id,generateClearNotes(extractedText,meta.name))){setConfirmStructure(false);setEditingNote(false);pushToast('Study outline saved.','success');}}} />}
      {confirmClearNote && <ConfirmDialog title="Clear this note?" confirmLabel="Clear note" message="The written note will be removed. The PDF and highlights will stay available." onCancel={()=>setConfirmClearNote(false)} onConfirm={()=>{if(setNoteContent(id,''))setConfirmClearNote(false);}} />}
      {confirmDelete && (
        <ConfirmDialog
          title={meta.kind === 'note' ? "Delete this note?" : "Delete this PDF?"}
          message={`"${meta.name}" and its notes and highlights will be permanently removed.`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try { await deletePdf(id); } catch { pushToast('Could not delete material.', 'error'); return; }
            pushToast('File deleted.', 'success');
            navigate('/pdfs');
          }}
        />
      )}
    </AppLayout>
  );
}
