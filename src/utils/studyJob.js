export function generateStudyJob(text, meta, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./study.worker.js', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => finish(new Error('Generation timed out. Your PDF is saved; retry from its reader.')), 180000);
    function finish(error, result) {
      clearTimeout(timer); worker.terminate();
      if (error) reject(error); else resolve(result);
    }
    worker.onmessage = ({ data }) => {
      if (data.progress) onProgress(data.progress);
      else finish(data.error ? new Error(data.error) : null, data.result);
    };
    worker.onerror = () => finish(new Error('Study generation failed. Reopen the PDF and retry.'));
    worker.postMessage({ text, meta });
  });
}
