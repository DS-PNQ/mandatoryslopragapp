---
id: continuity
title: Continuity and compactness
area: Real analysis
---
## Continuity

$f$ is continuous at $a$ if for every $\varepsilon > 0$ there is $\delta > 0$ with $|f(x) - f(a)| < \varepsilon$ whenever $|x - a| < \delta$. Equivalently, $x_n \to a$ implies $f(x_n) \to f(a)$ (the sequential criterion). Sums, products, quotients (where defined) and compositions of continuous functions are continuous. The Dirichlet function, $1$ on rationals and $0$ on irrationals, is continuous nowhere.

## Intermediate value theorem

If $f$ is continuous on $[a,b]$ and $y$ lies between $f(a)$ and $f(b)$, then $f(c) = y$ for some $c \in [a,b]$. Proof sketch: let $c = \sup\{x \in [a,b] : f(x) \le y\}$ and use continuity on both sides of $c$. Applications: every odd-degree real polynomial has a real root, and the bisection method halves an interval with a sign change at each step, locating a root of $x^3 - x - 2$ in $[1,2]$ to within $2^{-k}$ after $k$ steps.

## Extreme value theorem

A continuous function on a closed bounded interval $[a,b]$ is bounded and attains its maximum and minimum. Both hypotheses matter: $1/x$ on $(0,1]$ is unbounded, and $x$ on $(0,1)$ has no maximum. The proof uses Bolzano–Weierstrass to extract a convergent subsequence from points where $f$ approaches its supremum. More generally, a continuous image of a compact set is compact.

## Uniform continuity

$f$ is uniformly continuous on $S$ if one $\delta$ works for every point: $|x - y| < \delta \Rightarrow |f(x) - f(y)| < \varepsilon$ for all $x, y \in S$. $x^2$ is continuous on $\mathbb R$ but not uniformly continuous, since $(x + \delta)^2 - x^2 = 2x\delta + \delta^2$ grows with $x$. Heine–Cantor theorem: a continuous function on a compact set is uniformly continuous. Lipschitz functions, $|f(x) - f(y)| \le K|x - y|$, are uniformly continuous with $\delta = \varepsilon/K$.

## Compactness and the Heine–Borel theorem

A subset $K$ of $\mathbb R^n$ is compact if every open cover has a finite subcover. Heine–Borel: $K \subseteq \mathbb R^n$ is compact if and only if it is closed and bounded. Equivalently (in metric spaces), every sequence in $K$ has a subsequence converging to a point of $K$. So $[0,1]$ and the unit sphere are compact, while $(0,1)$ and $\mathbb R$ are not. In infinite-dimensional spaces closed and bounded does not suffice: the unit ball of $\ell^2$ is not compact.

## Uniform convergence

$f_n \to f$ uniformly on $S$ if $\sup_{x\in S}|f_n(x) - f(x)| \to 0$. A uniform limit of continuous functions is continuous, and uniform convergence on $[a,b]$ allows $\lim\int f_n = \int\lim f_n$. Pointwise convergence is not enough: $x^n$ on $[0,1]$ converges pointwise to a discontinuous limit. The Weierstrass M-test: if $|f_n(x)| \le M_n$ and $\sum M_n < \infty$, then $\sum f_n$ converges uniformly.
