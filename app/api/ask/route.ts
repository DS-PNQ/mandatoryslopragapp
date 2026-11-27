import {z} from 'zod';
import {answer, type Engine, type StreamEvent, type Turn} from '@/lib/agent/answer';
import {AttachmentListSchema} from '@/lib/uploads/retrieve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Long enough for an answer plus one Manim render and one repair.
export const maxDuration = 300;

const AskSchema = z.object({
  question: z.string().trim().min(1, 'The question is empty.').max(2000, 'Keep questions under 2,000 characters.'),
  surfaceId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
  history: z.unknown().optional(),
  engine: z.enum(['opus', 'lfm3', 'bonsai']).optional().catch(undefined),
  attachments: AttachmentListSchema.optional(),
  useLibrary: z.boolean().optional(),
  animate: z.boolean().optional(),
});

function cleanHistory(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Turn => typeof t?.question === 'string' && typeof t?.answer === 'string')
    .slice(-3)
    .map((t) => ({question: t.question.slice(0, 2000), answer: t.answer.slice(0, 4000)}));
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({error: 'Send a JSON body with a "question" field.'}, {status: 400});
  }
  const parsed = AskSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const tooBig = issue?.code === 'too_big' || /too (long|large)/i.test(issue?.message ?? '');
    return Response.json({error: issue?.message ?? 'The request is not valid.'}, {status: tooBig ? 413 : 400});
  }
  const body = parsed.data;
  const surfaceId = body.surfaceId ?? `answer-${Date.now().toString(36)}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        await answer(
          {
            question: body.question,
            surfaceId,
            engine: body.engine as Engine | undefined,
            history: cleanHistory(body.history),
            attachments: body.attachments,
            useLibrary: body.useLibrary,
            animate: body.animate,
          },
          send,
          request.signal,
        );
      } catch (error) {
        console.error('[lemma] answer failed', error);
        const message =
          error instanceof Error && /LFM3/.test(error.message)
            ? `${error.message.split(':')[0]}. Check that the LFM3 server is running and reachable.`
            : error instanceof Error && /api[_ ]?key|auth/i.test(error.message)
              ? 'The model rejected the API key. Check the key in .env.local.'
              : 'The answer stopped because the model request failed. Ask again in a moment.';
        send({type: 'error', message});
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
