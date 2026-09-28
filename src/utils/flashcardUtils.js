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
  return cleanText(text).replace(/([^.!?:;\n])\n(?=[a-z])/g, '$1 ').split(/\n+|(?<=[.!?])\s+(?=[\p{Lu}\d])/u)
    .flatMap(line => {
      const words = line.replace(/^[\s\u2022\u25cf*-]+/, '').trim().split(/\s+/);
      const parts = [];
      for (let i = 0; i < words.length; i += 65) parts.push(words.slice(i, i + 65).join(' '));
      return parts;
    }).filter(s => s.split(/\s+/).length >= 3 && s.length >= 12);
}

function isBadLabel(value) {
  if (!value) return true;
  const collapsed = String(value).replace(/[^a-z0-9]/gi, '').toLowerCase();
  const bad = ['course', 'subject', 'topic', 'title', 'lesson', 'chapter', 'unit', 'module', 'lecture', 'week', 'session', 'filename', 'metadata'];
  for (const w of bad) {
    if ([w,'the'+w,w+'name',w+'title',w+'code'].includes(collapsed) || collapsed.match(new RegExp('^' + w + '\\d+$'))) return true;
  }
  return false;
}

function contentText(text, name = '') {
  const title = name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ').trim().toLowerCase();
  const collapsedTitle = title.replace(/[^a-z0-9]/gi, '');
  return cleanText(text).split('\n').filter(line => {
    const value = line.trim();
    if (!value) return false;
    if (collapsedTitle && value.replace(/[^a-z0-9]/gi, '').toLowerCase() === collapsedTitle) return false;
    if (value.length < 50 && isBadLabel(value.replace(/[:.].*$/, ''))) return false;
    if (/^(?:learning objectives?|table of contents|references|thank you)[.!]?$/i.test(value)) return false;
    if (!definition(value) && !/[.!?]$/.test(value) && !/\b(?:includes?|contains?|consists?|explains?|causes?|uses?|helps?|occurs?|requires?|produces?|moves?|transfers?|can|will|must)\b/i.test(value)) {
      const words = value.split(/\s+/);
      if (words.length <= 16 && words.every(w => /^(?:[A-Z\d]|of$|the$|and$|to$|in$|for$|a$|an$|on$|with$|&$)/.test(w))) return false;
    }
    return true;
  }).join('\n');
}

function genericLabel(value) {
  return isBadLabel(value.trim().replace(/[:.].*$/, ''));
}

function usefulUnits(text, name) {
  return studyUnits(contentText(text, name)).filter(s => {
    if (/\bpage\s+\d+\s+(?:of|\/)\s*\d+/i.test(s)) return false;
    const d = definition(s);
    if (/^(?:course|subject|topic|title|lesson|chapter|module|lecture|week|session)(?:\s+(?:name|title|code|\d+))?\s*(?::|[-–]|is\b)/i.test(s)) return false;
    if (d && genericLabel(d.term)) return false;
    if (genericLabel(s)) return false;
    return Boolean(d) || s.includes('=') || s.split(/\s+/).length >= 6;
  });
}

function definition(text) {
  const m = text.match(/^(.{2,90}?)\s+(?:is defined as|refers to|means|is|are)\s+(.+)$/i)
    || text.match(/^(.{2,65}?):\s+(.+)$/);
  return m && m[2].length >= 8 ? { term: m[1].trim(), meaning: m[2].trim() } : null;
}

