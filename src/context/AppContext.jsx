import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { storage, uid } from '../utils/storage';
import { savePdfBlob, getPdfBlob, deletePdfBlob } from '../utils/db';
import { sendBrowserNotification } from '../utils/notifications';
import {backgroundPushActive} from '../utils/backgroundPush';
import { classesForDay, toMinutes } from '../utils/scheduleUtils';
import {generateHighlightMaterials} from '../utils/flashcardUtils';
import usePersistedState from '../utils/usePersistedState';
import { flushCloud } from '../utils/cloudStore';
import { highlightPage } from '../utils/highlightPage';

const AppCtx = createContext(null);

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }) {
  const [classes, setClassesState] = usePersistedState(storage.getClasses, storage.setClasses);
  const [pdfs, setPdfsState] = usePersistedState(() => storage.getPdfs().map(p => p.status === 'processing' ? {...p,status:'error',error:'Processing was interrupted. Open this file and retry extraction.'} : p), storage.setPdfs);
  const [notes, setNotesState] = usePersistedState(storage.getNotes, storage.setNotes);
  const [highlights, setHighlightsState] = usePersistedState(storage.getHighlights, storage.setHighlights);
  const [extractedTexts, setExtractedTextsState] = usePersistedState(storage.getExtractedTexts, storage.setExtractedTexts);
  const [settings, setSettingsState] = usePersistedState(storage.getSettings, storage.setSettings);
  const [assignments,setAssignments] = usePersistedState(storage.getAssignments,storage.setAssignments);
  const saveAssignment=useCallback(item=>{const value={...item,id:item.id||uid('task')};return setAssignments(p=>p.some(a=>a.id===value.id)?p.map(a=>a.id===value.id?value:a):[...p,value]);},[]);
  const deleteAssignment=useCallback(id=>setAssignments(p=>p.filter(a=>a.id!==id)),[]);
  const [study, setStudy] = usePersistedState(storage.getStudy, storage.setStudy);
  const flashcards = Array.isArray(study.flashcards) ? study.flashcards : [];
  const quizQuestions = Array.isArray(study.quizQuestions) ? study.quizQuestions : [];
  const addFlashcard = useCallback(card => { const next = { ...card, id: uid('card'), level: 0 }; return setStudy(p => ({...p, flashcards:[...p.flashcards,next]})) ? next : null; }, []);
  const updateFlashcard = useCallback((id, patch) => setStudy(p => ({...p,flashcards:p.flashcards.map(c => c.id === id ? {...c,...patch} : c)})), []);
  const deleteFlashcard = useCallback(id => setStudy(p => ({...p,flashcards:p.flashcards.filter(c => c.id !== id)})), []);
  const updateQuizQuestion=useCallback((id,patch)=>setStudy(p=>({...p,quizQuestions:p.quizQuestions.map(q=>q.id===id?{...q,...patch,edited:true}:q)})),[]);
  const deleteQuizQuestion=useCallback(id=>setStudy(p=>({...p,quizQuestions:p.quizQuestions.filter(q=>q.id!==id)})),[]);
  const setQuizQuestions = useCallback(questions => setStudy(p => ({...p,quizQuestions:[...p.quizQuestions,...questions]})), []);
  const saveStudyMaterials = useCallback((pdfId, result) => setStudy(p => {
    const old = new Map(p.flashcards.filter(c => c.pdfId === pdfId).map(c => [c.id,c]));
    return {...p, flashcards:[...p.flashcards.filter(c => c.pdfId !== pdfId || !c.generated), ...result.flashcards.map(c => ({...c, level: old.get(c.id)?.level || 0, ...(old.get(c.id)?.edited ? old.get(c.id) : {})}))],
      quizQuestions:[...p.quizQuestions.filter(q => q.pdfId !== pdfId || !q.generated),...result.quizQuestions]};
  }), []);
  const appendStudyMaterials = useCallback((pdfId, result) => setStudy(p => {
    const existingFcIds = new Set(p.flashcards.map(c => c.id));
    const newFcs = result.flashcards.filter(c => !existingFcIds.has(c.id)).map(c => ({...c, level: 0}));
    const existingQIds = new Set(p.quizQuestions.map(q => q.id));
    const newQs = result.quizQuestions.filter(q => !existingQIds.has(q.id));
    return { ...p, flashcards: [...p.flashcards, ...newFcs], quizQuestions: [...p.quizQuestions, ...newQs] };
  }), []);
  const [now, setNow] = useState(new Date());
  const [toasts, setToasts] = useState([]);
  const notifiedRef = useRef(new Set()); // keys already reminded today, reset daily


  // clock tick every 15s, plenty for minute-level countdowns
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const pushToast = useCallback((message, type = 'info') => {
    const id = uid('toast');
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.mode = settings.mode === 'system' ? (media.matches ? 'dark' : 'light') : settings.mode;
      document.documentElement.dataset.theme = settings.theme || 'ocean';
    };
    apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.mode, settings.theme]);

  useEffect(() => {
    const fail = () => pushToast('Storage is full or unavailable. Recent changes may not be saved. Export your data from Settings.', 'error');
    window.addEventListener('herin-storage-error', fail);
    const refresh = () => setNow(new Date());
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('herin-storage-error', fail); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [pushToast]);

  // Reminders use this device's local time. Record each occurrence across refreshes.
  // reminder engine: check today's classes each tick
  useEffect(() => {
    if (!settings.notificationsEnabled) return;
    for(const [key,reminder] of Object.entries(storage.getReminders())) {
      if(backgroundPushActive())continue;
      if(reminder.completed || reminder.localNotifiedAt || new Date(reminder.remindAt).getTime()>now.getTime() || notifiedRef.current.has(key))continue;
      notifiedRef.current.add(key);
      // A foreground alert is not task completion; other opted-in devices still need push.
      storage.setReminders({...storage.getReminders(),[key]:{...reminder,localNotifiedAt:now.toISOString()}});
      pushToast(reminder.title,'info');sendBrowserNotification(reminder.title,{tag:key});
    }
    for (let offset = 0; offset <= 1; offset++) {
      const date = new Date(now); date.setDate(date.getDate() + offset);
      classesForDay(classes, date.getDay()).forEach(cls => {
        const [hour, minute] = cls.startTime.split(':').map(Number);
        const start = new Date(date); start.setHours(hour, minute, 0, 0);
        const diff = (start.getTime() - now.getTime()) / 60000;
        const key = `herin:reminder:${cls.id}:${start.getTime()}`;
        let sent = notifiedRef.current.has(key);
        sent ||= !!storage.getReminders()[key]?.completed;
        if (diff <= settings.reminderMinutes && diff >= 0 && !sent) {
          notifiedRef.current.add(key);
          storage.setReminders({...storage.getReminders(),[key]:{title:cls.name,remindAt:start.toISOString(),completed:true,entityId:cls.id,entityType:'class'}});
          const msg = `${cls.name} starts in ${Math.ceil(diff)} min${cls.location ? ' · ' + cls.location : ''}`;
          pushToast(msg, 'info');
          if(!backgroundPushActive())sendBrowserNotification(`Upcoming class: ${cls.name}`, {body:msg,tag:key});
        }
      });
    }
  }, [now, classes, settings.notificationsEnabled, settings.reminderMinutes, pushToast]);

  // ---------- Classes ----------
  const addClass = useCallback((cls) => {
    const newCls = { id: uid('cls'), instructor: '', ...cls };
    return setClassesState((prev) => [...prev, newCls]) ? newCls : null;
  }, []);

  const updateClass = useCallback((id, patch) => {
    return setClassesState((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const deleteClass = useCallback((id) => {
    setAssignments(prev=>prev.map(a=>a.classId===id?{...a,classId:''}:a));
    setPdfsState(prev=>prev.map(p=>p.classId===id?{...p,classId:''}:p));
    return setClassesState((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // ---------- PDFs ----------
  const addPdf = useCallback(async (file) => {
    const id = uid('pdf');
    const meta = {
      id,
      name: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      status: 'processing', // processing | ready | unreadable | error
      hasText: false,
      pageCount: null,
    };
    await savePdfBlob(id, file);
    if (!setPdfsState((prev) => [meta, ...prev])) { await deletePdfBlob(id); throw new Error('Browser storage is full. PDF was not imported.'); }
    await flushCloud();
    return meta;
  }, []);

  const updatePdfMeta = useCallback((id, patch) => {
    return setPdfsState((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const deletePdf = useCallback(async (id) => {
    if (!setStudy(p => ({...p, flashcards:p.flashcards.filter(c=>c.pdfId !== id),quizQuestions:p.quizQuestions.filter(q=>q.pdfId !== id)}))) throw new Error('Could not update study materials.');
    await deletePdfBlob(id);
    setPdfsState((prev) => prev.filter((p) => p.id !== id));
    setNotesState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setHighlightsState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setExtractedTextsState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const getPdfFile = useCallback((id) => getPdfBlob(id), []);

  const addStandaloneNote = useCallback((name = 'Untitled note') => {
    const entry = { id: uid('note'), name, kind: 'note', subject: '', uploadedAt: new Date().toISOString(), status: 'ready' };
    return setPdfsState(prev => [entry, ...prev]) ? entry.id : null;
  }, []);

  // ---------- Notes ----------
  const getNote = useCallback((pdfId) => storage.getNotes()[pdfId] || { content: '', updatedAt: null }, []);

  const setNoteContent = useCallback((pdfId, content) => {
    return setNotesState(prev => ({ ...prev, [pdfId]: { ...prev[pdfId], content, updatedAt: new Date().toISOString() } }));
  }, []);

  // The immutable text snapshot highlights are anchored to (set once,
  // when the PDF finishes processing).
  const getExtractedText = useCallback((pdfId) => extractedTexts[pdfId] || '', [extractedTexts]);

  const setExtractedText = useCallback((pdfId, text) => {
    return setExtractedTextsState((prev) => ({ ...prev, [pdfId]: text }));
  }, []);

  // ---------- Highlights ----------
  const getHighlights = useCallback((pdfId) => highlights[pdfId] || [], [highlights]);

  const generateForHighlight = useCallback((pdfId, hl) => {
    const live = (storage.getHighlights()[pdfId] || []).find(h=>h.id===hl.id);
    if (!live) return false;
    const meta = storage.getPdfs().find(p=>p.id===pdfId);
    if (!meta) return false;
    try {
      const page = highlightPage(live,storage.getExtractedTexts()[pdfId]);
      const result = generateHighlightMaterials({...live,page},meta);
      const saved = setStudy(p=>{
        const old = new Map(p.flashcards.map(c=>[c.id,c]));
        return {...p,flashcards:[...p.flashcards.filter(c=>c.highlightId!==hl.id || c.edited),...result.flashcards.filter(c=>!old.get(c.id)?.edited).map(c=>({...c,level:old.get(c.id)?.level||0,dueAt:old.get(c.id)?.dueAt}))],quizQuestions:[...p.quizQuestions.filter(q=>q.highlightId!==hl.id || q.edited),...result.quizQuestions.filter(q=>!p.quizQuestions.some(old=>old.id===q.id && old.edited))]};
      });
      if (!saved) throw Error('Study materials could not be saved. Free browser storage and retry.');
      setHighlightsState(p=>({...p,[pdfId]:(p[pdfId]||[]).map(h=>h.id===hl.id?{...h,page,generationStatus:result.flashcards.length?'ready':'empty',generationMessage:result.message}:h)}));
      pushToast(result.message,result.flashcards.length?'success':'info');
      return true;
    } catch(error) {
      setHighlightsState(p=>({...p,[pdfId]:(p[pdfId]||[]).map(h=>h.id===hl.id?{...h,generationStatus:'error',generationMessage:error.message}:h)}));
      pushToast(error.message,'error');return false;
    }
  },[pushToast]);
  const addHighlight = useCallback((pdfId, hl) => {
    const entry = {...hl,page:highlightPage(hl,storage.getExtractedTexts()[pdfId]),id:uid('hl'),createdAt:new Date().toISOString(),generationStatus:'processing'};
    if (!setHighlightsState(p=>({...p,[pdfId]:[...(p[pdfId]||[]),entry]}))) return null;
    generateForHighlight(pdfId,entry);
    return entry;
  },[generateForHighlight]);

  const updateHighlight = useCallback((pdfId, hlId, patch) => {
    return setHighlightsState((prev) => ({
      ...prev,
      [pdfId]: (prev[pdfId] || []).map((h) => (h.id === hlId ? { ...h, ...patch } : h)),
    }));
  }, []);

  const deleteHighlight = useCallback((pdfId, hlId) => {
    return setHighlightsState((prev) => ({
      ...prev,
      [pdfId]: (prev[pdfId] || []).filter((h) => h.id !== hlId),
    }));
  }, []);

  // ---------- Settings ----------
  const updateSettings = useCallback((patch) => {
    setSettingsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearAllData = useCallback(async () => {
    for (const p of pdfs) {
      await deletePdfBlob(p.id);
    }
    storage.clearAll();
    setClassesState([]);
    setPdfsState([]);
    setNotesState({});
    setHighlightsState({});
    setExtractedTextsState({});
    setSettingsState(storage.getSettings());
    setStudy({flashcards:[],quizQuestions:[]});
    setAssignments([]);
    await flushCloud();
  }, [pdfs]);

  const value = useMemo(
    () => ({
      now,
      classes,
      assignments,saveAssignment,deleteAssignment,
      addClass,
      updateClass,
      deleteClass,
      pdfs,
      addPdf,
      updatePdfMeta,
      deletePdf,
      getPdfFile,
      notes,
      addStandaloneNote,
      getNote,
      setNoteContent,
      getExtractedText,
      setExtractedText,
      highlights,
      getHighlights,
      addHighlight,
      generateForHighlight,
      updateHighlight,
      deleteHighlight,
      settings,
      updateSettings,
      toasts,
      pushToast,
      dismissToast,
      clearAllData,
      flashcards, addFlashcard, updateFlashcard, deleteFlashcard,
      quizQuestions, setQuizQuestions, updateQuizQuestion, deleteQuizQuestion,
      saveStudyMaterials, appendStudyMaterials,
    }),
    [
      now,
      classes,
      assignments,saveAssignment,deleteAssignment,
      addClass,
      updateClass,
      deleteClass,
      pdfs,
      addPdf,
      updatePdfMeta,
      deletePdf,
      getPdfFile,
      notes,
      addStandaloneNote,
      getNote,
      setNoteContent,
      getExtractedText,
      setExtractedText,
      highlights,
      getHighlights,
      addHighlight,
      generateForHighlight,
      updateHighlight,
      deleteHighlight,
      settings,
      updateSettings,
      toasts,
      pushToast,
      dismissToast,
      clearAllData,
      flashcards, addFlashcard, updateFlashcard, deleteFlashcard,
      quizQuestions, setQuizQuestions, updateQuizQuestion, deleteQuizQuestion,
      saveStudyMaterials, appendStudyMaterials,
    ]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
