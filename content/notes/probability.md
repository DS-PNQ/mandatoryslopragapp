---
id: probability
title: Probability foundations
area: Probability
---
## Axioms and basic rules

A probability measure assigns to events $A \subseteq \Omega$ numbers with $P(A) \ge 0$, $P(\Omega) = 1$, and $P(\bigcup A_i) = \sum P(A_i)$ for disjoint events. Consequences: $P(A^c) = 1 - P(A)$, and inclusion–exclusion $P(A\cup B) = P(A) + P(B) - P(A\cap B)$. For equally likely outcomes $P(A) = |A|/|\Omega|$; for two fair dice, $P(\text{sum} = 7) = 6/36 = 1/6$.

## Conditional probability and Bayes' theorem

$P(A\mid B) = P(A\cap B)/P(B)$ for $P(B) > 0$. The law of total probability says $P(B) = \sum_i P(B\mid A_i)P(A_i)$ for a partition $\{A_i\}$, and Bayes' theorem inverts conditioning:

$$P(A\mid B) = \frac{P(B\mid A)\,P(A)}{P(B)}.$$

Example: a test with 99% sensitivity and 95% specificity for a condition with 1% prevalence gives $P(\text{ill}\mid +) = \frac{0.99\cdot0.01}{0.99\cdot0.01 + 0.05\cdot0.99} = \frac{1}{6} \approx 16.7\%$. Events are independent when $P(A\cap B) = P(A)P(B)$.

## Expectation and variance

For a discrete random variable, $E[X] = \sum x\,P(X = x)$; for a density, $E[X] = \int x f(x)\,dx$. Expectation is linear, $E[aX + bY] = aE[X] + bE[Y]$, with no independence needed. Variance $\operatorname{Var}X = E[(X - EX)^2] = E[X^2] - (EX)^2$, and $\operatorname{Var}(aX + b) = a^2\operatorname{Var}X$. For independent $X, Y$, $\operatorname{Var}(X+Y) = \operatorname{Var}X + \operatorname{Var}Y$. Markov's inequality $P(X \ge a) \le E[X]/a$ for $X \ge 0$ implies Chebyshev's $P(|X - \mu| \ge k\sigma) \le 1/k^2$.

## Common distributions

Bernoulli$(p)$: mean $p$, variance $p(1-p)$. Binomial$(n,p)$: $P(X = k) = \binom nk p^k(1-p)^{n-k}$, mean $np$, variance $np(1-p)$. Poisson$(\lambda)$: $P(X = k) = e^{-\lambda}\lambda^k/k!$, mean and variance $\lambda$. Geometric$(p)$ (trials until first success): mean $1/p$. Exponential$(\lambda)$: density $\lambda e^{-\lambda x}$, mean $1/\lambda$, memoryless. Normal $N(\mu,\sigma^2)$: density $\frac{1}{\sigma\sqrt{2\pi}}e^{-(x-\mu)^2/2\sigma^2}$, with about 68%, 95% and 99.7% of mass within 1, 2 and 3 standard deviations.

## Law of large numbers and central limit theorem

Let $X_1, X_2, \ldots$ be i.i.d. with mean $\mu$ and variance $\sigma^2 < \infty$, and $\bar X_n = \frac1n\sum X_i$. The weak law of large numbers says $\bar X_n \to \mu$ in probability; it follows from Chebyshev since $\operatorname{Var}\bar X_n = \sigma^2/n$. The central limit theorem says

$$\frac{\sqrt n(\bar X_n - \mu)}{\sigma} \xrightarrow{d} N(0,1).$$

So for $100$ fair coin flips the number of heads is approximately $N(50, 25)$, and $P(\text{heads} \ge 60) \approx P(Z \ge 1.9) \approx 0.029$ with the continuity correction.
