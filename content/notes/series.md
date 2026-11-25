---
id: series
title: Infinite series and convergence tests
area: Real analysis
---
## Geometric series

For a real or complex ratio $r$, the partial sums of $\sum_{n=0}^\infty r^n$ are $S_N = \frac{1 - r^{N+1}}{1 - r}$ when $r \ne 1$, which follows from $S_N - rS_N = 1 - r^{N+1}$. If $|r| < 1$ then $r^{N+1} \to 0$, so

$$\sum_{n=0}^{\infty} r^n = \frac{1}{1-r}, \qquad |r| < 1.$$

If $|r| \ge 1$ the terms do not tend to zero and the series diverges. Example: $0.999\ldots = \frac{9}{10}\sum_{n\ge0} 10^{-n} = \frac{9}{10}\cdot\frac{1}{1 - 1/10} = 1$.

## Divergence test and the harmonic series

If $\sum a_n$ converges then $a_n \to 0$, because $a_n = S_n - S_{n-1}$ and both partial sums tend to the same limit. The converse fails: the harmonic series $\sum 1/n$ diverges although $1/n \to 0$. Group terms: $1 + \frac12 + (\frac13 + \frac14) + (\frac15 + \cdots + \frac18) + \cdots \ge 1 + \frac12 + \frac12 + \frac12 + \cdots$, so $S_{2^k} \ge 1 + k/2$. In fact $S_N = \ln N + \gamma + o(1)$ with Euler's constant $\gamma \approx 0.5772$.

## p-series and the integral test

If $f$ is positive, continuous and decreasing on $[1, \infty)$ with $a_n = f(n)$, then $\sum a_n$ and $\int_1^\infty f(x)\,dx$ converge or diverge together. Applied to $f(x) = x^{-p}$: the $p$-series $\sum_{n\ge1} n^{-p}$ converges if and only if $p > 1$. For example $\sum 1/n^2 = \pi^2/6$ (the Basel problem), while $\sum 1/\sqrt n$ diverges.

## Comparison tests

If $0 \le a_n \le b_n$ and $\sum b_n$ converges, then $\sum a_n$ converges; if $\sum a_n$ diverges, so does $\sum b_n$. Limit comparison: if $a_n, b_n > 0$ and $a_n / b_n \to c$ with $0 < c < \infty$, the two series behave alike. Example: $\sum \frac{1}{n^2 + 3n}$ converges by limit comparison with $\sum 1/n^2$.

## Ratio and root tests

Let $L = \lim_{n\to\infty} |a_{n+1}/a_n|$. If $L < 1$ the series $\sum a_n$ converges absolutely; if $L > 1$ it diverges; if $L = 1$ the test is inconclusive. The root test uses $L = \limsup |a_n|^{1/n}$ with the same conclusions and is at least as strong. Example: for $\sum n^2/2^n$, the ratio is $\frac{(n+1)^2}{2n^2} \to \frac12$, so the series converges (its sum is $6$).

## Alternating series and absolute convergence

Leibniz test: if $b_n$ decreases to $0$, then $\sum (-1)^{n+1} b_n$ converges, and the error after $N$ terms is at most $b_{N+1}$. So $1 - \frac12 + \frac13 - \cdots = \ln 2$ converges, but only conditionally, since $\sum 1/n$ diverges. A series converges absolutely if $\sum |a_n|$ converges; absolute convergence implies convergence. Riemann's rearrangement theorem: a conditionally convergent series can be rearranged to converge to any real number, whereas an absolutely convergent one keeps its sum under every rearrangement.
