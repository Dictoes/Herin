import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Link, useNavigate, useSearchParams} from 'react-router-dom';
import {ArrowUp, BookOpen, Check, RotateCw, Sparkles, X} from 'lucide-react';
import AppLayout from '../components/Layout/AppLayout';
import {useApp} from '../context/AppContext';
import Yuki from '../components/common/Yuki';
import {buildAskContext, flattenPages} from '../utils/askHerinContext';
import {buildAskRequest} from '../utils/askHerinRequest';
import {supabase} from '../lib/supabase';

const QUICK_PROMPTS = [
  'Explain a key idea from my material',
  'What are the main points of my notes?',
  'Help me understand this highlight',
];

export default function AskHerin() {
  const app = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialPdfId = params.get('pdf') || '';
  const pageHint = Number(params.get('page'));
  const [pdfId,setPdfId] = useState(initialPdfId);
  const [input,setInput] = useState('');
  const [messages,setMessages] = useState([]);
  const [selectedHighlightIds,setSelectedHighlightIds] = useState(new Set());
  const [status,setStatus] = useState('idle');
  const [error,setError] = useState('');
  const listRef = useRef(null);
  const requestRef = useRef(false);
  const retryRef = useRef(null);
  const inputRef = useRef(null);
  const busy = status === 'loading';
  const pdfs = app.pdfs || [];
  const notes = useMemo(() => Object.entries(app.notes || {}).flatMap(([notePdfId,note]) => note ? [{...note,pdfId:notePdfId}] : []),[app.notes]);
  const highlights = useMemo(() => Object.entries(app.highlights || {}).flatMap(([highlightPdfId,items]) => (items || []).map(item => ({...item,pdfId:highlightPdfId}))),[app.highlights]);
  const currentPdf = pdfs.find(item => item.id === pdfId);
  const relevantHighlights = highlights.filter(item => item.pdfId === pdfId);

  useEffect(() => {
    if (initialPdfId && pdfs.some(item => item.id === initialPdfId)) setPdfId(initialPdfId);
  },[initialPdfId,pdfs]);

  useEffect(() => {
    if (pdfId) setSelectedHighlightIds(new Set(highlights.filter(item => item.pdfId === pdfId).map(item => item.id)));
    else setSelectedHighlightIds(new Set());
  },[pdfId,highlights]);

  useEffect(() => {
    if (pageHint > 0 && currentPdf && inputRef.current) inputRef.current.focus({preventScroll:true});
  },[currentPdf,pageHint]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  },[messages,status]);

  const contextFor = useCallback(question => buildAskContext({
    question,
    pdfId,
    pdfs,
    extractedText:pdfId ? app.getExtractedText(pdfId) : '',
    notes,
    highlights,
    selectedHighlightIds,
    preferredPage:[...messages].reverse().find(message=>message.role==='assistant' && message.sourcePages?.length===1)?.sourcePages[0] || pageHint,
  }),[pdfId,pdfs,app.getExtractedText,notes,highlights,selectedHighlightIds,pageHint,messages]);

  const sendQuestion = useCallback(async (question, retry = false) => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || busy || requestRef.current) return;
    requestRef.current = true;
    const previous = retry ? messages.slice(0,-1) : messages;
    const next = retry ? messages : [...messages,{role:'user',text:cleanQuestion}];
    const body = retry && retryRef.current ? retryRef.current : buildAskRequest({question:cleanQuestion,history:previous,context:contextFor(cleanQuestion)});
    const context = body.context;
    let guidance = '';
    if (!currentPdf) guidance = 'Choose a PDF or note before asking about its contents.';
    else if (!context.length) {
      const hasText = flattenPages(app.getExtractedText(pdfId)).some(page=>page.text.trim()) || notes.some(note=>note.pdfId===pdfId && (note.content || note.text || '').trim());
      const requestedPage = cleanQuestion.match(/\bpage\s+(\d+)\b/i)?.[1];
      guidance = requestedPage ? `I could not read extracted text for page ${requestedPage}. Please check that page or share its text.` : !hasText ? 'I could not read text from this material. It may be scanned or not yet extracted. Open the document to process it, or add readable notes.' : 'I could not find supporting text for that question in the selected material. Which concept or snippet would you like clarified?';
    }
    if (guidance) {
      setMessages([...next,{role:'assistant',text:guidance,pdfId,sourcePages:[],excerptCount:0}]);
      setInput(''); setError(''); setStatus('idle'); requestRef.current=false;
      return;
    }
    retryRef.current = body;
    setMessages(next);
    setInput('');
    setError('');
    setStatus('loading');
    try {
      const {data,error:invokeError} = await supabase.functions.invoke('generate-study-content',{
        body,
      });
      if (invokeError) {
        const detail = await invokeError.context?.json?.().catch(() => null);
        throw new Error(detail?.message || detail?.error || invokeError.message);
      }
      if (!data?.success || typeof data.answer !== 'string' || !Array.isArray(data.sourcePages)) {
        throw new Error('Herin could not return a complete answer. Please retry.');
      }
      setMessages([...next,{role:'assistant',text:data.answer,sourcePages:data.sourcePages.filter(page => context.some(source => source.page === page)),pdfId,excerptCount:context.length}]);
      setStatus('idle');
    } catch (cause) {
      setError(cause?.message || 'Something went wrong while asking Herin.');
      setStatus('error');
    } finally {
      requestRef.current = false;
    }
  },[contextFor,busy,messages,pdfId,currentPdf,app.getExtractedText,notes]);

  const lastQuestion = useMemo(() => [...messages].reverse().find(item => item.role === 'user')?.text || '',[messages]);

  function useQuickAction(action, messageIndex) {
    if (action === 'flashcards' || action === 'quiz') {
      if (!currentPdf) {
        setError('Choose a PDF first to create study material.');
        return;
      }
      navigate(`/pdfs/${encodeURIComponent(currentPdf.id)}?generate=${action}#ai-herin-assistant`);
      return;
    }
    const targetQuestion = [...messages.slice(0,messageIndex)].reverse().find(item => item.role === 'user')?.text || lastQuestion;
    if (!targetQuestion) return;
    const lastAnswer = [...messages].reverse().find(item => item.role === 'assistant')?.text || '';
    if (action === 'simplify' && lastAnswer) {
      void sendQuestion(`Explain this more simply, using the provided study material: ${targetQuestion}`);
    } else if (action === 'summarize') {
      void sendQuestion(`Summarize the relevant material about: ${targetQuestion}`);
    }
  }

  return (
    <AppLayout title="Ask Herin" subtitle="Ask questions about the materials you select.">
    <div className="study-page ask-herin-page" aria-labelledby="ask-herin-title">
      <header className="ask-herin-header">
        <div>
          <span className="ask-herin-eyebrow"><Sparkles size={15} aria-hidden="true" /> Your study companion</span>
          <h2 id="ask-herin-title">Ask about your material</h2>
          <p>Herin uses relevant context and will say when details aren’t in your sources.</p>
        </div>
        {pdfs.length > 0 && (
          <label className="ask-herin-source">
            <BookOpen size={17} aria-hidden="true" />
            <span className="sr-only">Select study material</span>
            <select disabled={busy} value={pdfId} onChange={event => {setPdfId(event.target.value); setMessages([]); setStatus('idle'); setError(''); retryRef.current = null;}}>
              <option value="">Choose a PDF or note</option>
              {pdfs.map(pdf => <option key={pdf.id} value={pdf.id}>{pdf.title || pdf.name || 'Untitled PDF'}</option>)}
            </select>
          </label>
        )}
      </header>

      {pdfId && relevantHighlights.length > 0 && (
        <details className="ask-herin-context">
          <summary>Choose highlights to share <span>{selectedHighlightIds.size} selected</span></summary>
          <div className="ask-herin-highlights">
            {relevantHighlights.map(highlight => {
              const checked = selectedHighlightIds.has(highlight.id);
              return <button
                className={`ask-herin-highlight${checked ? ' is-selected' : ''}`}
                key={highlight.id}
                type="button"
                aria-pressed={checked}
                disabled={busy}
                onClick={() => setSelectedHighlightIds(current => {
                  const updated = new Set(current);
                  checked ? updated.delete(highlight.id) : updated.add(highlight.id);
                  return updated;
                })}
              >
                <span className="ask-herin-check">{checked && <Check size={12} aria-hidden="true" />}</span>
                <span>{highlight.text}</span>
              </button>;
            })}
          </div>
        </details>
      )}

      <section className="ask-herin-chat" aria-label="Conversation with Herin">
        <div className={`ask-herin-messages${messages.length ? ' has-messages' : ''}`} ref={listRef} aria-live="polite" aria-busy={busy}>
          {messages.length === 0 ? (
            <div className="ask-herin-welcome">
              <Yuki state="welcome" size="medium" />
              <div className="ask-herin-welcome-copy">
                <p className="ask-herin-kicker">Hi, I’m Yuki.</p>
                <h2>A little clarity, one question at a time.</h2>
                <p>Ask about a concept in your material. If a detail isn’t in the sources, I’ll tell you.</p>
                {pdfId && <p className="ask-herin-selected-source">Using excerpts from {currentPdf?.title || currentPdf?.name || 'selected PDF'}, relevant notes{selectedHighlightIds.size ? ', and selected highlights' : ''}.</p>}
                <div className="ask-herin-suggestions" aria-label="Suggested questions">
                  {QUICK_PROMPTS.map(prompt => <button key={prompt} type="button" onClick={() => {setInput(prompt); inputRef.current?.focus();}}>{prompt}</button>)}
                </div>
              </div>
            </div>
          ) : (
            messages.map((message,index) => <article className={`ask-herin-message ask-herin-message--${message.role}`} key={`${index}-${message.role}`}>
              {message.role === 'assistant' && <Yuki state="explaining" size="avatar" />}
              <div className="ask-herin-bubble">
                {message.role === 'assistant' && <p className="ask-herin-grounding field-hint">{message.excerptCount ? `Based on ${message.excerptCount} selected excerpts, not a complete-document review.` : 'No supporting study excerpts were supplied.'}</p>}
                {message.text.split(/(```[\s\S]*?```)/g).map((part,partIndex)=>part.startsWith('```') ? <pre className="ask-herin-code" key={partIndex}><code>{part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}</code></pre> : <p key={partIndex}>{part}</p>)}
                {message.role === 'assistant' && message.sourcePages?.length > 0 && (
                  <p className="ask-herin-citations">Source pages: {message.sourcePages.join(', ')}</p>
                )}
                {message.role === 'assistant' && <div className="ask-herin-actions" aria-label="Study actions">
                  <button disabled={busy || message.pdfId !== pdfId} type="button" onClick={() => useQuickAction('simplify',index)}>Explain more simply</button>
                  <button disabled={busy} type="button" onClick={() => useQuickAction('summarize',index)}>Summarize</button>
                  {currentPdf && <>
                    <button disabled={busy} type="button" onClick={() => useQuickAction('quiz')}>Make practice questions</button>
                    <button disabled={busy} type="button" onClick={() => useQuickAction('flashcards')}>Create flashcards</button>
                  </>}
                </div>}
              </div>
            </article>)
          )}
          {busy && <div className="ask-herin-thinking" role="status"><Yuki state="thinking" size="avatar" /><span>Yuki is thinking</span><span className="ask-herin-thinking-dots" aria-hidden="true">…</span></div>}
          {status === 'error' && <div className="ask-herin-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void sendQuestion(messages[messages.length - 1]?.text || '',true)}><RotateCw size={15} aria-hidden="true" /> Retry</button>
          </div>}
        </div>
        <form className="ask-herin-composer" onSubmit={event => {event.preventDefault(); void sendQuestion(input);}}>
          <label htmlFor="ask-herin-input" className="sr-only">Ask a question about your study material</label>
          <textarea
            ref={inputRef}
            id="ask-herin-input"
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void sendQuestion(input);
              }
            }}
            placeholder={pdfId ? 'Ask about a concept, note, or selected highlight…' : 'Choose a PDF or note, then ask a question…'}
            rows={2}
            maxLength={2000}
            disabled={busy}
          />
          {input && <button className="ask-herin-clear" type="button" aria-label="Clear question" onClick={() => setInput('')}><X size={16} aria-hidden="true" /></button>}
          <button className="ask-herin-send" type="submit" disabled={busy || !input.trim()} aria-label="Send question"><ArrowUp size={19} aria-hidden="true" /></button>
        </form>
        <p className="ask-herin-footnote">{pdfId ? 'Herin searches all available extracted PDF text and sends selected excerpts, notes, and highlights for each question. Broad answers are an overview, not a full-document summary.' : 'Choose a PDF or note to supply context. Answers need supporting study material.'}</p>
      </section>
      {currentPdf && <Link className="ask-herin-pdf-link" to={`/pdfs/${encodeURIComponent(currentPdf.id)}`}>Open {currentPdf.title || 'selected PDF'}</Link>}
      {currentPdf && currentPdf.kind !== 'note' && <p className="field-hint">For a full-PDF summary, open the PDF, choose “Entire PDF” in AI Herin Assistant, then “Summarize topic”. That workflow processes readable pages in sections.</p>}
    </div>
    </AppLayout>
  );
}
