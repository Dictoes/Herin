import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function loadPdfDocument(fileOrArrayBuffer) {
  const data =
    fileOrArrayBuffer instanceof ArrayBuffer
      ? fileOrArrayBuffer
      : await fileOrArrayBuffer.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data, cMapUrl:`${import.meta.env.BASE_URL}cmaps/`, cMapPacked:true, standardFontDataUrl:`${import.meta.env.BASE_URL}standard_fonts/` });
  return loadingTask.promise;
}

export async function extractTextFromPdf(pdfDoc, onProgress = () => {}) {
  let pages = [];
  let charCount = 0;
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    onProgress({ state: 'reading', page: i, totalPages: pdfDoc.numPages });
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => (item.str || '') + (item.hasEOL ? '\n' : ' ')).join('');
    const length = pageText.replace(/\s/g, '').length;
    charCount += length;
    pages.push({ pageNum: i, text: pageText.trim(), length });
  }
  return { pages, hasText: charCount > 0, charCount };
}

export async function renderPageToCanvas(pdfDoc, pageNumber, canvas, scale = 1.3) {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const context = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;
}
