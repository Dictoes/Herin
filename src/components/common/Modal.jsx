import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, onClose, children, footer, labelledBy }) {
  const ref = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') { const els = [...ref.current.querySelectorAll('button:not([disabled]), input, select, textarea, a[href]')]; const first=els[0], last=els.at(-1); if(e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)){e.preventDefault();last?.focus();} else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();} }
    }
    document.addEventListener('keydown', onKey);
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || 'modal-title'}
        ref={ref}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h3 id={labelledBy || 'modal-title'}>{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
