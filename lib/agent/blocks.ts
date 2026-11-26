// The answer model writes JSON Lines in this small block vocabulary. The agent
// validates each line and translates it into A2UI components, so the model
// never emits raw A2UI and cannot reach components outside the catalog.

import {z} from 'zod';
import {STATEMENT_KINDS} from '../a2ui/catalog-api';

const text = z.string().trim().min(1).max(4000);

export const BlockSchema = z.discriminatedUnion('t', [
  z.object({t: z.literal('p'), md: text}),
  z.object({t: z.literal('eq'), tex: text}),
  z.object({
    t: z.literal('steps'),
    title: z.string().max(120).optional(),
    items: z
      .array(z.object({md: text, tex: z.string().max(2000).optional()}))
      .min(1)
      .max(12),
  }),
  z.object({
    t: z.literal('stmt'),
    kind: z.enum(STATEMENT_KINDS),
    title: z.string().max(120).optional(),
    md: text,
    cite: z.union([z.number().int(), z.string()]).optional(),
  }),
  z.object({t: z.literal('caveat'), md: text}),
  z.object({t: z.literal('followups'), items: z.array(z.string().trim().min(3).max(160)).min(1).max(4)}),
  z.object({
    t: z.literal('anim'),
    title: z.string().trim().max(120).optional(),
    code: z.string().trim().min(20).max(12000),
    /** Spoken lines; the scene starts line i with narrate(self, i). */
    narration: z.array(z.string().trim().min(2).max(280)).max(10).optional(),
  }),
]);

export type Block = z.infer<typeof BlockSchema>;

/**
 * Incremental JSON Lines parser: feed text deltas, get complete blocks out.
 * Lines that are not valid blocks are reported through `onReject` and skipped.
 */
export class BlockStreamParser {
  private buffer = '';

  /**
   * @param lenient Small models sometimes drop out of JSON Lines mid-answer.
   *   When set, a non-JSON line of plain text becomes a paragraph instead of
   *   being discarded. Lines that parse as JSON but break the schema are still
   *   rejected.
   */
  constructor(
    private readonly onReject: (line: string, reason: string) => void = () => {},
    private readonly lenient = false,
  ) {}

  push(delta: string): Block[] {
    this.buffer += delta;
    const out: Block[] = [];
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      const block = this.parseLine(line);
      if (block) out.push(block);
    }
    return out;
  }

  flush(): Block[] {
    const rest = this.buffer;
    this.buffer = '';
    const block = this.parseLine(rest);
    return block ? [block] : [];
  }

  private parseLine(raw: string): Block | null {
    const line = raw.trim().replace(/^```(?:json|jsonl)?$/, '');
    if (!line) return null;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      if (this.lenient && !/^[{\[]/.test(line)) {
        const md = line.replace(/^#{1,6}\s+/, '').trim();
        if (md) return {t: 'p', md: md.slice(0, 4000)};
      }
      this.onReject(line, 'not JSON');
      return null;
    }
    const parsed = BlockSchema.safeParse(json);
    if (!parsed.success) {
      this.onReject(line, parsed.error.issues[0]?.message ?? 'invalid block');
      return null;
    }
    return parsed.data;
  }
}

/** Plain-text rendering of blocks, used as conversation memory for follow-ups. */
export function blocksToTranscript(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.t) {
        case 'p':
        case 'caveat':
          return b.md;
        case 'eq':
          return `$$${b.tex}$$`;
        case 'steps':
          return b.items.map((s, i) => `${i + 1}. ${s.md}${s.tex ? ` $$${s.tex}$$` : ''}`).join('\n');
        case 'stmt':
          return `${b.kind}${b.title ? ` (${b.title})` : ''}. ${b.md}${b.cite !== undefined ? ` [${b.cite}]` : ''}`;
        case 'anim':
          return `[Manim animation${b.title ? `: ${b.title}` : ''}]`;
        case 'followups':
          return '';
      }
    })
    .filter(Boolean)
    .join('\n\n');
}
