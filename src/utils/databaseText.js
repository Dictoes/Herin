// PostgreSQL text/jsonb reject NUL and unpaired UTF-16 surrogates.
// Replace each invalid code unit, preserving highlight offsets and valid Unicode.
export function databaseText(text) {
  let result = '';
  for (const character of text) {
    const code = character.charCodeAt(0);
    result += code === 0 || (character.length === 1 && code >= 0xD800 && code <= 0xDFFF)
      ? '\uFFFD' : character;
  }
  return result;
}

export function databaseJson(value) {
  if (typeof value === 'string') return databaseText(value);
  if (Array.isArray(value)) return value.map(databaseJson);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => [databaseText(key), databaseJson(item)]);
    if (new Set(entries.map(([key]) => key)).size !== entries.length) {
      throw new Error('Two data fields have conflicting invalid characters. Export your workspace before editing these fields.');
    }
    return Object.fromEntries(entries);
  }
  return value;
}
