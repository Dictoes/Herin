// Extracted pages are displayed joined by two newlines. Link the selection to
// its starting page, including older highlights that did not store a page.
export function highlightPage(highlight, extracted) {
  if (Number.isInteger(highlight.page) && highlight.page > 0) return highlight.page;
  if (highlight.source !== 'text' || !Array.isArray(extracted?.pages)) return 1;
  const start = Math.max(0, highlight.start || 0);
  let offset = 0;
  for (const page of extracted.pages) {
    const end = offset + (page.text || '').length;
    if (start < end) return page.pageNum || 1;
    offset = end + 2;
  }
  return extracted.pages.at(-1)?.pageNum || 1;
}
