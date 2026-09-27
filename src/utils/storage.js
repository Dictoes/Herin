import { cloudActive, cloudRead, cloudWrite } from './cloudStore';
// Supabase workspace access, with legacy local storage retained for explicit import.
// Every read is defensive: bad/missing JSON never crashes the app, it just
// falls back to an empty collection so a fresh visitor sees empty states.

const KEYS = {
  classes: 'studydesk:classes',
  pdfs: 'studydesk:pdfs',
  notes: 'studydesk:notes',
  highlights: 'studydesk:highlights',
  settings: 'studydesk:settings',
  extractedTexts: 'studydesk:extractedTexts',
  study: 'herin:study',
  quizSession:'herin:quizSession',
  assignments:'herin:assignments',
  reminders:'herin:reminders',
};

function read(key, fallback) {
  if (cloudActive()) return cloudRead(Object.keys(KEYS).find(k=>KEYS[k]===key),fallback);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  if (cloudActive()) return cloudWrite(Object.keys(KEYS).find(k=>KEYS[k]===key),value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    window.dispatchEvent(new Event("herin-storage-error"));
    return false;
  }
}

export const storage = {
  KEYS,
  getReminders:()=>read(KEYS.reminders,{}),
  setReminders:v=>write(KEYS.reminders,v),
  getQuizSession:()=>read(KEYS.quizSession,{source:'',type:'',index:0,answer:'',status:null,score:0}),
  setQuizSession:v=>write(KEYS.quizSession,v),
  getAssignments:()=>read(KEYS.assignments,[]),
  setAssignments:v=>write(KEYS.assignments,v),
  getStudy: () => {
    const data = read(KEYS.study, { flashcards: read('herin:flashcards', []), quizQuestions: read('herin:quizQuestions', []) });
    return {flashcards:Array.isArray(data.flashcards)?data.flashcards:[],quizQuestions:Array.isArray(data.quizQuestions)?data.quizQuestions:[]};
  },
  setStudy: (v) => write(KEYS.study, v),
  getClasses: () => read(KEYS.classes, []),
  setClasses: (v) => write(KEYS.classes, v),

  getPdfs: () => read(KEYS.pdfs, []),
  setPdfs: (v) => write(KEYS.pdfs, v),

  getNotes: () => read(KEYS.notes, {}),
  setNotes: (v) => write(KEYS.notes, v),

  getHighlights: () => read(KEYS.highlights, {}),
  setHighlights: (v) => write(KEYS.highlights, v),

  // Immutable snapshot of extracted text per PDF, used as the stable
  // coordinate system for highlight offsets even after the user edits
  // their own editable notes copy.
  getExtractedTexts: () => read(KEYS.extractedTexts, {}),
  setExtractedTexts: (v) => write(KEYS.extractedTexts, v),

  getSettings: () =>
    ({ notificationsEnabled: false, reminderMinutes: 15, permissionAsked: false, mode: 'system', theme: 'ocean', displayName: '', ...read(KEYS.settings, {}) }),
  setSettings: (v) => write(KEYS.settings, v),

  exportAll: () => ({
    classes: read(KEYS.classes, []),
    pdfsMeta: read(KEYS.pdfs, []),
    notes: read(KEYS.notes, {}),
    highlights: read(KEYS.highlights, {}),
    extractedTexts: read(KEYS.extractedTexts, {}),
    settings: read(KEYS.settings, {}),
    study: storage.getStudy(),
    quizSession:storage.getQuizSession(),
    assignments:storage.getAssignments(),
    reminders:storage.getReminders(),
    exportedAt: new Date().toISOString(),
  }),

  clearAll: () => {
    if (cloudActive()) { for (const [key,value] of Object.entries({classes:[],pdfs:[],notes:{},highlights:{},extractedTexts:{},settings:{},study:{flashcards:[],quizQuestions:[]},quizSession:{},assignments:[],reminders:{}})) cloudWrite(key,value); return; }
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem('herin:flashcards');
    localStorage.removeItem('herin:quizQuestions');
  },
};

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
