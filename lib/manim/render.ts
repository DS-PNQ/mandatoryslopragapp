// Renders model-written Manim scenes to MP4 with scripts/manim_runner.py.
//
// Rendering is on when a Python with Manim Community is found (MANIM_PYTHON,
// else python3) and LEMMA_MANIM is not "off". The runner validates the code
// and restricts the interpreter; this side adds a wall-clock timeout, a clean
// environment without API keys, a scratch directory per render, and, where
// unprivileged user namespaces work, no network access at all.

import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir, readdir, rm, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface ManimStatus {
  available: boolean;
  /** MathTex and Tex need a LaTeX install; without one, scenes must use Text. */
  latex: boolean;
  reason?: string;
}

export type RenderResult =
  | {ok: true; id: string; seconds: number; poster: boolean; captions: boolean}
  | {ok: false; error: string; detail?: string; stage: 'validate' | 'render' | 'timeout' | 'unavailable'};

const PYTHON = process.env.MANIM_PYTHON || 'python3';
const QUALITY = /^[lmh]$/.test(process.env.MANIM_QUALITY ?? '') ? process.env.MANIM_QUALITY! : 'l';
const TIMEOUT_MS = Number(process.env.LEMMA_MANIM_TIMEOUT_MS) || 120_000;
const MAX_PARALLEL = 2;

export function animationDir(): string {
  return process.env.LEMMA_ANIM_DIR || path.join(os.tmpdir(), 'lemma-anims');
}

export function isAnimationId(id: string): boolean {
  return /^[a-f0-9]{24}$/.test(id);
}

function run(
  cmd: string,
  args: string[],
  opts: {cwd?: string; env?: Record<string, string | undefined>; timeoutMs: number; signal?: AbortSignal},
): Promise<{code: number | null; stdout: string; stderr: string; timedOut: boolean}> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let child;
    try {
      child = spawn(cmd, args, {cwd: opts.cwd, env: opts.env as NodeJS.ProcessEnv | undefined, stdio: ['ignore', 'pipe', 'pipe']});
    } catch {
      resolve({code: -1, stdout, stderr: 'spawn failed', timedOut});
      return;
    }
    const kill = () => child.kill('SIGKILL');
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, opts.timeoutMs);
    opts.signal?.addEventListener('abort', kill, {once: true});
    child.stdout.on('data', (d) => (stdout = (stdout + d).slice(-20_000)));
    child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-20_000)));
    child.on('error', () => {
      clearTimeout(timer);
      resolve({code: -1, stdout, stderr: stderr || 'spawn failed', timedOut});
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', kill);
      resolve({code, stdout, stderr, timedOut});
    });
  });
}

function which(bin: string): Promise<boolean> {
  return run('sh', ['-c', `command -v ${bin}`], {timeoutMs: 5000}).then((r) => r.code === 0);
}

let statusPromise: Promise<ManimStatus> | null = null;
let sandboxPrefix: string[] = [];

/** Probes once per process; later calls reuse the answer. */
export function getManimStatus(): Promise<ManimStatus> {
  if (statusPromise) return statusPromise;
  statusPromise = (async (): Promise<ManimStatus> => {
    if (/^(off|0|false|no)$/i.test(process.env.LEMMA_MANIM ?? '')) {
      return {available: false, latex: false, reason: 'Animation rendering is turned off on this server (LEMMA_MANIM).'};
    }
    const probe = await run(PYTHON, ['-c', 'import manim, sys; sys.stdout.write(manim.__version__)'], {timeoutMs: 60_000});
    if (probe.code !== 0) {
      return {
        available: false,
        latex: false,
        reason: 'Manim is not installed on this server, so the scene was not rendered. Run it yourself with the code below.',
      };
    }
    const [latex, dvisvgm, unshare] = await Promise.all([which('latex'), which('dvisvgm'), which('unshare')]);
    if (unshare && process.platform === 'linux') {
      const t = await run('unshare', ['--user', '--net', '--map-root-user', 'true'], {timeoutMs: 5000});
      if (t.code === 0) sandboxPrefix = ['unshare', '--user', '--net', '--map-root-user'];
    }
    return {available: true, latex: latex && dvisvgm};
  })();
  return statusPromise;
}

let running = 0;
const queue: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => queue.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    queue.shift()?.();
  }
}

function lastJson(stdout: string): Record<string, unknown> | null {
  const lines = stdout.trim().split('\n').reverse();
  for (const line of lines) {
    if (!line.startsWith('{')) continue;
    try {
      return JSON.parse(line);
    } catch {
      /* keep looking */
    }
  }
  return null;
}

const KEEP_MS = 12 * 60 * 60 * 1000;
let lastSweep = 0;

/** Deletes renders older than 12 hours, at most once every 10 minutes. */
async function sweep(): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < 10 * 60 * 1000) return;
  lastSweep = now;
  const root = animationDir();
  const names = await readdir(/*turbopackIgnore: true*/ root).catch(() => [] as string[]);
  await Promise.all(
    names.filter(isAnimationId).map(async (name) => {
      const s = await stat(/*turbopackIgnore: true*/ path.join(root, name)).catch(() => null);
      if (s && now - s.mtimeMs > KEEP_MS) await rm(/*turbopackIgnore: true*/ path.join(root, name), {recursive: true, force: true});
    }),
  );
}

