# Lemma

Lemma answers math questions from a small library of study notes. You ask in plain words or LaTeX and get an answer typeset like a page from a handbook: numbered display equations, ordered derivation steps, theorem statements, and a citation on every claim that points back to the passage it came from.

It combines two things:

- **A2UI** ([a2ui-project/a2ui](https://github.com/a2ui-project/a2ui)). The answer agent does not return text. It streams A2UI v1.0 messages (`createSurface`, `updateComponents`, `updateDataModel`) that describe the answer with a custom math component catalog, and the page renders them with `@a2ui/react`. Follow-up questions are A2UI actions.
- **e-means** ([arXiv:2611.09501](https://arxiv.org/abs/2611.09501), Bessa et al.), mini-batch k-means with exponential-moving-average centroids. It partitions the passage embeddings into the cells of an inverted-file (IVF) index, the use case the paper measures in its Appendix L.

## How a question is answered

1. **Embed.** The question is tokenized (LaTeX commands kept as words, so `\nabla` matches "nabla") and folded into the LSA space built from the notes: TF-IDF, then a truncated SVD to 64 dimensions.
2. **Probe.** The nearest 8 of 32 e-means cells are scanned and the passages in them ranked by cosine similarity. The page reports how many passages were scanned and the recall against an exhaustive scan.
3. **Fuse.** BM25 ranks all passages lexically. Reciprocal rank fusion (k = 60) combines the two lists, and the top 6 passages go to the model.
4. **Write.** The model writes JSON Lines in a small block vocabulary (paragraph, equation, steps, statement, caveat, follow-ups). The server validates each line and translates it into A2UI components, so the model can never place a component outside the catalog or inject HTML.
5. **Render.** The browser's A2UI `MessageProcessor` applies the messages as they arrive. Markdown is escaped before parsing, links are dropped, and KaTeX runs with `trust: false`.

## The e-means implementation

`lib/rag/emeans.ts` follows Algorithm 1 of the paper:

- EMA count and sum per cluster (Eq. 2–4), with `N_j` initialised at 1e-10 so the random initial centroids carry almost no weight
- cosine-annealed step α(t) from α₀ down to 0.1·α₀ (Eq. 5)
- dead-cluster revival every 5 batches: clusters under τ = 0.1 of the mean count take half of a donor drawn in proportion to its count, split by a ±δ perturbation with δ = 2⁻⁷ (Appendix H)
- last-epoch-mean finalization (Section 3.2)
- the paper's scaling laws for the peak step α₀ (Eq. 6) and batch size B (Eq. 7)
- k = 4√n rounded to a power of two, as in the paper's IVF experiments

The Library page (`/library`) shows the result against Lloyd's algorithm, as medians over 9 seeds. On this corpus e-means beats Lloyd's 25-iteration loss with a 12-epoch budget, not the 1.4–2.6 epochs the paper reports. That is expected: the paper's laws are fitted on millions of vectors, and here there are 110 vectors, about 3.4 per cell.

## Models

The composer lets you choose the model for each question. Configure at least one; with none, the app runs in retrieval-only mode and quotes the best passages.

| Model | Configure |
|---|---|
| Opus 5.5 (Anthropic API) | `ANTHROPIC_API_KEY` |
| LFM3 1.7B (Liquid AI, open weights), local | `LFM3_BASE_URL` pointing at llama.cpp or Ollama |
| LFM3 1.7B, hosted on OpenRouter | `OPENROUTER_API_KEY` (model `liquid/lfm-3-1.7b`) |

Opus requests stream with adaptive thinking at `high` effort and use the server-side refusal fallback. LFM3 requests use the model card's math sampling (temperature 1.0, top_p 0.95, top_k 20). LFM3 reasons by default, so its `<think>` trace is filtered out of the answer and shown as a progress line instead.

## Run it locally

Requires Node 20 or newer.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Then fill in at least one model in `.env.local`. To run LFM3 on your machine with llama.cpp (b11960 or newer):

```bash
llama-server -hf LiquidAI/LFM3-1.7B-GGUF:Q4_K_M --jinja --port 8080
```

and set `LFM3_BASE_URL=http://127.0.0.1:8080/v1`. With Ollama 0.40.12 or newer, run `ollama run lfm3` and set `LFM3_BASE_URL=http://127.0.0.1:11434/v1` and `LFM3_MODEL=lfm3`.

Start the app:

```bash
npm run dev
```

It opens on http://localhost:3000. `npm run dev` and `npm run build` rebuild the index from `content/notes/` first, which takes about a second.

## Tests

```bash
npm test
```

The tests run the Opus and LFM3 paths against local mock servers (no keys or network), and check that every message the agent emits passes the A2UI `MessageProcessor`'s validation for the catalog. They also cover the reasoning-trace filter and the markdown sanitizer.

## Deploy on Vercel

The repository deploys as a standard Next.js project; `vercel.json` sets the build command. In the Vercel project settings, add `ANTHROPIC_API_KEY` and/or `OPENROUTER_API_KEY` as environment variables. A local `LFM3_BASE_URL` will not be reachable from Vercel, so use OpenRouter for LFM3 there.

## Adding notes

Each file in `content/notes/` is one note with frontmatter (`id`, `title`, `area`). Every `## ` section becomes one retrievable passage. Write math in `$…$` and `$$…$$`.

## Layout

```
content/notes/          the library (21 notes, 110 passages)
lib/rag/                tokenizer, LSA, e-means, IVF + BM25 retrieval
lib/a2ui/catalog-api.ts the math component catalog (Zod schemas)
lib/agent/              answer pipeline, model clients, A2UI surface writer
components/catalog.tsx  React implementations of the catalog
components/Workspace.tsx  ask workspace (processor, streaming, composer)
app/library/            index report and e-means training curves
scripts/build-index.ts  builds generated/index.json
```
