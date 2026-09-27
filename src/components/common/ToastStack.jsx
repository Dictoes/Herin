import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };

export default function ToastStack() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.type] || Info;
        return (
          <div className={`toast ${t.type}`} key={t.id}>
            <Icon size={16} style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>{t.message}</div>
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
