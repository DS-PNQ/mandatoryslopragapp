import type {Chunk} from './types';

export interface ParsedNote {
  id: string;
  title: string;
  area: string;
  sections: {heading: string; body: string}[];
}

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseNote(source: string): ParsedNote {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
  if (!match) throw new Error('note is missing frontmatter');
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const key of ['id', 'title', 'area']) if (!meta[key]) throw new Error(`note frontmatter lacks ${key}`);

  const sections: ParsedNote['sections'] = [];
  for (const part of match[2].split(/^## /m).slice(1)) {
    const nl = part.indexOf('\n');
    sections.push({heading: part.slice(0, nl).trim(), body: part.slice(nl + 1).trim()});
  }
  return {id: meta.id, title: meta.title, area: meta.area, sections};
}

export function toChunks(note: ParsedNote): Chunk[] {
  return note.sections.map((s, i) => ({
    id: `${note.id}#${slugify(s.heading)}`,
    noteId: note.id,
    noteTitle: note.title,
    area: note.area,
    heading: s.heading,
    section: i + 1,
    text: s.body,
  }));
}
