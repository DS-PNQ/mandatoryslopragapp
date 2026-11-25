---
id: clustering-emeans
title: k-means clustering and e-means
area: Data analysis
---
## The k-means objective

Given points $x_1, \ldots, x_n \in \mathbb R^d$ and an integer $k$, k-means seeks centroids $c_1, \ldots, c_k$ minimizing the mean squared distance from each point to its nearest centroid,

$$\mathcal L(c) = \frac1n\sum_{i=1}^n \min_j \|x_i - c_j\|^2.$$

The problem is NP-hard in general, so practical algorithms find local minima. Uses include clustering, vector quantization and compression, image segmentation, data curation, and building inverted-file indexes for nearest-neighbour search.

## Lloyd's algorithm

Lloyd's algorithm alternates two steps: assign each point to its nearest centroid, then move each centroid to the mean of its assigned points. Each step cannot increase $\mathcal L$, so the loss decreases monotonically and the algorithm terminates at a fixed point, typically a local minimum. Each iteration costs $O(nkd)$ for the assignment. k-means++ seeding picks each new initial centroid with probability proportional to its squared distance from the centroids already chosen, which gives an $O(\log k)$-competitive expected loss.

## Mini-batch updates with exponential moving averages

e-means (Bessa et al., 2026) runs mini-batch k-means with exponential-moving-average (EMA) centroid updates. Each cluster keeps a count $N_j$ and a sum $S_j$; for a batch, with $n_j$ and $s_j$ the count and sum of the batch points assigned to $j$,

$$N_j \leftarrow \gamma N_j + (1-\gamma)n_j, \qquad S_j \leftarrow \gamma S_j + (1-\gamma)s_j,$$

and the centroid is read off as $c_j = S_j/N_j$. Initialization sets $N_j = 10^{-10}$ and $S_j = N_jc_j^{(0)}$ from randomly chosen data points, so the initial centroids carry almost no weight once real batches arrive.

## Cosine-annealed step size

e-means anneals the step $\alpha = 1 - \gamma$ on a cosine schedule from a peak $\alpha_0$ to a floor $\varepsilon\alpha_0$ over the $M$ updates of a run:

$$\alpha(t) = \alpha_0\Big(\varepsilon + (1-\varepsilon)\tfrac12\big(1 + \cos(\pi t/M)\big)\Big), \qquad \varepsilon = 0.1.$$

With $T$ epochs and batch size $B$ there are $M = T\lfloor n/B\rfloor$ updates. Large early steps let centroids travel; small late steps let them settle. The ablation in the paper shows the schedule helps both train and test loss on most datasets.

## Dead cluster revival by splitting

A cluster that stops receiving points becomes a dead centroid. Every five batches, e-means revives clusters whose count has fallen below $\tau = 0.1$ of the mean count. Each dead slot takes over half of a donor cluster drawn with probability proportional to $N_j$: the donor centroid is perturbed as $c \odot (1 \pm \delta, 1 \mp \delta, \ldots)$ into two children with alternating signs, each child gets count $N_{j'}/2$, and the sums are rewritten as $S = cN$. In the paper's ablation this revival rule matters more than any other component, cutting dead clusters from 26% to 0.3% on one benchmark.

## Finalization and scaling laws

After the last epoch, e-means replaces each centroid by the mean of the points assigned to it in that epoch (last-epoch-mean), which is guaranteed not to increase the training loss; a slow EMA of centroids is an alternative that generalizes better to new points. The paper fits power-law rules for the hyperparameters: the peak step $\alpha_0 = \min(0.824\,k^{-0.46}B^{0.90}n^{-0.45}T^{-0.11}, 1)$ and the batch size $B = 0.035\,k^{0.13}n^{0.88}T^{0.81}$ rounded to a power of two and capped at $n$. With these rules e-means beats the loss of 25 Lloyd epochs in about 1.4 to 2.6 epochs on embedding datasets.
