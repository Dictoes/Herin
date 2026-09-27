export function documentPages(data) {
  if (typeof data === 'string') return [{ pageNum: 1, text: data }];
  if (Array.isArray(data?.pages)) return data.pages;
  return data?.text ? [{ pageNum: 1, text: data.text }] : [];
}

export function cleanText(text) {
  return String(text || '').replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2')
    .replace(/[\t\r ]+/g, ' ').trim();
}

export function studyUnits(text) {
  // Keep every word, including punctuation-free slides. Chunking is not truncation.
  return cleanText(text).replace(/([^.!?:;\n])\n(?=[a-z])/g, '$1 ').split(/\n+|(?<=[.!?])\s+(?=[\p{Lu}\d])/u)
    .flatMap(line => {
      const words = line.replace(/^[\s\u2022\u25cf*-]+/, '').trim().split(/\s+/);
      const parts = [];
      for (let i = 0; i < words.length; i += 65) parts.push(words.slice(i, i + 65).join(' '));
      return parts;
    }).filter(s => s.split(/\s+/).length >= 3 && s.length >= 12);
}

// Headings provide context, but are not facts to memorize.
function contentText(text, name = '') {
  const title = name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ').trim().toLowerCase();
  return cleanText(text).split('\n').filter(line => {
    const value = line.trim();
    if (!value) return false;
    if (title && value.replace(/[_-]/g, ' ').toLowerCase() === title) return false;
    if (/^(?:lesson|chapter|module|unit|lecture|week|session)\s+(?:\d+|[ivxlcdm]+)\b/i.test(value)) return false;
    if (/^(?:course|subject|lesson title|topic|title|learning objectives?|table of contents)\s*:/i.test(value)) return false;
    if (/^(?:learning objectives?|table of contents|references|thank you)[.!]?$/i.test(value)) return false;
    // A descriptive sentence beneath a heading remains eligible.
    if (!definition(value) && !/[.!?]$/.test(value) && !/\b(?:includes?|contains?|consists?|explains?|causes?|uses?|helps?|occurs?|requires?|produces?|moves?|transfers?|can|will|must)\b/i.test(value)) {
      const words = value.split(/\s+/);
      if (words.length <= 16 && words.every(w => /^(?:[A-Z\d]|of$|the$|and$|to$|in$|for$|a$|an$|on$|with$|&$)/.test(w))) return false;
    }
    return true;
  }).join('\n');
}

function genericLabel(value) {
  return /^(?:course|subject|topic|title|lesson|chapter|unit|module|lecture|week|session|overview|introduction|contents?)\b/i.test(value.trim().replace(/[:.].*$/, ''));
}

function usefulUnits(text, name) {
  return studyUnits(contentText(text, name)).filter(s => {
    if (/\bpage\s+\d+\s+(?:of|\/)\s*\d+/i.test(s)) return false;
    const d = definition(s);
    if (d && genericLabel(d.term)) return false;
    if (genericLabel(s)) return false;
    return Boolean(d) || s.split(/\s+/).length >= 6;
  });
}

function definition(text) {
  const m = text.match(/^(.{2,90}?)\s+(?:is defined as|refers to|means|is|are)\s+(.+)$/i)
    || text.match(/^(.{2,65}?):\s+(.+)$/);
  return m && m[2].length >= 8 ? { term: m[1].trim(), meaning: m[2].trim() } : null;
}

export function generateClearNotes(data, name = 'Study notes') {
  const pages = documentPages(data);
  const sections = pages.map(page => {
    const units = usefulUnits(page.text, name);
    const definitions = units.map(definition).filter(Boolean);
    const points = units.filter(unit => !definition(unit));
    return [`## Page ${page.pageNum}`, ...(!cleanText(page.text) ? ['No selectable text on this page. Review the original PDF and add notes manually.'] : []),
      ...(definitions.length ? ['### Key terms', ...definitions.map(d => `- ${d.term}: ${d.meaning}`)] : []),
      ...(points.length ? ['### Key points', ...points.map(point => `- ${point}`)] : []),
      ...(!units.length && cleanText(page.text) ? [cleanText(page.text)] : []),
      ...(units.length ? ['### Recall prompts', ...definitions.map(d => `- Explain ${d.term} in your own words.`),
        ...(!definitions.length ? ['- Explain the key points on this page without looking at the PDF.'] : [])] : [])].join('\n\n');
  });
  return [`# ${name.replace(/\.pdf$/i, '')}`, 'Page-organized study outline from the original text. Check the source for diagrams, tables, and context.', ...sections].join('\n\n');
}