function extractQuestion(unit, d) {
  let match = unit.match(/^(.+?)\s+because\s+(.+)$/i);
  if(match) return {fcQ:`Why is this true: ${match[1]}?`,fcA:match[2],qQ:`Explain why: ${match[1]}`,qA:match[2],type:'application'};
  match=unit.match(/^(.+?)\s+(?:whereas|while)\s+(.+)$/i);
  if(match) return {fcQ:'What contrast does this passage describe?',fcA:unit,qQ:`Complete the comparison: ${match[1]}, whereas _____.`,qA:match[2],type:'application'};
  match=unit.match(/^(.{1,60}?)\s*=\s*(.+)$/);
  if(match) return {fcQ:`What expression equals ${match[1].trim()}?`,fcA:match[2],qQ:`Complete the formula: ${match[1].trim()} = _____`,qA:match[2],type:'application'};
  let m = unit.match(/^(?:the\s+)?steps\s+of\s+(.+?)\s+(?:are|include)\s+(.+)$/i);
  if (m) return { fcQ: `What are the steps of ${m[1]}?`, fcA: m[2], qQ: `What are the steps of ${m[1]}?`, qA: m[2], type: 'application' };

  m = unit.match(/(?:how|the way)\s+(.+?)\s+works\s+is\s+(.+)$/i);
  if (m) return { fcQ: `How does ${m[1]} work?`, fcA: m[2], qQ: `How does ${m[1]} work?`, qA: m[2], type: 'application' };

  m = unit.match(/why\s+(.+?)\s+happens\s+is\s+(.+)$/i) || unit.match(/(.+?)\s+happens\s+because\s+(.+)$/i);
  if (m) return { fcQ: `Why does ${m[1] || m[2]} happen?`, fcA: m[2] || m[1], qQ: `Why does ${m[1] || m[2]} happen?`, qA: m[2] || m[1], type: 'application' };

  m = unit.match(/difference\s+between\s+(.+?)\s+and\s+(.+?)\s+is\s+(.+)$/i);
  if (m) return { fcQ: `What is the difference between ${m[1]} and ${m[2]}?`, fcA: m[3], qQ: `What is the difference between ${m[1]} and ${m[2]}?`, qA: m[3], type: 'application' };

  m = unit.match(/^(?:when|if)\s+(.+?),\s*(?:then\s+)?(.+)$/i);
  if (m) return {fcQ:`What happens when ${m[1]}?`,fcA:m[2],qQ:`What happens when ${m[1]}?`,qA:m[2],type:'application'};
  m = unit.match(/^(.+?)\s+happens\s+when\s+(.+)$/i);
  if (m) return {fcQ:`What happens when ${m[2].replace(/[.!?]$/,'')}?`,fcA:m[1],qQ:`What happens when ${m[2].replace(/[.!?]$/,'')}?`,qA:m[1],type:'application'};

  m = unit.match(/(?:the\s+)?purpose\s+of\s+(.+?)\s+is\s+(.+)$/i);
  if (m) return { fcQ: `What is the purpose of ${m[1]}?`, fcA: m[2], qQ: `What is the purpose of ${m[1]}?`, qA: m[2], type: 'application' };

  m = unit.match(/(.+?)\s+is\s+calculated\s+(?:by|using)\s+(.+)$/i);
  if (m) return { fcQ: `How is ${m[1]} calculated?`, fcA: m[2], qQ: `How is ${m[1]} calculated?`, qA: m[2], type: 'application' };

  m = unit.match(/(?:the\s+)?advantages?\s+and\s+disadvantages?\s+of\s+(.+?)\s+(?:are|include)\s+(.+)$/i);
  if (m) return { fcQ: `What are the advantages and disadvantages of ${m[1]}?`, fcA: m[2], qQ: `What are the advantages and disadvantages of ${m[1]}?`, qA: m[2], type: 'application' };

  m = unit.match(/(?:the\s+)?advantages?\s+of\s+(.+?)\s+(?:are|include)\s+(.+)$/i);
  if (m) return { fcQ: `What are the advantages of ${m[1]}?`, fcA: m[2], qQ: `What are the advantages of ${m[1]}?`, qA: m[2], type: 'application' };

  m = unit.match(/(?:an\s+)?example\s+of\s+(.+?)\s+is\s+(.+)$/i) || unit.match(/for\s+example,\s+(.+?)\s+is\s+(.+)$/i);
  if (m) return { fcQ: `Which situation is an example of ${m[1]}?`, fcA: m[2], qQ: `Which situation is an example of ${m[1]}?`, qA: m[2], type: 'application' };

  m = unit.match(/(.+?)\s+(?:causes|results in|leads to)\s+(.+)$/i);
  if (m) return { fcQ: `What is the result of ${m[1]}?`, fcA: m[2], qQ: `What is the result of ${m[1]}?`, qA: m[2], type: 'application' };

  m = unit.match(/(?:the\s+)?formula\s+for\s+(.+?)\s+is\s+(.+)$/i);
  if (m) return { fcQ: `What is the formula for ${m[1]}?`, fcA: m[2], qQ: `What is the formula for ${m[1]}?`, qA: m[2], type: 'application' };

  if (d) return { fcQ: `What is ${d.term}?`, fcA: d.meaning, qQ: `Identify the term: ${d.meaning}`, qA: d.term, type: 'identification' };

  const words = unit.match(/\p{L}[\p{L}\p{N}-]*/gu) || [];
  const answer = [...words].filter(w => w.length > 4).sort((a, b) => b.length - a.length)[0];
  if (answer) return { fcQ: `Complete the statement: ${unit.replace(answer, '_____')}`, fcA: answer, qQ: `Complete the statement: ${unit.replace(answer, '_____')}`, qA: answer, type: 'identification' };
  
  return null;
}

