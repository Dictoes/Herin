// Keep the complete JSON request below the existing function's 40,000-character
// gate, including escaping and UTF-8 expansion. No PDF bytes or UI metadata.
export const ASK_REQUEST_BYTES = 30000;
const size = value => new TextEncoder().encode(JSON.stringify(value)).length;
const cleanText = (value, limit) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0,limit) : '';

export function buildAskRequest({question, history = [], context = []}) {
  const body = {action:'ask', question:cleanText(question,2000), history:[], context:[]};
  for (const source of context.slice(0,12)) {
    const text = cleanText(source.text,6000);
    if (!text) continue;
    body.context.push({kind:source.kind,title:cleanText(source.title,180) || 'Study material',text,
      ...(Number.isInteger(source.page) && source.page > 0 ? {page:source.page} : {})});
  }
  // Shrink excerpts evenly so later pages and selected highlights remain represented.
  while ((size(body) > ASK_REQUEST_BYTES || body.context.reduce((sum,source) => sum + source.text.length,0) > 18000) && body.context.some(source => source.text.length > 1)) {
    body.context = body.context.map(source => ({...source,text:source.text.slice(0,Math.max(1,Math.floor(source.text.length * .85)))}));
  }
  let historyRemaining = 6000;
  for (const message of history.slice(-8).reverse()) {
    if (!['user','assistant'].includes(message.role)) continue;
    const text = cleanText(message.text, Math.min(2000,historyRemaining));
    if (!text) continue;
    const entry = {role:message.role,text};
    body.history.unshift(entry);
    if (size(body) > ASK_REQUEST_BYTES) { body.history.shift(); break; }
    historyRemaining -= text.length;
    if (!historyRemaining) break;
  }
  return body;
}
