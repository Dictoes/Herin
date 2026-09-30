import React, { useState, useEffect, useRef, useCallback } from 'react';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return new Date(iso).toLocaleDateString();
}

function isValidText(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return false;
  if (trimmed.length <= 1) return false;
  const lettersAndNumbers = trimmed.match(/[\p{L}\p{N}]/gu);
  if (!lettersAndNumbers || lettersAndNumbers.length < 2) return false;
  return true;
}

export default function AutosavingNoteEditor({ initialContent, onSave, updatedAt, placeholder, ariaLabel }) {
  const [text, setText] = useState(initialContent || '');
  const [saveStatus, setSaveStatus] = useState(''); // 'saving', 'error', ''
  const [lastSavedText, setLastSavedText] = useState(initialContent || '');
  const [lastSavedTime, setLastSavedTime] = useState(updatedAt);

  const timerRef = useRef(null);
  const currentSaveIdRef = useRef(null);
  const latestTextRef = useRef(text);
  latestTextRef.current = text;

  // We rely on 'key' prop to remount when changing pdfs, so initial state is clean.
  // But just in case initialContent is updated from a sync, we don't overwrite user's typing
  // unless we want to. For simplicity, we just manage local text.

  useEffect(() => {
    if (initialContent === '') {
      setText('');
      setLastSavedText('');
      setLastSavedTime(null);
      setSaveStatus('');
      latestTextRef.current = '';
    }
  }, [initialContent]);

  const performSave = useCallback(async (textToSave) => {
    const trimmed = textToSave.trim();
    if (!isValidText(trimmed)) return;
    if (trimmed === lastSavedText) return;

    setSaveStatus('saving');
    const saveId = Symbol();
    currentSaveIdRef.current = saveId;

    try {
      const success = await Promise.resolve(onSave(trimmed));
      
      if (currentSaveIdRef.current !== saveId) {
        return; // A newer save was initiated
      }

      if (success !== false) {
        setLastSavedText(trimmed);
        setLastSavedTime(new Date().toISOString());
        setSaveStatus('');
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      if (currentSaveIdRef.current === saveId) {
        setSaveStatus('error');
      }
    }
  }, [lastSavedText, onSave]);

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    latestTextRef.current = val;

    if (saveStatus === 'error') {
      setSaveStatus('');
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      performSave(latestTextRef.current);
    }, 1000);
  };

  const handleBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    performSave(latestTextRef.current);
  };

  return (
    <>
      <textarea
        className="textarea"
        rows={16}
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      <p className="field-hint" style={{ marginTop: 8 }}>
        {saveStatus === 'saving' && "Saving…"}
        {saveStatus === 'error' && <span style={{color: 'var(--accent-ink)'}}>Unable to save. Please try again.</span>}
        {saveStatus === '' && lastSavedTime && `Saved ${timeAgo(lastSavedTime)}`}
        {saveStatus === '' && !lastSavedTime && "Start writing – changes save automatically."}
      </p>
    </>
  );
}
