const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'answer', 'could', 'explain', 'from', 'have',
  'into', 'make', 'more', 'please', 'same', 'that', 'their', 'them', 'there',
  'these', 'this', 'what', 'when', 'where', 'which', 'with', 'would', 'your',
  'can', 'you', 'give', 'example', 'briefly', 'does', 'mean', 'simpler', 'words', 'concept', 'idea', 'relate', 'previous', 'section', 'code', 'snippet', 'page',
]);

function queryTerms(question) {
  return [...new Set((question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])
    .filter(term => !STOP_WORDS.has(term)))].slice(0, 16);
}

function scoreText(text, terms) {
  const lower = text.toLowerCase();
  return terms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
}

function sample(items, count) {
  if (count <= 0) return [];
  if (items.length <= count) return items;
  if (count === 1) return [items[0]];
  return Array.from({length:count}, (_, i) => items[Math.round(i * (items.length - 1) / (count - 1))]);
}

function selectRelevantText(text, terms, maxLength) {
  // Search inside long paragraphs too, including the end of a PDF page or note.
  const chunks = [];
  for (let start = 0; start < text.length; start += 800) {
    const part = text.slice(start, start + 900).trim();
    if (part) chunks.push({text:part, score:scoreText(part, terms)});
  }
  const candidates = terms.length
    ? chunks.filter(chunk => chunk.score > 0).sort((a,b) => b.score - a.score)
    : sample(chunks, Math.max(1, Math.floor(maxLength / 700)));
  let selected = '';
  for (const chunk of candidates) {
    const remaining = maxLength - selected.length - (selected ? 2 : 0);
    if (remaining <= 0) break;
    selected += (selected ? '\n\n' : '') + chunk.text.slice(0, remaining);
  }
  return selected;
}

export function flattenPages(value) {
  if (typeof value === 'string') return [{text:value}];
  if (value && typeof value === 'object' && Array.isArray(value.pages)) return flattenPages(value.pages);
  if (value && typeof value === 'object' && typeof value.text === 'string') return [{text:value.text}];
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      if (typeof item === 'string') return [{text:item}];
      if (!item || typeof item !== 'object') return [];
      const text = typeof item.text === 'string' ? item.text : typeof item.content === 'string' ? item.content : '';
      return text.trim() ? [{text, ...(Number.isInteger(item.pageNum) && item.pageNum > 0 ? {page:item.pageNum} : {})}] : [];
    });
  }
  return [];
}

// Recognize administrative slide headings, not incidental mentions in a lesson.
function isCourseOverview(text) {
  const heading = text.trim().slice(0, 180).replace(/\s+/g, ' ');
  return /^(?:\d+\s+)?(?:(?:course|learning|module)\s+(?:outcomes?|objectives?|overview|requirements?|materials?|policies|syllabus)|syllabus|grading\s+(?:system|criteria|policy)|what\s+does\s+.{1,50}\s+cover\?)/i.test(heading);
}

export function buildAskContext({question, pdfId, pdfs, extractedText, notes, highlights, selectedHighlightIds, preferredPage, maxSources = 12}) {
  const requestedPage = Number(question.match(/\bpage\s+(\d+)\b/i)?.[1]) || null;
  const referential = /\b(?:this|that) (?:code|concept|idea|snippet)|\bprevious section\b/i.test(question);
  const broad = /^(explain a key idea from my material|what are the main points of my notes\??|help me understand this highlight|(?:please )?(?:summari[sz]e|explain|give (?:me )?(?:a |an )?(?:summary|overview) of) (?:this|the|my|the selected|the whole|the entire) (?:page|notes|material|pdf|document|topic|lesson|chapter)|what (?:is|are) the main (?:topic|topics|points|ideas)(?: of (?:this|the) (?:pdf|document|lesson))?)\s*[?.!]?$/i.test(question.trim());
  const terms = broad ? [] : queryTerms(question);
  if (!terms.length && !broad && !requestedPage && !referential) return [];
  const pdf = pdfs.find(item => item.id === pdfId);
  if (!pdf) return [];
  const limit = Math.max(1, Math.min(12, maxSources));
  const rank = (a,b) => scoreText(b.text,terms) - scoreText(a.text,terms);
  const noteSources = notes.filter(item => item.pdfId === pdfId).flatMap(note => {
    const text = selectRelevantText(note.content || note.text || '', terms, 1600);
    return text ? [{kind:'note',title:(note.title || 'Study note').slice(0,180),text,...(Number.isInteger(note.pageNum) && note.pageNum > 0 ? {page:note.pageNum} : {})}] : [];
  });
  const highlightSources = highlights.filter(item => selectedHighlightIds.has(item.id) && item.pdfId === pdfId).flatMap(highlight => {
    const text = selectRelevantText(highlight.text || '', [], 1200);
    return text ? [{kind:'highlight',title:'Selected highlight',text,...(Number.isInteger(highlight.pageNum) && highlight.pageNum > 0 ? {page:highlight.pageNum} : {})}] : [];
  }).sort(rank);
  // Explicit selections get reserved slots, without crowding out the PDF entirely.
  const personal = [...noteSources.slice(0,1), ...sample(highlightSources,3)].slice(0,limit);
  const pages = flattenPages(extractedText).filter(page => page.text.trim());
  if (requestedPage || (referential && preferredPage > 0)) {
    const target = requestedPage || preferredPage;
    const exact = pages.filter(page => page.page === target);
    if (exact.length && /\bprevious section\b/i.test(question)) exact.push(...pages.filter(page => page.page === target - 1));
    // Never substitute another page when the requested page is unreadable or absent.
    return exact.slice(0,limit).map(page => ({kind:'pdf',title:(pdf.title || pdf.name || 'Current PDF').slice(0,180),page:page.page,text:selectRelevantText(page.text,[],6000)}));
  }
  const codeRequest = /\b(?:code|snippet)\b/i.test(question);
  const codePages = codeRequest ? pages.filter(page => /```|\b(?:function|def|class|const|let|var|return|print|console\.log)\b|[{};]|\w+\s*\([^)]*\)/.test(page.text)) : [];
  if (codePages.length) return sample(codePages,limit).map(page => ({kind:'pdf',title:(pdf.title || pdf.name || 'Current PDF').slice(0,180),text:selectRelevantText(page.text,[],2200),...(page.page ? {page:page.page} : {})}));
  const rankedPages = pages.map(page => ({...page, score:scoreText(page.text, terms)}))
    .filter(page => broad || referential || page.score > 0)
    .sort((a,b) => b.score - a.score || Number(b.page === preferredPage) - Number(a.page === preferredPage));
  const slots = limit - personal.length;
  // Broad prompts sample across the document, not just its opening pages.
  const lessonPages = rankedPages.filter(page => !isCourseOverview(page.text));
  const chosen = broad || referential ? sample(lessonPages.length ? lessonPages : rankedPages, slots) : rankedPages.slice(0,slots);
  const allocation = Math.min(2200, Math.floor(12000 / Math.max(1,chosen.length)));
  const pdfSources = chosen.map(page => ({kind:'pdf', title:(pdf.title || pdf.name || 'Current PDF').slice(0,180),
    text:selectRelevantText(page.text,broad || referential ? [] : terms,allocation), ...(page.page ? {page:page.page} : {})})).filter(source => source.text);
  return [...pdfSources,...personal];
}
