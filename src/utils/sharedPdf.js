export const MAX_SHARED_PDF_SIZE = 25 * 1024 * 1024;

export async function validateSharedPdf(file) {
  if (!file || !/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) {
    return 'Choose a PDF file.';
  }
  if (!file.size) return 'The PDF file is empty.';
  if (file.size > MAX_SHARED_PDF_SIZE) return 'PDFs must be 25 MB or smaller.';
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (new TextDecoder().decode(header) !== '%PDF-') return 'This file is not a readable PDF.';
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 2048), file.size).arrayBuffer());
  if (!new TextDecoder().decode(tail).includes('%%EOF')) return 'This file is not a readable PDF.';
  return '';
}

export async function requestSharedPdf(client, action, {shareId, file, signal} = {}) {
  if (!client) throw Error('PDF sharing is unavailable. Please retry later.');
  const headers = {apikey: client.supabaseKey};
  if (action === 'upload' || action === 'remove') {
    const {data, error} = await client.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) throw Error('Sign in to manage the attached PDF.');
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }

  let body;
  if (action === 'upload') {
    body = new FormData();
    body.set('action', action);
    body.set('share_id', shareId);
    body.set('file', file, file.name);
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({action, share_id: shareId});
  }

  const response = await fetch(`${client.supabaseUrl}/functions/v1/shared-pdf`, {
    method: 'POST',
    headers,
    body,
    signal,
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error('The PDF service returned an invalid response. Please retry.');
  }
  if (!response.ok) throw Error(result.error || 'The PDF request failed. Please retry.');
  return result;
}
