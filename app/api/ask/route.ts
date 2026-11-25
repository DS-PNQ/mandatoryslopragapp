import {answer, type Engine, type StreamEvent, type Turn} from '@/lib/agent/answer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface AskBody {
  question?: unknown;
  surfaceId?: unknown;
  history?: unknown;
  engine?: unknown;
}

function cleanHistory(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Turn => typeof t?.question === 'string' && typeof t?.answer === 'string')
    .slice(-3)
    .map((t) => ({question: t.question.slice(0, 500), answer: t.answer.slice(0, 4000)}));
}

export async function POST(request: Request): Promise<Response> {
  let body: AskBody;
  try {
    body = (await request.json()) as AskBody;
  } catch {
    return Response.json({error: 'Send a JSON body with a "question" field.'}, {status: 400});
  }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) return Response.json({error: 'The question is empty.'}, {status: 400});
  if (question.length > 600) return Response.json({error: 'Keep questions under 600 characters.'}, {status: 413});
  const surfaceId =
    typeof body.surfaceId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(body.surfaceId)
      ? body.surfaceId
      : `answer-${Date.now().toString(36)}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        const engine: Engine | undefined = body.engine === 'opus' || body.engine === 'lfm3' ? body.engine : undefined;
        await answer({question, surfaceId, engine, history: cleanHistory(body.history)}, send, request.signal);
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
