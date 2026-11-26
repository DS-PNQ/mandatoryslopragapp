// Narration voices for Manim videos, from MioTTS-0.6B (Aratako/MioTTS-0.6B,
// Apache 2.0) through the MioTTS-Inference server
// (github.com/Aratako/MioTTS-Inference), which pairs the LLM with the
// MioCodec-25Hz-24kHz codec and exposes POST /v1/tts.
//
//   MIOTTS_URL        base URL of that server, e.g. http://127.0.0.1:8001
//   MIOTTS_PRESET     preset voice id on the server (default en_female)
//   MIOTTS_REFERENCE  optional path to a WAV/FLAC/OGG clip (under 20 s) to clone instead
//
// Without MIOTTS_URL, or when the server is down, videos are rendered
// silently with captions, using estimated line lengths.

import {readFile} from 'node:fs/promises';

export interface VoiceLine {
  text: string;
  /** Seconds. Measured from the WAV when synthesized, estimated otherwise. */
  duration: number;
  wav: Buffer | null;
}

const LINE_TIMEOUT_MS = Number(process.env.MIOTTS_TIMEOUT_MS) || 90_000;
/** The server rejects text over 300 characters by default. */
export const MAX_LINE_CHARS = 280;

export function ttsUrl(): string | null {
  const url = process.env.MIOTTS_URL?.trim().replace(/\/+$/, '');
  return url || null;
}

let healthAt = 0;
let healthy = false;

/** True when MIOTTS_URL answers /health. Cached for a minute. */
export async function ttsAvailable(): Promise<boolean> {
  const url = ttsUrl();
  if (!url) return false;
  if (Date.now() - healthAt < 60_000) return healthy;
  healthAt = Date.now();
  try {
    const res = await fetch(`${url}/health`, {signal: AbortSignal.timeout(3000)});
    healthy = res.ok;
  } catch {
    healthy = false;
  }
  return healthy;
}

const SPOKEN: Record<string, string> = {
  infty: 'infinity', pi: 'pi', theta: 'theta', alpha: 'alpha', beta: 'beta', lambda: 'lambda', sigma: 'sigma',
  mu: 'mu', epsilon: 'epsilon', delta: 'delta', sum: 'the sum', int: 'the integral', sqrt: 'the square root of',
  cdot: 'times', times: 'times', le: 'at most', ge: 'at least', to: 'to', approx: 'about', neq: 'is not',
};

/** Plain words for the speech model: no LaTeX markup, no markdown. */
export function speakable(text: string): string {
  return text
    .replace(/\$+/g, '')
    .replace(/\\([a-zA-Z]+)/g, (_, cmd: string) => ` ${SPOKEN[cmd] ?? ''} `)
    .replace(/[{}_^*`#]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
    .slice(0, MAX_LINE_CHARS);
}

/** About 2.6 words a second, the pace of a calm explainer voice. */
export function estimateSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1.2, Math.round((words / 2.6 + 0.4) * 10) / 10);
}

/** Reads the duration of a PCM WAV from its fmt and data chunks. */
export function wavSeconds(wav: Buffer): number | null {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') return null;
  let byteRate = 0;
  let at = 12;
  while (at + 8 <= wav.length) {
    const id = wav.toString('ascii', at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    if (id === 'fmt ') byteRate = wav.readUInt32LE(at + 16);
    if (id === 'data') {
      const bytes = Math.min(size, wav.length - at - 8);
      return byteRate > 0 ? bytes / byteRate : null;
    }
    at += 8 + size + (size % 2);
  }
  return null;
}

let referenceData: Promise<string | null> | null = null;
function reference(): Promise<{type: 'preset'; preset_id: string} | {type: 'base64'; data: string}> {
  const file = process.env.MIOTTS_REFERENCE?.trim();
  if (!file) return Promise.resolve({type: 'preset', preset_id: process.env.MIOTTS_PRESET?.trim() || 'en_female'});
  referenceData ??= readFile(file)
    .then((b) => b.toString('base64'))
    .catch(() => null);
  return referenceData.then((data) =>
    data ? {type: 'base64' as const, data} : {type: 'preset' as const, preset_id: process.env.MIOTTS_PRESET?.trim() || 'en_female'},
  );
}

async function speak(url: string, text: string, signal?: AbortSignal): Promise<Buffer> {
  const res = await fetch(`${url}/v1/tts`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({text, reference: await reference(), output: {format: 'wav'}}),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(LINE_TIMEOUT_MS)]) : AbortSignal.timeout(LINE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`MioTTS answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Synthesizes each line in order. A line that fails falls back to silence
 * with an estimated duration, so the scene still renders and captions still
 * line up.
 */
export async function synthesize(lines: string[], signal?: AbortSignal): Promise<{lines: VoiceLine[]; voiced: number}> {
  const url = (await ttsAvailable()) ? ttsUrl() : null;
  const out: VoiceLine[] = [];
  let voiced = 0;
  for (const raw of lines) {
    const text = speakable(raw);
    let wav: Buffer | null = null;
    let duration = estimateSeconds(text);
    if (url && text && !signal?.aborted) {
      try {
        wav = await speak(url, text, signal);
        const measured = wavSeconds(wav);
        if (measured && measured > 0.2) {
          duration = Math.round(measured * 1000) / 1000;
          voiced++;
        } else wav = null;
      } catch (error) {
        console.warn('[lemma] MioTTS line failed', error instanceof Error ? error.message : error);
        wav = null;
      }
    }
    out.push({text, duration, wav});
  }
  return {lines: out, voiced};
}