export function generateClearNotes(data, name = 'Study notes') {
  const pages = documentPages(data);
  const sections = pages.map(page => {
    const units = usefulUnits(page.text, name);
    const definitions = units.map(definition).filter(Boolean);
    const points = units.filter(unit => !definition(unit));
    return [`## Page ${page.pageNum}`, ...(!cleanText(page.text) ? ['No selectable text on this page. Review the original PDF and add notes manually.'] : []),
      ...(definitions.length ? ['### Key terms', ...definitions.map(d => `- ${d.term}: ${d.meaning}`)] : []),
      ...['Key points','Processes','Examples','Formulas'].flatMap(group => { const category = point => /(?:formula|calculated|=)/i.test(point)?'Formulas':/example/i.test(point)?'Examples':/(?:steps|process|first|then|finally)/i.test(point)?'Processes':'Key points'; const chosen=points.filter(point=>category(point)===group); return chosen.length?[`### ${group}`,...chosen.map(point=>`- ${point}`)]:[]; }),
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
  let rawFlashcards = [], rawQuizQuestions = [], definitions = [], enumerations = [];
  const coverage = [];
  for (const page of pages) {
    const seen = new Set();
    let count = 0;
    for (const unit of usefulUnits(page.text, meta.name)) {
      const key = unit.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const d = definition(unit);
      
      const qData = extractQuestion(unit, d);
      if (!qData) continue;
      
      const id = `auto_${meta.id || 'text'}_${page.pageNum}_${hash(unit)}`;
      const source = { pdfId: meta.id, sourcePage: page.pageNum, sourceText: unit, subject: meta.subject || meta.name || 'Study', generated: true };
      
      rawFlashcards.push({ ...source, id, question: qData.fcQ, answer: qData.fcA });
      
      const q = { ...source, id: `${id}_id`, type: qData.type, question: qData.qQ, correctAnswer: qData.qA, explanation: `Page ${page.pageNum}: ${unit}` };
      rawQuizQuestions.push(q);
      
      if (d && q.type === 'identification') definitions.push(q);
      const list = unit.match(/^(.+?)\s+(?:includes?|consists? of|contains?|types are|steps are|are)\s*:?\s+(.+)$/i);
      if (list) {
        const items = list[2].replace(/[.!?]$/, '').split(/,\s*(?:and\s+)?|;\s*|\s+and\s+/i).map(s => s.trim()).filter(Boolean);
        if (items.length >= 2) enumerations.push({ ...source, id: `${id}_list`, type: 'enumeration', question: `List the items that ${list[1]} includes.`, correctAnswer: items.join(', '), expectedItems: items, explanation: `Page ${page.pageNum}: ${unit}` });
      }
      count++;
    }
    coverage.push({ page: page.pageNum, characters: cleanText(page.text).length, cards: count });
    onProgress({ state: 'generating', page: coverage.length, totalPages: pages.length });
  }

  for (const q of definitions) {
    const alternatives = [];
    const used = new Set([q.correctAnswer.toLowerCase()]);
    for (const other of definitions) {
      const key = other.correctAnswer.toLowerCase();
      if (used.has(key) || other.question === q.question) continue;
      used.add(key); alternatives.push(other.correctAnswer);
      if (alternatives.length === 3) break;
    }
    if (alternatives.length >= 3) {
      const options = alternatives.slice(0, 3);
      options.splice(parseInt(hash(q.id), 36) % 4, 0, q.correctAnswer);
      rawQuizQuestions.push({ ...q, id: `${q.id}_mc`, type: 'multiple', options });
    }
    const negate = parseInt(hash(q.id),36)%2===0 && /\b(?:is|are)\b(?!\s+not)/i.test(q.sourceText) && !/\bnot\b/i.test(q.sourceText);
    const statement=negate?q.sourceText.replace(/\b(is|are)\b/i,'$1 not'):q.sourceText;
    const tfQuestion = `True or False: ${statement.replace(/^[a-z]/, c => c.toUpperCase())}`;
    rawQuizQuestions.push({
      ...q,
      id: `${q.id}_tf`,
      type: 'true-false',
      question: tfQuestion,
      options: ['True', 'False'],
      correctAnswer: negate?'False':'True',
      explanation: `${negate?'The statement contradicts the source.':'The source supports the statement.'} Source: ${q.sourceText}`
    });
  }
  rawQuizQuestions.push(...enumerations);
  
  const isValid = (q) => {
      if (!q.sourcePage || !q.sourceText) return false;
      const qText = String(q.question || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const aText = String(q.answer || q.correctAnswer || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const badWords = ['course', 'subject', 'topic', 'title', 'lesson', 'chapter', 'unit', 'module', 'filename', 'metadata'];
      if (badWords.some(w => qText === `whatis${w}` || qText === `whatisthe${w}` || qText === `whatis${w}1`)) return false;
      if (badWords.some(w => aText === w || aText === `${w}1` || aText === `${w}2`)) return false;
      if (!q.answer && !q.correctAnswer) return false;
      if (isBadLabel(q.question) || isBadLabel(q.answer || q.correctAnswer)) return false;
      return true;
  };

  const flashcards = [];
  const seenFc = new Set();
  for (const fc of rawFlashcards) {
      const qLower = fc.question.toLowerCase();
      if (isValid(fc) && !seenFc.has(qLower)) {
          seenFc.add(qLower);
          flashcards.push(fc);
      }
  }

  const quizQuestions = [];
  const seenQuiz = new Set();
  for (const q of rawQuizQuestions) {
      const qKey = q.question.toLowerCase() + q.type;
      if (isValid(q) && !seenQuiz.has(qKey)) {
          seenQuiz.add(qKey);
          quizQuestions.push(q);
      }
  }

  const details = { pagesRead: pages.length, charsRead: pages.reduce((n, p) => n + (p.text || '').length, 0), coverage,
    flashcardsGenerated: flashcards.length, mcqGenerated: quizQuestions.filter(q => q.type === 'multiple').length,
    idGenerated: quizQuestions.filter(q => q.type === 'identification' || q.type === 'application').length, enumGenerated: enumerations.length };
  return { flashcards, quizQuestions, notes: generateClearNotes(data, meta.name), details,
    summary: `Processed ${pages.length} pages. Created ${flashcards.length} flashcards and ${quizQuestions.length} questions.`,
    warnings: coverage.filter(p => !p.cards).map(p => `Page ${p.page}: ${p.characters ? 'too little usable text for questions' : 'no selectable text; manual notes needed'}.`) };
}

export function checkQuizAnswer(question, answer) {
  const normalize = s => String(s || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (question.type !== 'enumeration') return normalize(answer) === normalize(question.correctAnswer);
  const expected = (question.expectedItems || question.correctAnswer.split(/,|;/)).map(normalize);
  const compoundItems = (question.expectedItems || []).some(item=>item.includes(','));
  const actual = String(answer).split(compoundItems ? /;|\n/ : /,|;|\n/).map(normalize).filter(Boolean);
  return expected.length === new Set(actual).size && expected.every(item => actual.includes(item));
}

// Only the saved highlight is supplied here; document metadata is never source text.
export const INCOMPLETE_HIGHLIGHT = 'Highlight a complete definition, explanation, process, example, formula, or list to create study materials.';

// Slides often contain lists without an introductory "includes" or "are".
// Keep bullet groups together so commas inside a bullet do not invent items.
function highlightedList(raw) {
  const text = cleanText(raw).replace(/(\p{L})-\s+(?=\p{L})/gu, '$1-');
  if (/^(?:course|subject|topic|title|lesson|chapter|unit|module|filename|metadata)\s*(?:\d+\s*)?[:–-]/i.test(text)) return null;
  const bullets = /[•●▪‣]|(?:^|\n)\s*(?:[-*]|\d+[.)])\s+/g;
  const marked = [...text.matchAll(bullets)];
  let items;
  if (marked.length >= 2) {
    const prefix = text.slice(0,marked[0].index).trim();
    items = text.split(bullets).slice(1);
    if (prefix && !prefix.endsWith(':')) items.unshift(prefix);
  } else {
    // Explicit list introductions are handled by the existing definition rules.
    if (/:|\b(?:includes?|contains?|consists?|are|is)\b/i.test(text)) return null;
    const list = text.replace(/\s+(?:matter|are important|are essential)[.!]?$/i,'').replace(/[.!]$/,'');
    items = list.split(/[,;]\s*/);
    if (items.length < 3) return null;
  }
  items = items.map(item=>item.replace(/^\s*and\s+/i,'').replace(/[.;]$/,'').replace(/\s+/g,' ').trim());
  if (items.length < 2 || items.some(item=>!item || item.split(/\s+/).length>16 || isBadLabel(item)
    || /[.!?]|\b(?:is|are|because|when|if|whereas)\b/i.test(item))) return null;
  return [...new Set(items)];
}

export function generateHighlightMaterials(highlight, meta = {}) {
  if (!highlight.id) throw new Error('Save the highlight before creating study materials.');
  const items = highlightedList(highlight.text);
  if (items?.length >= 2) {
    const id = `${highlight.id}_list_${hash(items.join(';'))}`;
    const question = `Which ${items.length} items are listed in this highlight?`;
    const answer = items.join('; ');
    const source = {highlightId:highlight.id,pdfId:meta.id,sourcePage:highlight.page||1,sourceText:highlight.text,sourceExcerpt:highlight.text,subject:meta.subject||meta.name||'Study',generated:true,tags:[],explanation:highlight.text};
    return {flashcards:[{...source,id,type:'flashcard',question,answer}],quizQuestions:[{...source,id:`${id}_quiz`,type:'enumeration',question,correctAnswer:answer,expectedItems:items}],message:`Created 1 flashcard and 1 quiz question from ${items.length} listed items.`};
  }
  const text = cleanText(highlight.text).replace(/:\s*\n\s*(?:[-•*]|\d+[.)])\s*/g, ': ').replace(/(?:^|\n)\s*(?:[-•*]|\d+[.)])\s+/g, ', ').replace(/:\s*,\s*/g, ': ');
  if (text.split(/\s+/).length < 3) return {flashcards:[],quizQuestions:[],message:INCOMPLETE_HIGHLIGHT};
  const result = generateStudyMaterials({pages:[{pageNum:highlight.page || 1,text}]},undefined,{id:meta.id,name:meta.name,subject:meta.subject});
  // Do not turn arbitrary title fragments into fill-in-the-blank cards.
  const meaningful = item => /\b(?:is|are|means|refers|includes?|contains?|consists?|causes?|because|results|leads|steps|first|then|finally|whereas|unlike|compared|formula|calculated|uses?|requires?|produces?|moves?|transfers?|converts?|defines?|forwards?|can|when|if|matters?|provides?|supports?|improves?|reduces?|increases?|depends?|involves?|serves?|connects?|ensures?|enables?|allows?|prevents?|determines?)\b|[:=]/i.test(item.sourceText);
  const attach = item => ({...item,id:`${highlight.id}_${item.id}`,highlightId:highlight.id,sourceText:highlight.text,sourceExcerpt:item.sourceText,sourcePage:highlight.page || 1,pdfId:meta.id,tags:[],explanation:item.explanation || item.sourceText,type:item.type || 'flashcard'});
  const flashcards=result.flashcards.filter(meaningful).map(attach);
  const quizQuestions=result.quizQuestions.filter(meaningful).map(attach);
  return {flashcards,quizQuestions,message:flashcards.length?`Created ${flashcards.length} flashcards and ${quizQuestions.length} questions.`:INCOMPLETE_HIGHLIGHT};
}
