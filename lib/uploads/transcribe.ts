// Turns a scanned PDF (no text layer) into text once, at upload: each page is
// rendered to an image and a vision model transcribes it to Markdown with
// LaTeX. The result is stored as the source's text, so every engine can use
// it and retrieval can rank its passages, instead of only Opus seeing images.
//
// The transcriber is any OpenAI-compatible vision endpoint:
//   LEMMA_OCR_BASE_URL / LEMMA_OCR_MODEL / LEMMA_OCR_API_KEY   explicit, e.g. olmOCR or dots.ocr on vLLM
//   otherwise Ternary Bonsai, when BONSAI_BASE_URL is set and BONSAI_VISION=1

import {bonsaiConfig, bonsaiVision, BONSAI_MODEL} from '../agent/lfm3';

export interface OcrConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Shown in the UI: "Transcribed by …". */
  label: string;
}

/** Pages beyond this are left out; the user is told. */
export const MAX_OCR_PAGES = Number(process.env.LEMMA_OCR_MAX_PAGES) || 60;
const PAGE_TIMEOUT_MS = Number(process.env.LEMMA_OCR_TIMEOUT_MS) || 180_000;
/** Long side of the rendered page, in pixels: enough for subscripts, small enough for the model's image budget. */
const RENDER_PX = 1600;

export function ocrConfig(): OcrConfig | null {
  const explicit = process.env.LEMMA_OCR_BASE_URL?.trim().replace(/\/+$/, '');
  if (explicit) {
    const model = process.env.LEMMA_OCR_MODEL?.trim() || 'ocr';
    return {baseUrl: explicit, apiKey: process.env.LEMMA_OCR_API_KEY || undefined, model, label: model};
  }
  const bonsai = bonsaiConfig();
  if (bonsai && bonsaiVision()) return {...bonsai, model: BONSAI_MODEL, label: 'Bonsai 27B'};
  return null;
}

export const OCR_PROMPT = `Transcribe this page of a math document exactly.
- Output Markdown. Write every formula in LaTeX: $...$ inline, $$...$$ for displayed equations.
- Keep headings, numbered items, theorem and proof labels, and table structure.
- For a figure or diagram, write one line: [Figure: short description].
- Do not solve, explain, summarize or correct anything. Output only the transcription.`;

/** Removes reasoning and code fences a model may wrap around the transcription. */
export function cleanTranscription(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^[\s\S]*?<\/think>/, '')
    .replace(/^\s*```(?:markdown|md|latex)?\s*\n/, '')
    .replace(/\n```\s*$/, '')
    .replace(/\f/g, '\n')
    .trim();
}

async function transcribePage(config: OcrConfig, image: string, page: number, pages: number, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {'content-type': 'application/json', ...(config.apiKey ? {authorization: `Bearer ${config.apiKey}`} : {})},
    body: JSON.stringify({
      model: config.model,
      messages: [
        {role: 'system', content: OCR_PROMPT},
        {
          role: 'user',
          content: [
            {type: 'image_url', image_url: {url: image}},
            {type: 'text', text: `Page ${page} of ${pages}.`},
          ],
        },
      ],
      // Copying text needs no reasoning: thinking off where the chat template
      // supports it, and low temperature so symbols are not paraphrased.
      chat_template_kwargs: {enable_thinking: false},
      temperature: 0.2,
      top_p: 0.8,
      top_k: 20,
      min_p: 0,
      max_tokens: 6000,
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(PAGE_TIMEOUT_MS)]) : AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${config.label} answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const json: any = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error(`${config.label} returned no text.`);
  return cleanTranscription(content);
}

export type OcrEvent =
  | {type: 'start'; pages: number; total: number; model: string}
  | {type: 'page'; page: number; pages: number; ok: boolean}
  | {type: 'done'; text: string; pages: number; total: number; failed: number[]; model: string};

/**
 * Renders and transcribes each page in order. Pages are separated by form
 * feeds, as for PDFs with a text layer, so citations name the page. A page
 * that fails is marked in the text and listed in `failed`; the rest go on.
 */
export async function* transcribePdf(pdfBytes: Uint8Array, config: OcrConfig, signal?: AbortSignal): AsyncGenerator<OcrEvent> {
  const {getDocumentProxy, renderPageAsImage} = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(pdfBytes));
  const total = pdf.numPages;
  const pages = Math.min(total, MAX_OCR_PAGES);
  yield {type: 'start', pages, total, model: config.label};

  const texts: string[] = [];
  const failed: number[] = [];
  for (let n = 1; n <= pages; n++) {
    if (signal?.aborted) throw new Error('Transcription was cancelled.');
    let text = '';
    try {
      const page = await pdf.getPage(n);
      const {width, height} = page.getViewport({scale: 1});
      const scale = Math.min(3, RENDER_PX / Math.max(width, height));
      const image = await renderPageAsImage(pdf, n, {
        canvasImport: () => import(/*turbopackIgnore: true*/ '@napi-rs/canvas'),
        scale,
        format: 'jpeg',
        quality: 0.85,
        toDataURL: true,
      });
      text = await transcribePage(config, image, n, pages, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn(`[lemma] OCR page ${n} failed`, error instanceof Error ? error.message : error);
    }
    if (!text) {
      failed.push(n);
      text = `[Page ${n} could not be read.]`;
    }
    texts.push(text);
    yield {type: 'page', page: n, pages, ok: !failed.includes(n)};
  }
  yield {type: 'done', text: texts.join('\f'), pages, total, failed, model: config.label};
}
