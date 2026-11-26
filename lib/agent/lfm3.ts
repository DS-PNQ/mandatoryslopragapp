// LFM3 (Liquid AI, open weights) through any OpenAI-compatible chat endpoint:
//   - local:  llama-server -hf LiquidAI/LFM3-1.7B-GGUF:Q4_K_M --jinja   (llama.cpp b11960 or newer)
//             -> LFM3_BASE_URL=http://127.0.0.1:8080/v1
//   - local:  ollama run lfm3 (Ollama 0.40.12+) -> LFM3_BASE_URL=http://127.0.0.1:11434/v1, LFM3_MODEL=lfm3
//   - hosted: OpenRouter "liquid/lfm-3-1.7b"    -> OPENROUTER_API_KEY=...
//
// Sampling follows the LFM3-1.7B model card's "Math & STEM" recommendation
// (temperature 1.0, top_p 0.95, top_k 20). LFM3 reasons by default: its chat
// template opens a <think> block, so the stream carries a reasoning trace
// before the answer, either inline in `content` or in a separate
// `reasoning_content` / `reasoning` field depending on the server.

export const LFM3_MODEL = process.env.LFM3_MODEL ?? 'liquid/lfm-3-1.7b';

/** LFM3-1.7B model card, "Sampling parameters: Math & STEM". */
export const LFM3_MATH_SAMPLING = {temperature: 1.0, top_p: 0.95, top_k: 20} as const;

export function lfm3Config(): {baseUrl: string; apiKey?: string} | null {
  const explicit = process.env.LFM3_BASE_URL?.replace(/\/+$/, '');
  const apiKey = process.env.LFM3_API_KEY || process.env.OPENROUTER_API_KEY || undefined;
  if (explicit) return {baseUrl: explicit, apiKey};
  if (apiKey) return {baseUrl: 'https://openrouter.ai/api/v1', apiKey};
  return null;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Lfm3Result {
  finishReason: string | null;
  model: string;
}

export interface Lfm3Callbacks {
  /** Called with reasoning text as it streams (never shown as answer text). */
  onReasoning?: (text: string) => void;
  onDone?: (r: Lfm3Result) => void;
}

/**
 * Separates an inline reasoning trace from the answer. Handles both
 * "<think>…</think>answer" and the template-primed form "…</think>answer",
 * where the opening tag was part of the prompt and never appears in output.
 */
export class ThinkFilter {
  private state: 'start' | 'think' | 'answer' = 'start';
  private buffer = '';
  /** Drop whitespace between </think> and the first answer character. */
  private trimLead = false;

  constructor(private readonly onReasoning: (text: string) => void = () => {}) {}

  push(text: string): string {
    if (this.state === 'answer') {
      if (!this.trimLead) return text;
      const out = text.replace(/^\s+/, '');
      if (out) this.trimLead = false;
      return out;
    }
    this.buffer += text;
    const close = this.buffer.indexOf('</think>');
    if (close >= 0) {
      this.onReasoning(text.slice(0, Math.max(0, text.length - (this.buffer.length - close))));
      const rest = this.buffer.slice(close + '</think>'.length).replace(/^\s+/, '');
      this.buffer = '';
      this.state = 'answer';
      this.trimLead = rest === '';
      return rest;
    }
    if (this.state === 'start') {
      const head = this.buffer.trimStart();
      if (head.startsWith('<think>')) {
        this.state = 'think';
      } else if (this.looksLikeAnswer(head)) {
        // No reasoning trace at all: release everything held so far.
        const out = this.buffer;
        this.buffer = '';
        this.state = 'answer';
        return out;
      }
    }
    this.onReasoning(text);
    return '';
  }

  /** End of stream: a trace that never closed yields only its JSON lines. */
  flush(): string {
    if (this.state === 'answer') return '';
    const lines = this.buffer.split('\n').filter((l) => l.trim().startsWith('{"t"'));
    this.buffer = '';
    return lines.join('\n');
  }

  private looksLikeAnswer(head: string): boolean {
    const nl = head.indexOf('\n');
    const first = (nl >= 0 ? head.slice(0, nl) : '').trim().replace(/^```(?:jsonl?|)$/, '');
    if (!first && nl >= 0 && /^```/.test(head)) return true;
    if (!first) return false;
    try {
      const v = JSON.parse(first);
      return Boolean(v && typeof v === 'object' && 't' in v);
    } catch {
      return false;
    }
  }
}

/** Streams answer-text deltas from /chat/completions (server-sent events). */
export async function* streamLfm3(
  messages: ChatMessage[],
  signal?: AbortSignal,
  callbacks: Lfm3Callbacks = {},
): AsyncGenerator<string> {
  const config = lfm3Config();
  if (!config) throw new Error('LFM3 is not configured. Set LFM3_BASE_URL or OPENROUTER_API_KEY.');

  const override = process.env.LFM3_TEMPERATURE ? Number(process.env.LFM3_TEMPERATURE) : NaN;
  const sampling = {...LFM3_MATH_SAMPLING, ...(Number.isFinite(override) ? {temperature: override} : {})};

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      ...(config.apiKey ? {authorization: `Bearer ${config.apiKey}`} : {}),
      'x-title': 'Lemma',
    },
    body: JSON.stringify({
      model: LFM3_MODEL,
      messages,
      stream: true,
      // Room for the reasoning trace plus the answer.
      max_tokens: Number(process.env.LFM3_MAX_TOKENS) || 28000,
      ...sampling,
    }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`LFM3 endpoint answered ${res.status}: ${detail.slice(0, 200)}`);
  }

  const think = new ThinkFilter(callbacks.onReasoning);
  let finishReason: string | null = null;
  let model = LFM3_MODEL;
  let buffer = '';
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let chunk: any;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) throw new Error(`LFM3 stream error: ${chunk.error.message ?? 'unknown'}`);
      if (typeof chunk.model === 'string') model = chunk.model;
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      const reasoning = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
      if (typeof reasoning === 'string' && reasoning) callbacks.onReasoning?.(reasoning);
      const text = choice?.delta?.content;
      if (typeof text === 'string' && text) {
        const answer = think.push(text);
        if (answer) yield answer;
      }
    }
  }
  const tail = think.flush();
  if (tail) yield tail;
  callbacks.onDone?.({finishReason, model});
}
