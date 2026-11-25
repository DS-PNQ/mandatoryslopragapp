---
id: nearest-neighbor-search
title: Vector search and inverted file indexes
area: Data analysis
---
## Nearest-neighbour search

Given a database of vectors and a query $q$, nearest-neighbour search returns the database vectors minimizing a distance, usually Euclidean $\|q - x\|$ or the cosine distance $1 - \frac{q\cdot x}{\|q\|\|x\|}$. For unit vectors the two orderings agree, because $\|q - x\|^2 = 2 - 2\,q\cdot x$. Exhaustive search costs $O(nd)$ per query, which motivates approximate methods that trade a little recall for large speedups.

## Inverted file index (IVF)

An inverted file index partitions the database with k-means into $k$ cells. Each vector is stored in the list of its nearest centroid. At query time the index computes distances from $q$ to the $k$ centroids, visits only the $n_{\text{probe}}$ closest lists, and ranks the vectors found there exactly. The cost per query is roughly $O(kd + n_{\text{probe}}\frac{n}{k}d)$, minimized near $k \propto \sqrt n$. Recall@$m$ measures how often the true nearest neighbour appears among the $m$ results.

## Why clustering quality matters for recall

If a query's true neighbour sits in a cell whose centroid is not among the $n_{\text{probe}}$ closest, the IVF misses it. Lower k-means loss means tighter, better-placed cells, so a fixed $n_{\text{probe}}$ covers more of the true neighbourhood. The e-means paper measures this on the VIBE benchmark with $k = 4\sqrt n$ rounded to a power of two, and finds e-means reaches the converged recall of Flash-KMeans after far fewer training epochs.

## Lexical retrieval with BM25

BM25 scores a document $D$ for query terms $q_i$ as $\sum_i \operatorname{IDF}(q_i)\frac{f(q_i,D)(k_1+1)}{f(q_i,D) + k_1(1 - b + b\,|D|/\overline{|D|})}$, where $f$ is term frequency, $|D|$ the document length, and typical constants are $k_1 \approx 1.2$, $b \approx 0.75$. The IDF term $\ln\big(1 + \frac{N - n_q + 0.5}{n_q + 0.5}\big)$ downweights common words. Lexical scores reward exact symbol matches, such as $\nabla$ or a theorem name, that dense embeddings can blur.

## Hybrid ranking with reciprocal rank fusion

Reciprocal rank fusion combines ranked lists without calibrating their scores: a document's fused score is $\sum_r \frac{1}{k_{\text{rrf}} + \operatorname{rank}_r(d)}$ over the rankers $r$ that returned it, with $k_{\text{rrf}} = 60$ as the usual constant. A document ranked well by both a dense retriever and BM25 rises to the top, while one found by a single ranker still contributes. Fusion is robust because it depends only on ranks.

## Latent semantic analysis

Latent semantic analysis builds a term–document matrix of TF-IDF weights and keeps its top $r$ singular directions, $X \approx U_r\Sigma_rV_r^\top$. Documents are embedded as rows of $U_r\Sigma_r$, and a query vector $q$ in term space is folded in as $qV_r$, with $V_r = X^\top U_r\Sigma_r^{-1}$. Terms that co-occur, such as "eigenvalue" and "diagonalizable", end up close in the reduced space, so a query can match a passage that shares no exact word with it.
