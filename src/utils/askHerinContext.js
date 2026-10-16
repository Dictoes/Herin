const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'answer', 'could', 'explain', 'from', 'have',
  'into', 'make', 'more', 'please', 'same', 'that', 'their', 'them', 'there',
  'these', 'this', 'what', 'when', 'where', 'which', 'with', 'would', 'your',
]);

function queryTerms(question) {
  return [...new Set((question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])
    .filter(term => !STOP_WORDS.has(term)))].slice(0, 16);
}

function selectRelevantText(text, terms, maxLength) {
  const paragraphs = text.split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(part => part.trim()).filter(Boolean);
  const ranked = paragraphs.map((paragraph, index) => ({
    paragraph,
    index,
    score: terms.reduce((total, term) => total + (paragraph.toLowerCase().includes(term) ? 1 : 0), 0),
  })).filter(item => item.score > 0)
    .sort((first, second) => second.score - first.score || first.index - second.index);
  let selected = '';
  for (const item of ranked) {
    const candidate = selected ? `${selected}\n\n${item.paragraph}` : item.paragraph;
    if (candidate.length > maxLength) continue;
    selected = candidate;
  }
  return selected;
}

function flattenPages(value) {
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

export function buildAskContext({question, pdfId, pdfs, extractedText, notes, highlights, selectedHighlightIds, preferredPage, maxSources = 12}) {
  const terms = queryTerms(question);
  if (!terms.length) return [];
  const sources = [];
  const pdf = pdfs.find(item => item.id === pdfId);
  if (pdf) {
    const pages = flattenPages(extractedText).sort((first, second) => Number(second.page === preferredPage) - Number(first.page === preferredPage));
    const allocation = Math.max(500, Math.min(2200, Math.floor(12000 / Math.max(1, pages.length))));
    for (const page of pages) {
      const text = selectRelevantText(page.text, terms, allocation);
      if (text) sources.push({kind:'pdf',title:pdf.title || pdf.name || 'Current PDF',text,...(page.page ? {page:page.page} : {})});
    }
  }
  for (const note of notes.filter(item => item.pdfId === pdfId)) {
    const text = selectRelevantText(note.content || note.text || '', terms, 1600);
    if (text) sources.push({kind:'note',title:note.title || 'Study note',text,...(Number.isInteger(note.pageNum) && note.pageNum > 0 ? {page:note.pageNum} : {})});
  }
  for (const highlight of highlights.filter(item => selectedHighlightIds.has(item.id) && item.pdfId === pdfId)) {
    const text = selectRelevantText(highlight.text || '', terms, 1200);
    if (text) sources.push({kind:'highlight',title:'Selected highlight',text,...(Number.isInteger(highlight.pageNum) && highlight.pageNum > 0 ? {page:highlight.pageNum} : {})});
  }
  return sources.slice(0, maxSources);
}