export interface NarrationLine {
  text: string;
  duration: number;
  wav: Buffer | null;
}

export async function renderScene(code: string, signal?: AbortSignal, narration: NarrationLine[] = []): Promise<RenderResult> {
  const status = await getManimStatus();
  if (!status.available) return {ok: false, error: status.reason ?? 'Manim is unavailable.', stage: 'unavailable'};
  void sweep();

  const id = randomBytes(12).toString('hex');
  const dir = path.join(animationDir(), id);
  await mkdir(/*turbopackIgnore: true*/ dir, {recursive: true});
  const scenePath = path.join(dir, 'scene.py');
  await writeFile(/*turbopackIgnore: true*/ scenePath, code, 'utf8');
  if (narration.length) {
    const entries = await Promise.all(
      narration.map(async (line, i) => {
        let file: string | null = null;
        if (line.wav) {
          file = path.join(dir, `voice-${i}.wav`);
          await writeFile(/*turbopackIgnore: true*/ file, line.wav);
        }
        return {text: line.text, duration: line.duration, file};
      }),
    );
    await writeFile(/*turbopackIgnore: true*/ path.join(dir, 'narration.json'), JSON.stringify(entries), 'utf8');
  }
  const runner = path.join(process.cwd(), 'scripts', 'manim_runner.py');

  const env: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    HOME: dir,
    LANG: 'C.UTF-8',
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONNOUSERSITE: '1',
    MPLCONFIGDIR: dir,
    // kpathsea: no reading or writing outside the work dir, no shell escape.
    openin_any: 'p',
    openout_any: 'p',
    shell_escape: 'f',
    TEXMFOUTPUT: dir,
  };
  const [cmd, ...pre] = [...sandboxPrefix, PYTHON];
  const r = await slot(() =>
    run(cmd, [...pre, '-I', runner, scenePath, dir, QUALITY], {cwd: dir, env, timeoutMs: TIMEOUT_MS, signal}),
  );

  const result = lastJson(r.stdout);
  if (r.timedOut) {
    await rm(/*turbopackIgnore: true*/ dir, {recursive: true, force: true});
    return {ok: false, error: `Rendering took longer than ${Math.round(TIMEOUT_MS / 1000)} seconds.`, stage: 'timeout'};
  }
  if (result?.ok === true) {
    const ok = await stat(/*turbopackIgnore: true*/ path.join(dir, 'video.mp4')).then((s) => s.size > 0).catch(() => false);
    if (ok) {
      const poster = await stat(/*turbopackIgnore: true*/ path.join(dir, 'poster.jpg')).then(() => true).catch(() => false);
      return {ok: true, id, seconds: Number(result.seconds) || 0, poster, captions: result.captions === true};
    }
  }
  await rm(/*turbopackIgnore: true*/ dir, {recursive: true, force: true});
  const stage = result?.stage === 'validate' ? 'validate' : 'render';
  const error = typeof result?.error === 'string' ? result.error : 'The renderer exited without a result.';
  const detail = typeof result?.traceback === 'string' ? result.traceback : r.stderr.slice(-2000);
  return {ok: false, error, detail, stage};
}

/** Pulls Python source out of a model reply that may wrap it in a code fence. */
export function extractCode(text: string): string | null {
  const fence = text.match(/```(?:python|py)?\s*\n([\s\S]*?)```/);
  const code = (fence ? fence[1] : text).trim();
  return /class\s+\w+\s*\(/.test(code) ? code : null;
}

/**
 * The scene as the user sees and copies it: runnable on its own with
 * `manim -pql scene.py`. Scenes call narrate(self, i), which only the app's
 * runner defines, so a stand-in is added after the imports that returns each
 * line's estimated length (the runner adds the voice instead).
 */
export function standaloneScene(code: string, narration: string[] = []): string {
  if (!code || !/\bnarrate\s*\(/.test(code) || /^def narrate\(/m.test(code)) return code;
  const lines = code.split('\n');
  let at = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^(from \S+ import |import )/.test(lines[i])) at = i + 1;
    else if (lines[i].trim() && !lines[i].startsWith('#')) break;
  }
  const shim = [
    '',
    '# LemmaSlop voices these lines and calls narrate(self, i) when line i starts.',
    '# Run locally, narrate just returns the line\'s estimated length in seconds.',
    `NARRATION = [${narration.map((l) => JSON.stringify(l)).join(', ')}]`,
    '',
    '',
    'def narrate(scene, i):',
    '    words = len(NARRATION[i].split()) if 0 <= i < len(NARRATION) else 5',
    '    return max(1.2, words / 2.6 + 0.4)',
    '',
  ];
  return [...lines.slice(0, at), ...shim, ...lines.slice(at)].join('\n');
}
