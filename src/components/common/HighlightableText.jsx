import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getSelectionOffsets, computeSegments } from '../../utils/textSelection';

export const HIGHLIGHT_COLORS = [
  { id: 'yellow', label: 'Yellow highlight', hex: '#fdea9b' },
  { id: 'green', label: 'Green highlight', hex: '#b9e8b0' },
  { id: 'blue', label: 'Blue highlight', hex: '#b9d8f2' },
  { id: 'pink', label: 'Pink highlight', hex: '#f6c2d9' },
  { id: 'purple', label: 'Purple highlight', hex: '#d7baf4' },
  { id: 'orange', label: 'Orange highlight', hex: '#ffd1a3' },
];

export default function HighlightableText({ text, highlights, onCreate, onDelete }) {
  const containerRef = useRef(null);
  const [picker, setPicker] = useState(null); // { top, left, mode: 'create'|'remove', payload }

  const segments = computeSegments(text, highlights);

  function handleMouseUp() {
    const sel = getSelectionOffsets(containerRef.current);
    if (!sel) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    setPicker({
      mode: 'create',
      top: Math.max(0, sel.rect.top - containerRect.top - 46),
      left: Math.max(0, Math.min(containerRect.width - 156, sel.rect.left - containerRect.left)),
      payload: { start: sel.start, end: sel.end, text: sel.text },
    });
  }

  function handleMarkClick(e, id) {
    e.stopPropagation();
    const containerRect = containerRef.current.getBoundingClientRect();
    const rect = e.target.getBoundingClientRect();
    setPicker({
      mode: 'remove',
      top: rect.top - containerRect.top - 46,
      left: rect.left - containerRect.left,
      payload: { id },
    });
  }

  function choose(colorId) {
    if (picker.mode === 'create') {
      onCreate({ ...picker.payload, color: colorId });
    }
    setPicker(null);
    window.getSelection()?.removeAllRanges();
  }

  function remove() {
    onDelete(picker.payload.id);
    setPicker(null);
  }

  return (
    <div
      ref={containerRef}
      className="extracted-text"
      onMouseUp={handleMouseUp}
      onTouchEnd={() => setTimeout(handleMouseUp, 100)}
      onKeyUp={handleMouseUp}
      style={{ position: 'relative' }}
    >
      {segments.map((seg, i) =>
        seg.color ? (
          <mark
            key={i}
            className={`hl-${seg.color}`}
            onClick={(e) => handleMarkClick(e, seg.id)}
            style={{ cursor: 'pointer' }}
            title="Click to remove this highlight"
          >
            {seg.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        )
      )}

      {picker && (
        <div className="hl-color-picker" style={{ position: 'absolute', top: picker.top, left: picker.left }}>
          {picker.mode === 'create' &&
            HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.id}
                className="hl-swatch"
                style={{ background: c.hex }}
                aria-label={c.label}
                title={c.label}
                onClick={() => choose(c.id)}
              />
            ))}
          {picker.mode === 'remove' && (
            <button className="hl-swatch remove" aria-label="Remove highlight" title="Remove highlight" onClick={remove}>
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
