import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NotebookPen, Search, Highlighter, FileText } from 'lucide-react';
import AppLayout from '../components/Layout/AppLayout';
import EmptyState from '../components/common/EmptyState';
import { useApp } from '../context/AppContext';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Notes() {
  const { pdfs, notes, highlights, addStandaloneNote } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const entries = useMemo(() => {
    return pdfs
      .map((p) => {
        const n = notes[p.id];
        const h = highlights[p.id] || [];
        if (p.kind !== 'note' && !n?.content && h.length === 0) return null;
        return { pdf: p, note: n, highlightCount: h.length };
      })
      .filter(Boolean)
      .filter(({ pdf, note }) => {
        const q = query.toLowerCase();
        return `${pdf.name} ${pdf.subject || ''}`.toLowerCase().includes(q) || (note?.content || '').toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.note?.updatedAt || 0) - new Date(a.note?.updatedAt || 0));
  }, [pdfs, notes, highlights, query]);

  return (
    <AppLayout title="Notes" subtitle="Everything you've written and highlighted, in one place" actions={<button className="btn btn-primary" onClick={()=>{const id=addStandaloneNote();navigate(`/pdfs/${id}?notes=1`);}}>New note</button>}>
      {pdfs.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="No notes yet"
          description="Notes are created from your uploaded PDFs. Upload a file first, then open it to start writing and highlighting."
          action={
            <Link to="/pdfs" className="btn btn-primary">
              Go to My PDFs
            </Link>
          }
        />
      ) : entries.length === 0 && !query ? (
        <EmptyState
          icon={NotebookPen}
          title="Nothing written yet"
          description="Open any file in My PDFs to add notes or highlight important parts of the text."
        />
      ) : (
        <>
          <div className="toolbar">
            <div className="search-box">
              <Search size={16} />
              <input
                className="input"
                placeholder="Search notes by content or file name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search notes"
              />
            </div>
          </div>

          {entries.length === 0 ? (
            <EmptyState icon={Search} title="No matching notes" description="Try a different search term." />
          ) : (
            <div className="notes-list">
              {entries.map(({ pdf, note, highlightCount }) => (
                <Link to={`/pdfs/${pdf.id}?notes=1`} className="note-card" key={pdf.id}>
                  <FileText className="icon" size={22} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="title">{pdf.name}</div>{pdf.subject && <span className="subject-label">{pdf.subject}</span>}
                    <div className="preview">
                      {note?.content ? note.content.slice(0, 160) + (note.content.length > 160 ? '…' : '') : 'No written notes yet.'}
                    </div>
                    <div className="stats">
                      <span>
                        <Highlighter size={13} style={{ verticalAlign: -2 }} /> {highlightCount} highlight{highlightCount === 1 ? '' : 's'}
                      </span>
                      {note?.updatedAt && <span>Updated {timeAgo(note.updatedAt)}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
