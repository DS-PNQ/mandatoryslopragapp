import {z} from 'zod';
import {MAX_INLINE_PDF_BYTES} from '@/lib/uploads/parse';
import {ocrConfig, transcribePdf} from '@/lib/uploads/transcribe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 800;

const Body = z.object({
  // Base64 of a scanned PDF the browser already holds from /api/upload.
  data: z.string().min(8).max(Math.ceil((MAX_INLINE_PDF_BYTES * 4) / 3) + 16),
});

/**
 * Transcribes a scanned PDF page by page and streams progress as NDJSON:
 * {"type":"start"|"page"|"done"|"error", ...}. Nothing is stored.
 */
export async function POST(request: Request): Promise<Response> {
  const config = ocrConfig();
  if (!config) {
    return Response.json(
      {error: 'No transcription model is configured. Set BONSAI_BASE_URL with BONSAI_VISION=1, or LEMMA_OCR_BASE_URL.'},
      {status: 503},
    );
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({error: 'Send {"data": "<base64 PDF>"} of 8 MB or less.'}, {status: 400});
  const bytes = new Uint8Array(Buffer.from(parsed.data.data, 'base64'));
  if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
    return Response.json({error: 'That is not a PDF.'}, {status: 422});
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        for await (const event of transcribePdf(bytes, config, request.signal)) send(event);
      } catch (error) {
        console.error('[lemma] transcription failed', error);
        send({type: 'error', message: error instanceof Error ? error.message : 'The transcription failed.'});
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {headers: {'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store'}});
}
