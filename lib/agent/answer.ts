import Anthropic from '@anthropic-ai/sdk';
import type {SourceEntry, TraceEntry} from '../a2ui/catalog-api';
import {getRetriever, getIndex} from '../rag/load';
import type {RetrievedPassage} from '../rag/retrieve';
import {BlockStreamParser, blocksToTranscript, type Block} from './blocks';
import {LFM3_MODEL, lfm3Config, streamLfm3, type ChatMessage} from './lfm3';
import {SurfaceWriter, type A2uiMessage} from './surface-writer';

export const MODEL = process.env.LEMMA_MODEL ?? 'claude-opus-5-5';
const EFFORT = (process.env.LEMMA_EFFORT ?? 'high') as 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type Engine = 'opus' | 'lfm3';

export interface EngineInfo {
  id: Engine;
  label: string;
  model: string;
  available: boolean;
}

export function engines(): EngineInfo[] {
  return [
    {id: 'opus', label: 'Opus 5.5', model: MODEL, available: hasModelCredentials()},
    {id: 'lfm3', label: 'LFM3 1.7B', model: LFM3_MODEL, available: lfm3Config() !== null},
  ];
}

/** The requested engine if it is configured, else the first configured one. */
export function resolveEngine(requested?: unknown): EngineInfo | null {
  const list = engines().filter((e) => e.available);
  return list.find((e) => e.id === requested) ?? list[0] ?? null;
}

export interface Turn {
  question: string;
  answer: string;
}

export interface AskInput {
  question: string;
  surfaceId: string;
  history?: Turn[];
  engine?: Engine;
}

export type StreamEvent =
  | {type: 'a2ui'; message: A2uiMessage}
  | {type: 'done'; transcript: string; mode: 'model' | 'retrieval-only'; engine: Engine | null}
  | {type: 'error'; message: string};

const SYSTEM_PROMPT = `You answer questions for a small library of mathematics study notes. Each question arrives with numbered passages retrieved from the library.

How to answer:
- Base the answer on the passages and cite them inline as [1], [2] right after the claim they support. Cite only passage numbers you were given.
- If the passages do not cover part of the question, say so plainly in a caveat block. You may then add standard textbook facts, but leave those sentences uncited so the reader can tell them apart.
- Write for a university student: precise, unhurried, no filler. Prefer a short derivation or worked example over a long explanation. Aim for 120 to 350 words in total.
- Write all mathematics in LaTeX: inline as $...$, and put important formulas in their own eq block. Never use HTML.

Output format: JSON Lines only. Every line is one complete JSON object, with no surrounding prose and no code fences. Escape backslashes in LaTeX as JSON requires ("\\\\frac"). Allowed objects:
{"t":"p","md":"paragraph of markdown with $inline math$ and citations [1]"}
{"t":"eq","tex":"display LaTeX without dollar signs"}
{"t":"steps","title":"optional short title","items":[{"md":"what this step does","tex":"optional display LaTeX"}]}
{"t":"stmt","kind":"Theorem|Definition|Lemma|Corollary|Proposition|Example|Remark","title":"optional name","md":"the statement","cite":1}
{"t":"caveat","md":"what the library does not cover, or an assumption you had to make"}
{"t":"followups","items":["two or three short follow-up questions the library can answer"]}

Start with a p block that answers the question directly in one or two sentences. Use steps only for a genuine sequence of reasoning. End with exactly one followups line.`;

// Small models follow a format more reliably from one concrete example.
const LFM3_EXAMPLE = `

Example of a complete answer to "What is the derivative of x^3?" given a passage on power rules:
{"t":"p","md":"By the power rule, $\\\\frac{d}{dx}x^3 = 3x^2$ [1]."}
{"t":"eq","tex":"\\\\frac{d}{dx}x^n = nx^{n-1}"}
{"t":"followups","items":["What is the chain rule?","How do you differentiate e^x?"]}`;

function formatPassages(passages: RetrievedPassage[]): string {
  return passages
    .map(
      (p, i) =>
        `<passage n="${i + 1}" note="${p.chunk.noteTitle}" section="§${p.chunk.section} ${p.chunk.heading}">\n${p.chunk.text}\n</passage>`,
    )
    .join('\n\n');
}

function toSources(passages: RetrievedPassage[]): SourceEntry[] {
  return passages.map((p, i) => ({
    n: i + 1,
    chunkId: p.chunk.id,
    note: p.chunk.noteTitle,
    area: p.chunk.area,
    section: p.chunk.section,
    heading: p.chunk.heading,
    excerpt: p.chunk.text.length > 420 ? `${p.chunk.text.slice(0, 417).trimEnd()}…` : p.chunk.text,
    fused: p.fused,
    denseRank: p.denseRank,
    bm25Rank: p.bm25Rank,
    cell: p.cell,
  }));
}

