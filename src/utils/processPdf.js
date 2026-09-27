import { loadPdfDocument, extractTextFromPdf } from './pdfUtils';
import { generateClearNotes } from './flashcardUtils';
import { storage } from './storage';

export async function processPdf(file, meta, app, onProgress = () => {}) {
  let doc;
  const requireSaved = ok => { if (!ok) throw new Error('Browser storage is full or unavailable. Free space or export your data, then retry.'); };
  const requirePresent = () => { if (!storage.getPdfs().some(p=>p.id===meta.id)) throw new Error('Processing stopped because this PDF was removed.'); };
  try {
    requireSaved(app.updatePdfMeta(meta.id, {status:'processing',error:null,progress:0,stage:'Reading PDF'}));
    doc = await loadPdfDocument(file);
    const extracted = await extractTextFromPdf(doc, progress => {
      app.updatePdfMeta(meta.id, {progress:Math.round(progress.page / progress.totalPages * 65),stage:`Reading page ${progress.page} of ${progress.totalPages}`});
      onProgress(progress);
    });
    const data = {...extracted,text:extracted.pages.map(p=>p.text).join('\n\n')};
    requirePresent();
    requireSaved(app.setExtractedText(meta.id, data));
    const result = {notes:generateClearNotes(data,meta.name),flashcards:[],quizQuestions:[],summary:`Read ${doc.numPages} pages. Highlight lesson text to create flashcards and quizzes.`,details:{pagesRead:doc.numPages,coverage:extracted.pages.map(p=>({page:p.pageNum,characters:p.text.length,cards:0}))},warnings:extracted.pages.filter(p=>!p.text.trim()).map(p=>`Page ${p.pageNum}: no selectable text; add manual notes.`)};
    // Existing user notes are never overwritten by retries or regeneration.
    requirePresent();
    if (!app.getNote(meta.id).content) requireSaved(app.setNoteContent(meta.id, result.notes));
    const stored = await app.getPdfFile(meta.id);
    if (!stored || stored.size !== file.size) throw new Error('The saved original PDF could not be verified. Please reimport it.');
    requireSaved(app.updatePdfMeta(meta.id, {status:extracted.hasText?'ready':'unreadable',hasText:extracted.hasText,pageCount:doc.numPages,progress:100,stage:null,error:null,studySummary:result.summary,studyDetails:result.details,studyWarnings:result.warnings}));
    return result;
  } catch (error) {
    const message = error.name === 'PasswordException' ? 'Password-protected PDF. Upload an unlocked copy.' : error.name === 'InvalidPDFException' ? 'This PDF is damaged or invalid. Upload an undamaged copy.' : error.message || 'Processing failed. Reopen this PDF and retry.';
    app.updatePdfMeta(meta.id, {status:'error',error:message,stage:null});
    throw new Error(message);
  } finally { if (doc) await doc.destroy(); }
}
