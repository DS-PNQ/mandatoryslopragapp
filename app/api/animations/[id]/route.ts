import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {animationDir, isAnimationId} from '@/lib/manim/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Serves a rendered Manim video, with byte ranges so browsers can seek. */
export async function GET(request: Request, {params}: {params: Promise<{id: string}>}): Promise<Response> {
  const {id} = await params;
  const [name, ext = 'mp4'] = id.split('.');
  const files: Record<string, [string, string]> = {
    mp4: ['video.mp4', 'video/mp4'],
    jpg: ['poster.jpg', 'image/jpeg'],
    vtt: ['captions.vtt', 'text/vtt; charset=utf-8'],
  };
  if (!isAnimationId(name) || !Object.hasOwn(files, ext)) return new Response('Not found', {status: 404});
  const file = path.join(/*turbopackIgnore: true*/ animationDir(), name, files[ext][0]);
  const info = await stat(/*turbopackIgnore: true*/ file).catch(() => null);
  if (!info?.isFile()) return new Response('This animation has expired. Ask again to render it.', {status: 404});
  if (ext !== 'mp4') {
    const body = Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ file)) as ReadableStream;
    return new Response(body, {
      headers: {'content-type': files[ext][1], 'content-length': String(info.size), 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff'},
    });
  }

  const size = info.size;
  const headers: Record<string, string> = {
    'content-type': 'video/mp4',
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
    'content-disposition': `inline; filename="lemmaslop-${name.slice(0, 8)}.mp4"`,
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, {status: 416, headers: {'content-range': `bytes */${size}`}});
    const body = Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ file, {start, end})) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: {...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1)},
    });
  }
  const body = Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ file)) as ReadableStream;
  return new Response(body, {headers: {...headers, 'content-length': String(size)}});
}
