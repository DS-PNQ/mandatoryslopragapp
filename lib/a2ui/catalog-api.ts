// Component APIs for the math answer catalog. Shared by the agent (which emits
// A2UI v1.0 messages using these names) and the React renderer (which
// implements them). No React imports here so the server and tests can use it.

import {z} from 'zod';
import {CommonSchemas} from '@a2ui/web_core/v1_0';

export const MATH_CATALOG_ID = 'https://lemma.local/a2ui/catalogs/math/v1/catalog.json';

const Markdown = CommonSchemas.DynamicString.describe(
  'Markdown with inline math in $...$ and display math in $$...$$. Cite passages as [1], [2].',
);

export const PageApi = {
  name: 'Page',
  schema: z
    .object({
      body: CommonSchemas.ChildList.describe('Answer content, top to bottom.'),
      margin: CommonSchemas.ChildList.describe('Marginal apparatus: sources and the retrieval trace.'),
    })
    .strict(),
};

export const QuestionApi = {
  name: 'Question',
  schema: z.object({text: CommonSchemas.DynamicString}).strict(),
};

export const StatusApi = {
  name: 'Status',
  schema: z
    .object({
      text: CommonSchemas.DynamicString,
      busy: CommonSchemas.DynamicBoolean.optional(),
    })
    .strict(),
};

export const ProseApi = {
  name: 'Prose',
  schema: z.object({markdown: Markdown}).strict(),
};

export const EquationApi = {
  name: 'Equation',
  schema: z
    .object({
      tex: CommonSchemas.DynamicString.describe('Display-mode LaTeX without surrounding $$.'),
      number: CommonSchemas.DynamicString.optional().describe('Equation number shown in the margin, e.g. "1".'),
    })
    .strict(),
};

export const DerivationApi = {
  name: 'Derivation',
  allowedChildren: ['Step'],
  schema: z
    .object({
      title: CommonSchemas.DynamicString.optional(),
      steps: CommonSchemas.ChildList,
    })
    .strict(),
};

export const StepApi = {
  name: 'Step',
  allowedParents: ['Derivation'],
  schema: z
    .object({
      markdown: Markdown,
      tex: CommonSchemas.DynamicString.optional().describe('Optional display equation for this step.'),
    })
    .strict(),
};

export const STATEMENT_KINDS = ['Theorem', 'Definition', 'Lemma', 'Corollary', 'Proposition', 'Example', 'Remark'] as const;

export const StatementApi = {
  name: 'Statement',
  schema: z
    .object({
      kind: z.enum(STATEMENT_KINDS),
      title: CommonSchemas.DynamicString.optional(),
      markdown: Markdown,
      cite: CommonSchemas.DynamicString.optional().describe('Citation marker such as "2".'),
    })
    .strict(),
};

export const CaveatApi = {
  name: 'Caveat',
  schema: z.object({markdown: Markdown}).strict(),
};

export const SourcesApi = {
  name: 'Sources',
  schema: z
    .object({
      items: CommonSchemas.DynamicValue.describe('Bound to the retrieved passages, e.g. {"@path": "/sources"}.'),
    })
    .strict(),
};

export const TraceApi = {
  name: 'Trace',
  schema: z
    .object({
      data: CommonSchemas.DynamicValue.describe('Bound to the retrieval trace, e.g. {"@path": "/trace"}.'),
    })
    .strict(),
};

export const FollowUpsApi = {
  name: 'FollowUps',
  allowedChildren: ['FollowUp'],
  schema: z.object({items: CommonSchemas.ChildList}).strict(),
};

export const FollowUpApi = {
  name: 'FollowUp',
  allowedParents: ['FollowUps'],
  schema: z
    .object({
      label: CommonSchemas.DynamicString,
      action: CommonSchemas.Action,
    })
    .strict(),
};

export const MATH_COMPONENT_APIS = [
  PageApi,
  QuestionApi,
  StatusApi,
  ProseApi,
  EquationApi,
  DerivationApi,
  StepApi,
  StatementApi,
  CaveatApi,
  SourcesApi,
  TraceApi,
  FollowUpsApi,
  FollowUpApi,
];

/** Shape of one entry in the `/sources` data model array. */
export interface SourceEntry {
  n: number;
  chunkId: string;
  note: string;
  area: string;
  section: number;
  heading: string;
  excerpt: string;
  fused: number;
  denseRank: number | null;
  bm25Rank: number | null;
  cell: number;
}

/** Shape of the `/trace` data model object. */
export interface TraceEntry {
  cells: {id: number; distance: number; size: number; terms: string[]}[];
  k: number;
  scanned: number;
  total: number;
  denseRecall: number | null;
  elapsedMs: number;
  queryTerms: string[];
  unknownTerms: string[];
  model: string;
}