export function hasModelCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Runs retrieval + generation and yields A2UI messages as they are produced. */
export async function answer(input: AskInput, send: (e: StreamEvent) => void, signal?: AbortSignal): Promise<void> {
  const writer = new SurfaceWriter(input.surfaceId, (message) => send({type: 'a2ui', message}));
  writer.begin(input.question);

  const retriever = getRetriever();
  const {ivf} = getIndex();
  const {passages, trace} = retriever.search(input.question, 6);
  const engine = resolveEngine(input.engine);
  const useModel = engine !== null;

  const traceEntry: TraceEntry = {
    cells: trace.probed,
    k: ivf.k,
    scanned: trace.scanned,
    total: trace.total,
    denseRecall: trace.denseRecall,
    elapsedMs: trace.elapsedMs,
    queryTerms: trace.queryTerms,
    unknownTerms: trace.unknownTerms,
    model: engine ? engine.model : 'none (retrieval only)',
  };
  writer.sources(toSources(passages), traceEntry);

  if (passages.length === 0) {
    const blocks: Block[] = [
      {
        t: 'caveat',
        md: 'None of the words in this question appear in the library, so there is nothing to answer from. Try naming the topic, for example "eigenvalues" or "ratio test".',
      },
      {t: 'followups', items: ['What does the spectral theorem say?', 'How does the ratio test work?']},
    ];
    blocks.forEach((b) => writer.block(b));
    writer.finish('No matching passages');
    send({type: 'done', transcript: blocksToTranscript(blocks), mode: useModel ? 'model' : 'retrieval-only', engine: engine?.id ?? null});
    return;
  }

  if (!engine) {
    const blocks = extractiveAnswer(passages);
    blocks.forEach((b) => writer.block(b));
    writer.finish(`Showing ${Math.min(3, passages.length)} passages. Configure a model for written answers`);
    send({type: 'done', transcript: blocksToTranscript(blocks), mode: 'retrieval-only', engine: null});
    return;
  }

  writer.status(`${engine.label} is writing from ${passages.length} passages`);
  const blocks: Block[] = [];
  const parser = new BlockStreamParser(
    (line, reason) => console.warn(`[lemma] dropped line (${reason}): ${line.slice(0, 120)}`),
    engine.id === 'lfm3',
  );
  const emit = (bs: Block[]) => {
    for (const b of bs) {
      blocks.push(b);
      writer.block(b);
    }
  };

  const turns = (input.history ?? []).slice(-3).flatMap((turn) => [
    {role: 'user' as const, content: turn.question},
    {role: 'assistant' as const, content: turn.answer || '(no answer recorded)'},
  ]);
  const userTurn = `${formatPassages(passages)}\n\n<question>${input.question}</question>`;

  let stopNote: string | null = null;
  if (engine.id === 'lfm3') {
    const messages: ChatMessage[] = [
      {role: 'system', content: SYSTEM_PROMPT + LFM3_EXAMPLE},
      ...turns,
      {role: 'user', content: userTurn},
    ];
    let finish: string | null = null;
    let reasoningWords = 0;
    let lastReport = 0;
    const onReasoning = (text: string) => {
      reasoningWords += text.split(/\s+/).filter(Boolean).length;
      if (blocks.length === 0 && reasoningWords - lastReport >= 40) {
        lastReport = reasoningWords;
        writer.status(`${engine.label} is reasoning (${reasoningWords} words so far)`);
      }
    };
    const onDone = (r: {finishReason: string | null}) => (finish = r.finishReason);
    for await (const text of streamLfm3(messages, signal, {onReasoning, onDone})) emit(parser.push(text));
    emit(parser.flush());
    if (finish === 'length') stopNote = 'The answer hit the length limit and stops early.';
  } else {
    stopNote = await generateWithOpus(turns, userTurn, (text) => emit(parser.push(text)), signal);
    emit(parser.flush());
  }

  if (stopNote) {
    const b: Block = {t: 'caveat', md: stopNote};
    blocks.push(b);
    writer.block(b);
  }
  if (blocks.length === 0) {
    emit(extractiveAnswer(passages));
  }
  const cited = new Set([...blocksToTranscript(blocks).matchAll(/\[(\d+)\]/g)].map((m) => m[1]));
  writer.finish(`${engine.label} answered from ${passages.length} passages, ${cited.size} cited`);
  send({type: 'done', transcript: blocksToTranscript(blocks), mode: 'model', engine: engine.id});
}

/** Streams the Opus answer; returns a caveat to append when the turn ended abnormally. */
async function generateWithOpus(
  turns: Anthropic.Beta.BetaMessageParam[],
  userTurn: string,
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  const client = new Anthropic();
  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {effort: EFFORT},
      system: [{type: 'text', text: SYSTEM_PROMPT, cache_control: {type: 'ephemeral'}}],
      messages: [...turns, {role: 'user', content: userTurn}],
    },
    {signal},
  );

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') onText(event.delta.text);
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') return 'The model declined to answer this question. The retrieved passages are listed alongside.';
  if (final.stop_reason === 'max_tokens') return 'The answer hit the length limit and stops early.';
  return null;
}

/** Without a model: present the strongest passages verbatim, labelled as excerpts. */
export function extractiveAnswer(passages: RetrievedPassage[]): Block[] {
  const top = passages.slice(0, 3);
  const blocks: Block[] = [
    {
      t: 'caveat',
      md: 'No language model is configured, so this page quotes the passages that match best instead of writing an answer.',
    },
    ...top.map(
      (p, i): Block => ({
        t: 'stmt',
        kind: 'Remark',
        title: `${p.chunk.heading}, ${p.chunk.noteTitle} §${p.chunk.section}`,
        md: p.chunk.text,
        cite: i + 1,
      }),
    ),
  ];
  const more = passages.slice(3).map((p) => `Explain ${p.chunk.heading.charAt(0).toLowerCase()}${p.chunk.heading.slice(1)}`);
  if (more.length) blocks.push({t: 'followups', items: more.slice(0, 3)});
  return blocks;
}
