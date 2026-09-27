import React, { useEffect, useRef, useState } from 'react';
import {createPortal} from 'react-dom';
import { TextLayer } from 'pdfjs-dist';
import { HIGHLIGHT_COLORS } from './HighlightableText';

export default function PDFPage({ doc, pageNum, scale, highlights, onCreate, toolbarHost }) {
  const host = useRef(null);
  const [selection, setSelection] = useState(null);
  const [color,setColor] = useState('yellow');
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false, render, layer;
    const container = host.current;
    container.replaceChildren(); setSelection(null); setError('');
    (async () => {
      try {
        const page = await doc.getPage(pageNum);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        container.style.width = `${viewport.width}px`; container.style.height = `${viewport.height}px`;
        container.style.setProperty('--scale-factor', scale);
        container.append(canvas);
        render = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        await render.promise;
        const content = await page.getTextContent();
        if (cancelled) return;
        const textDiv = document.createElement('div'); textDiv.className = 'pdf-text-layer'; container.append(textDiv);
        layer = new TextLayer({ textContentSource: content, container: textDiv, viewport });
        await layer.render();
      } catch (e) { if (!cancelled && e.name !== 'RenderingCancelledException') setError('Unable to render this page. Try another page or reopen the file.'); }
    })();
    return () => { cancelled = true; render?.cancel(); layer?.cancel(); };
  }, [doc, pageNum, scale]);

  function capture() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !host.current?.contains(sel.anchorNode) || !host.current.contains(sel.focusNode)) return;
    const range = sel.getRangeAt(0), bounds = host.current.getBoundingClientRect();
    const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0).map(r => ({ x: (r.left-bounds.left)/bounds.width, y:(r.top-bounds.top)/bounds.height, w:r.width/bounds.width, h:r.height/bounds.height }));
    if (sel.toString().trim() && rects.length) setSelection({text:sel.toString(), rects});
  }
  const toolbar = <div className="pdf-highlight-tools" aria-label="PDF highlight colors"><span>{selection ? 'Highlight selection:' : 'Select PDF text, then choose a color'}</span>{HIGHLIGHT_COLORS.map(c => <button key={c.id} disabled={!selection} className="hl-swatch" aria-pressed={color===c.id} title={c.label} style={{background:c.hex}} aria-label={`PDF ${c.label}`} onPointerDown={e=>e.preventDefault()} onMouseDown={e=>e.preventDefault()} onClick={() => { setColor(c.id); if(onCreate({ ...selection, page:pageNum, source:'pdf', color:c.id })){setSelection(null); window.getSelection()?.removeAllRanges();} }} />)}</div>;
  return <div className="pdf-page-area">{toolbarHost?createPortal(toolbar,toolbarHost):toolbar}
    {error && <p role="alert">{error}</p>}
    <div className="pdf-page" onMouseUp={capture} onTouchEnd={() => setTimeout(capture, 100)} onKeyUp={capture}>
      <div ref={host} className="pdf-render" />
      <div className="pdf-overlay">{highlights.filter(h=>h.source==='pdf' && h.page===pageNum).flatMap(h=>(h.rects||[]).map((r,i)=><div key={h.id+i} style={{position:'absolute',left:`${r.x*100}%`,top:`${r.y*100}%`,width:`${r.w*100}%`,height:`${r.h*100}%`,background:`var(--hl-${h.color})`,opacity:.48}} />))}</div>
    </div>
  </div>;
}
