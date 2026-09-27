// Converts the current window selection, restricted to nodes inside
// `container`, into { start, end } character offsets against the
// container's full innerText. Returns null if there is no usable
// selection inside the container.
export function getSelectionOffsets(container) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null;
  }

  const preStart = range.cloneRange();
  preStart.selectNodeContents(container);
  preStart.setEnd(range.startContainer, range.startOffset);
  const start = preStart.toString().length;

  const text = range.toString();
  if (!text.trim()) return null;

  return { start, end: start + text.length, text, rect: range.getBoundingClientRect() };
}

// Splits `text` into an ordered list of segments given a set of
// non-necessarily-sorted, possibly overlapping highlights
// ({ id, start, end, color, createdAt }). Later-created highlights win
// over earlier ones on overlap.
export function computeSegments(text, highlights) {
  if (!highlights || highlights.length === 0) {
    return [{ text, color: null, id: null }];
  }
  const points = new Set([0, text.length]);
  highlights.forEach((h) => {
    points.add(Math.max(0, Math.min(h.start, text.length)));
    points.add(Math.max(0, Math.min(h.end, text.length)));
  });
  const sorted = Array.from(points).sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    if (segStart >= segEnd) continue;
    const covering = highlights
      .filter((h) => h.start <= segStart && h.end >= segEnd)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const top = covering[covering.length - 1];
    segments.push({
      text: text.slice(segStart, segEnd),
      color: top ? top.color : null,
      id: top ? top.id : null,
    });
  }
  return segments;
}
