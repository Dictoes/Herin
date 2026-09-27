import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { UploadCloud, Search, FileText, Trash2, MoreVertical, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import AppLayout from '../components/Layout/AppLayout';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useApp } from '../context/AppContext';
import {validatePdf} from '../utils/validatePdf';
import { processPdf } from '../utils/processPdf';

const STATUS_META = {
  processing: { label: 'Processing', icon: Loader2, cls: 'badge-info' },
  ready: { label: 'Ready', icon: CheckCircle2, cls: 'badge-live' },
  unreadable: { label: 'Scanned / no text', icon: AlertTriangle, cls: 'badge-soon' },
  error: { label: 'Upload error', icon: AlertTriangle, cls: 'badge-danger' },
};

function formatSize(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PDFLibrary() {
  const app = useApp();
  const { pdfs, addPdf, deletePdf, pushToast } = app;
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [dragging, setDragging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    return pdfs.filter((p) => p.kind !== 'note').filter((p) => {
      const matchesQuery = `${p.name} ${p.subject || ''}`.toLowerCase().includes(query.toLowerCase());
      const matchesFilter = filter === 'all' || p.status === filter;
      return matchesQuery && matchesFilter;
    });
  }, [pdfs, query, filter]);

  async function processFile(file, meta) {
    try {
      const result = await processPdf(file, meta, app);
      pushToast(result.summary,'success');
    } catch (err) {
      pushToast(err.message, 'error');
    }
  }

  async function handleFiles(fileList) {
    if (busy) { pushToast('Please wait for the current import to finish.', 'info'); return; }
    setBusy(true);
    const files = Array.from(fileList);
    for (const file of files) {
      try {
        await validatePdf(file);
        const meta = await addPdf(file);
        await processFile(file, meta);
      } catch (error) { pushToast(error.message || 'Could not save PDF. Check your connection and retry.', 'error'); }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <AppLayout
      title="My PDFs"
      subtitle="Your readings, organized into notes and study practice"
      actions={
        <button disabled={busy} className="btn btn-primary" onClick={() => inputRef.current?.click()}>
          <UploadCloud size={16} /> Upload PDF
        </button>
      }
    >
      <div
        className={`upload-drop ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <UploadCloud size={26} style={{ marginBottom: 8, color: 'var(--primary)' }} />
        <p style={{ fontWeight: 600, color: 'var(--ink)' }}>Drag and drop a PDF here</p>
        <p style={{ fontSize: 13, marginTop: 4 }}>or</p>
        <button disabled={busy} className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => inputRef.current?.click()}>
          Choose a file
        </button>
        <input
          ref={inputRef}
          type="file"
          disabled={busy}
          accept="application/pdf,.pdf"
          multiple
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <p className="field-hint" style={{ marginTop: 10 }}>Up to 60 MB. Notes, flashcards, and quizzes are prepared automatically from every readable page.</p>
      </div>

      {pdfs.filter(p=>p.kind !== 'note').length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No PDFs yet"
          description="Upload lecture slides, readings, or handouts. Herin will try to pull out the text so you can turn it into editable notes."
        />
      ) : (
        <>
          <div className="toolbar">
            <div className="search-box">
              <Search size={16} />
              <input
                className="input"
                placeholder="Search your files by name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search PDFs"
              />
            </div>
            <div className="filter-chips">
              {['all', 'ready', 'processing', 'unreadable', 'error'].map((f) => (
                <button
                  key={f}
                  className={`chip ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : STATUS_META[f].label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={Search} title="No matching files" description="Try a different search term or filter." />
          ) : (
            <div className="pdf-grid">
              {filtered.map((p) => {
                const meta = STATUS_META[p.status] || STATUS_META.processing;
                const StatusIcon = meta.icon;
                return (
                  <div className="pdf-card" key={p.id}>
                    <div className="pdf-card-menu">
                      <button
                        className="btn btn-ghost btn-icon"
                        aria-label={`More actions for ${p.name}`}
                        onClick={() => setMenuOpenFor(menuOpenFor === p.id ? null : p.id)}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {menuOpenFor === p.id && (
                        <div
                          className="card"
                          style={{ position: 'absolute', right: 0, top: 32, padding: 6, minWidth: 140, zIndex: 20, boxShadow: 'var(--shadow-2)' }}
                        >
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--danger)' }}
                            onClick={() => { setMenuOpenFor(null); setConfirmDelete(p); }}
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                    <Link to={`/pdfs/${p.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'contents' }}>
                      <div className="pdf-thumb">
                        <FileText size={30} strokeWidth={1.5} />
                      </div>
                      <div className="pdf-name">{p.name}</div>
                    </Link>
                    <div className="pdf-meta">
                      <span>{formatDate(p.uploadedAt)} · {formatSize(p.size)}</span>
                    </div>
                    <span className={`badge ${meta.cls}`}>
                      <StatusIcon size={12} className={p.status === 'processing' ? 'spin' : ''} /> {meta.label}
                    </span>
                    {p.subject && <span className="subject-label">{p.subject}</span>}
                    {p.status === 'processing' && <progress aria-label="PDF processing progress" value={p.progress || 0} max="100" />}
                    {p.stage && <p className="field-hint" role="status">{p.stage}</p>}
                    {p.studyDetails && <p className="field-hint">{p.studyDetails.pagesRead} pages processed / {p.studyDetails.flashcardsGenerated} cards</p>}
                    {p.error && <p className="field-error">{p.error}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this PDF?"
          message={`"${confirmDelete.name}" and its notes and highlights will be permanently removed.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            try { await deletePdf(confirmDelete.id); } catch { pushToast('Could not delete file.', 'error'); return; }
            pushToast('File deleted.', 'success');
            setConfirmDelete(null);
          }}
        />
      )}
    </AppLayout>
  );
}
