// Tokenizer shared by index build and query time. Keeps LaTeX command names
// (\nabla -> "nabla") so symbolic queries still match, and applies a light,
// deterministic suffix stemmer.

const STOPWORDS = new Set(
  (
    'a an and are as at be because been but by can do does for from has have how if in into is it its ' +
    'let more most no not of on once only or other our out over same so some such than that the their them ' +
    'then there these they this those through to too under until up very was we were what when where which ' +
    'while who why will with you your i me my also any all each every both just should would could may might ' +
    'must shall about above after again against before below between during further here own off whose whom ' +
    'gives give given get got use used using via per one two three e g eg ie mathrm text frac left right ' +
    'quad qquad cdots ldots dots displaystyle tfrac le ge'
  ).split(/\s+/),
);

// Derivational suffixes, longest first. A suffix is removed only when at least
// four letters remain, so "integrate", "integration" and "integral" meet at "integr".
const SUFFIXES = [
  'izations', 'ization', 'izable', 'ational', 'ations', 'ation', 'ically', 'ators', 'ities', 'ously', 'ments',
  'ator', 'ible', 'able', 'ical', 'ence', 'ance', 'ment', 'ness', 'ally', 'ity', 'ous', 'ive', 'ize',
  'ate', 'ant', 'ent', 'ism', 'ist', 'al', 'ic', 'iz',
];

export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !/(ss|us|is|ys)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed') && !w.endsWith('eed')) w = w.slice(0, -2);
  if (w.length > 5 && w.endsWith('ly')) w = w.slice(0, -2);
  for (const suffix of SUFFIXES) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

/** Splits text (prose + inline LaTeX) into raw lowercase words. */
export function words(text: string): string[] {
  const normalized = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\\([a-zA-Z]+)/g, ' $1 ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase();
  return normalized.split(' ').filter(Boolean);
}

export interface Token {
  stem: string;
  surface: string;
  /** True when the word came from a LaTeX command such as \\nabla. */
  command: boolean;
}

export function tokenize(text: string): Token[] {
  // "p-value", "k-means" and "e-means" also count as single joined words.
  const compounds = [...text.matchAll(/\b([a-zA-Z])-([a-zA-Z]{3,})\b/g)].map((m) => (m[1] + m[2]).toLowerCase());
  const commands = new Set<string>();
  for (const m of text.matchAll(/\\([a-zA-Z]+)/g)) commands.add(m[1].toLowerCase());
  const out: Token[] = [];
  for (const w of words(text)) {
    if (w.length < 2 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    out.push({stem: stem(w), surface: w, command: commands.has(w)});
  }
  for (const c of compounds) out.push({stem: c, surface: c, command: false});
  return out;
}

export function termCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokenize(text)) counts.set(t.stem, (counts.get(t.stem) ?? 0) + 1);
  return counts;
}
