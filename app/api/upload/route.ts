import {randomBytes} from 'node:crypto';
import {MAX_UPLOAD_BYTES, parseUpload, UploadError} from '@/lib/uploads/parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Accepts one file (multipart field "file") and returns it as a notebook
 * source: extracted text for PDFs, Word and text files, base64 for images and
 * scanned PDFs. Nothing is stored on the server; the browser keeps the source
 * and sends it with each question.
 */
export async function POST(request: Request): Promise<Response> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json({error: 'Files must be 15 MB or smaller.'}, {status: 413});
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({error: 'Send the file as multipart form data in a "file" field.'}, {status: 400});
  }
  const file = form.get('file');
  if (!(file instanceof File)) return Response.json({error: 'No file was sent.'}, {status: 400});
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({error: `${file.name} is larger than 15 MB.`}, {status: 413});

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const source = await parseUpload(file.name, bytes);
    return Response.json({id: randomBytes(9).toString('base64url'), ...source}, {headers: {'cache-control': 'no-store'}});
  } catch (error) {
    if (error instanceof UploadError) return Response.json({error: error.message}, {status: 422});
    console.error('[lemmaslop] upload failed', error);
    return Response.json({error: `${file.name} could not be read.`}, {status: 500});
  }
}
