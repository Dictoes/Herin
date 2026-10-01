const MAX_PDF_SIZE = 25 * 1024 * 1024;
const SIGNED_URL_SECONDS = 300;
const SHARE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
});
const env = (name: string) => Deno.env.get(name) || '';

class PdfError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function validPdfName(value: string) {
  const name = value.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, '').trim() || '';
  if (!/\.pdf$/i.test(name) || !name.length || Array.from(name).length > 255) {
    throw new PdfError('Choose a PDF file with a valid filename.', 400);
  }
  return name;
}

async function readablePdf(blob: Blob) {
  if (!blob.size || blob.size > MAX_PDF_SIZE) return false;
  const header = new TextDecoder().decode(new Uint8Array(await blob.slice(0, 5).arrayBuffer()));
  if (header !== '%PDF-') return false;
  const tail = new TextDecoder().decode(new Uint8Array(await blob.slice(Math.max(0, blob.size - 2048), blob.size).arrayBuffer()));
  return tail.includes('%%EOF');
}

async function readUploadForm(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  const lengthHeader = request.headers.get('content-length');
  const contentLength = lengthHeader === null ? 0 : Number(lengthHeader);
  const maxRequestSize = MAX_PDF_SIZE + 1024 * 1024;
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > maxRequestSize) {
    throw new PdfError('PDFs must be 25 MB or smaller.', 413);
  }
  if (!request.body) throw new PdfError('Choose a PDF file.', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxRequestSize) {
        await reader.cancel();
        throw new PdfError('PDFs must be 25 MB or smaller.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const form = await new Response(new Blob(chunks), {headers: {'Content-Type': contentType}}).formData();
  return {action: form.get('action'), shareId: form.get('share_id'), file: form.get('file')};
}

export function createHandler({createClient, env: getEnv = env}: {
  createClient: (...args: any[]) => any;
  env?: (name: string) => string;
}) {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response(null, {headers: cors});
    if (request.method !== 'POST') return reply({error: 'Use POST.'}, 405);
    let stage = 'request';
    try {
      const url = getEnv('SUPABASE_URL');
      const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
      if (!url || !key) throw new PdfError('PDF sharing is not configured yet.', 503);
      const db = createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false}});
      const multipart = request.headers.get('content-type')?.includes('multipart/form-data');
      let userId: string | null = null;
      if (multipart) {
        stage = 'authentication';
        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
        if (!token) throw new PdfError('Sign in to manage the attached PDF.', 401);
        const {data, error} = await db.auth.getUser(token);
        if (error || !data.user) throw new PdfError('Your session expired. Sign in again.', 401);
        userId = data.user.id;
      }
      const action = multipart
        ? await readUploadForm(request)
        : await request.json().then(body => ({action: body.action, shareId: body.share_id, file: null}));

      if (typeof action.shareId !== 'string' || !SHARE_ID.test(action.shareId)) {
        throw new PdfError('This study link is invalid.', 400);
      }
      if (!['upload', 'remove', 'check', 'download'].includes(String(action.action))) {
        throw new PdfError('Unknown PDF action.', 400);
      }

      if (action.action === 'upload' || action.action === 'remove') {
        if (!userId) {
          stage = 'authentication';
          const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
          if (!token) throw new PdfError('Sign in to manage the attached PDF.', 401);
          const {data, error} = await db.auth.getUser(token);
          if (error || !data.user) throw new PdfError('Your session expired. Sign in again.', 401);
          userId = data.user.id;
        }
      }

      const pathFor = (owner: string, id: string) => `${owner}/shared/${id}.pdf`;
      if (action.action === 'upload') {
        stage = 'upload_validation';
        const file = action.file;
        if (!(file instanceof Blob)) throw new PdfError('Choose a PDF file.', 400);
        if (!file.size) throw new PdfError('The PDF file is empty.', 400);
        if (file.size > MAX_PDF_SIZE) throw new PdfError('PDFs must be 25 MB or smaller.', 413);
        if (file.type && file.type !== 'application/pdf') throw new PdfError('Choose a PDF file.', 400);
        const fileName = validPdfName((file as File).name || '');
        if (!await readablePdf(file)) throw new PdfError('This file is not a readable PDF.', 400);
        stage = 'upload';
        const objectPath = pathFor(userId!, action.shareId);
        const {error} = await db.storage.from('herin-pdfs').upload(objectPath, file, {
          contentType: 'application/pdf',
          upsert: true,
        });
        if (error) throw new PdfError('The PDF could not be uploaded. Please retry.', 503);
        return reply({
          file_name: fileName,
          file_size: file.size,
          mime_type: 'application/pdf',
          attached_at: new Date().toISOString(),
        });
      }

      if (action.action === 'remove') {
        stage = 'remove';
        const {data: existing, error: lookupError} = await db.from('shared_study_links')
          .select('share_id').eq('share_id', action.shareId).eq('user_id', userId).maybeSingle();
        if (lookupError) throw new PdfError('The attached PDF could not be removed. Please retry.', 503);
        if (existing) throw new PdfError('A published PDF cannot be removed from its shared snapshot.', 409);
        const {error} = await db.storage.from('herin-pdfs').remove([pathFor(userId!, action.shareId)]);
        if (error) throw new PdfError('The attached PDF could not be removed. Please retry.', 503);
        return reply({removed: true});
      }

      stage = 'share_lookup';
      const {data: share, error: shareError} = await db.from('shared_study_links')
        .select('share_id,user_id,quiz_id,source_item_id,pdf_storage_path,pdf_file_name,pdf_file_size,pdf_mime_type,is_public,expires_at')
        .eq('share_id', action.shareId).maybeSingle();
      if (shareError) throw new PdfError('The PDF could not be checked. Please retry.', 503);
      if (!share || !share.is_public || (share.expires_at && Date.parse(share.expires_at) <= Date.now())) {
        throw new PdfError('This study link is no longer available.', 404);
      }
      if (share.quiz_id) {
        const {data: quiz, error: quizError} = await db.from('quizzes')
          .select('questions').eq('id', share.quiz_id).maybeSingle();
        if (quizError) throw new PdfError('The PDF could not be checked. Please retry.', 503);
        if (!Array.isArray(quiz?.questions) || !quiz.questions.some((question: {id?: string}) => question.id === share.source_item_id)) {
          throw new PdfError('This study link is no longer available.', 404);
        }
      }
      const expectedPath = pathFor(share.user_id, share.share_id);
      if (!share.pdf_storage_path || share.pdf_storage_path !== expectedPath ||
          !share.pdf_file_name || share.pdf_mime_type !== 'application/pdf' ||
          !Number.isInteger(share.pdf_file_size) || share.pdf_file_size < 1 || share.pdf_file_size > MAX_PDF_SIZE) {
        throw new PdfError('The attached PDF is missing or unreadable.', 404);
      }

      stage = 'pdf_validation';
      const {data: blob, error: downloadError} = await db.storage.from('herin-pdfs').download(expectedPath);
      if (downloadError || !blob || blob.size !== share.pdf_file_size || !await readablePdf(blob)) {
        throw new PdfError('The attached PDF is missing or unreadable.', 404);
      }
      if (action.action === 'check') return reply({
        available: true,
        file_name: share.pdf_file_name,
        file_size: share.pdf_file_size,
      });

      stage = 'signed_url';
      const {data, error} = await db.storage.from('herin-pdfs')
        .createSignedUrl(expectedPath, SIGNED_URL_SECONDS, {download: share.pdf_file_name});
      if (error || !data?.signedUrl) throw new PdfError('A secure PDF download is temporarily unavailable. Please retry.', 503);
      return reply({url: data.signedUrl, expires_in: SIGNED_URL_SECONDS});
    } catch (error) {
      const safe = error instanceof PdfError ? error : new PdfError('The PDF request failed. Please retry.', 503);
      console.warn(JSON.stringify({event: 'shared_pdf_failed', stage, status: safe.status}));
      return reply({error: safe.message}, safe.status);
    }
  };
}