function hash(text) {
  let n = 2166136261;
  for (const ch of text) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  return (n >>> 0).toString(36);
}

export function generateStudyMaterials(data, _legacyCount, meta = {}, onProgress = () => {}) {
  const pages = documentPages(data);
  const flashcards = [], quizQuestions = [], definitions = [], enumerations = [];
  const coverage = [];
  for (const page of pages) {
    const seen = new Set();
    let count = 0;
    for (const unit of usefulUnits(page.text, meta.name)) {
      const key = unit.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const d = definition(unit);
      const words = unit.match(/\p{L}[\p{L}\p{N}-]*/gu) || [];
      const answer = d?.term || [...words].filter(w => w.length > 4).sort((a, b) => b.length - a.length)[0];
      if (!answer) continue;
      const question = d ? `Identify the term: ${d.meaning}` : `Complete the statement: ${unit.replace(answer, '_____')}`;
      const id = `auto_${meta.id || 'text'}_${page.pageNum}_${hash(unit)}`;
      const source = { pdfId: meta.id, sourcePage: page.pageNum, sourceText: unit, subject: meta.subject || meta.name || 'Study', generated: true };
      flashcards.push({ ...source, id, question: d ? `What is ${d.term}?` : question, answer: d?.meaning || answer });
      const q = { ...source, id: `${id}_id`, type: 'identification', question, correctAnswer: answer, explanation: `Page ${page.pageNum}: ${unit}` };
      quizQuestions.push(q);
      if (d) definitions.push(q);
      const list = unit.match(/^(.+?)\s+(?:includes?|consists? of|contains?|types are|steps are)\s+(.+)$/i);
      if (list) {
        const items = list[2].replace(/[.!?]$/, '').split(/,\s*(?:and\s+)?|;\s*|\s+and\s+/i).map(s => s.trim()).filter(Boolean);
        if (items.length >= 3) enumerations.push({ ...source, id: `${id}_list`, type: 'enumeration', question: `List the items that ${list[1]} includes.`, correctAnswer: items.join(', '), expectedItems: items, explanation: `Page ${page.pageNum}: ${unit}` });
      }
      count++;
    }
    coverage.push({ page: page.pageNum, characters: cleanText(page.text).length, cards: count });
    onProgress({ state: 'generating', page: coverage.length, totalPages: pages.length });
  }
  // Distractors are distinct terms, never undefined card IDs or fabricated facts.
  for (const q of definitions) {
    const alternatives = [];
    const used = new Set([q.correctAnswer.toLowerCase()]);
    for (const other of definitions) {
      const key = other.correctAnswer.toLowerCase();
      if (used.has(key) || other.question === q.question) continue;
      used.add(key); alternatives.push(other.correctAnswer);
      if (alternatives.length === 3) break;
    }
    if (alternatives.length < 3) continue;
    const options = alternatives.slice(0, 3);
    options.splice(parseInt(hash(q.id), 36) % 4, 0, q.correctAnswer);
    quizQuestions.push({ ...q, id: `${q.id}_mc`, type: 'multiple', options });
  }
  quizQuestions.push(...enumerations);
  const details = { pagesRead: pages.length, charsRead: pages.reduce((n, p) => n + (p.text || '').length, 0), coverage,
    flashcardsGenerated: flashcards.length, mcqGenerated: quizQuestions.filter(q => q.type === 'multiple').length,
    idGenerated: quizQuestions.filter(q => q.type === 'identification').length, enumGenerated: enumerations.length };
  return { flashcards, quizQuestions, notes: generateClearNotes(data, meta.name), details,
    summary: `Processed ${pages.length} pages. Created ${flashcards.length} flashcards and ${quizQuestions.length} questions.`,
    warnings: coverage.filter(p => !p.cards).map(p => `Page ${p.page}: ${p.characters ? 'too little usable text for questions' : 'no selectable text; manual notes needed'}.`) };
}

export function checkQuizAnswer(question, answer) {
  const normalize = s => String(s || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (question.type !== 'enumeration') return normalize(answer) === normalize(question.correctAnswer);
  const expected = (question.expectedItems || question.correctAnswer.split(/,|;/)).map(normalize);
  const actual = String(answer).split(/,|;|\n/).map(normalize).filter(Boolean);
  return expected.length === new Set(actual).size && expected.every(item => actual.includes(item));
}
