---
id: sequences-limits
title: Sequences and limits
area: Real analysis
---
## Limit of a sequence

A sequence $(a_n)$ converges to $L$ if for every $\varepsilon > 0$ there is an $N$ such that $|a_n - L| < \varepsilon$ for all $n \ge N$. We write $\lim_{n\to\infty} a_n = L$. The definition says that past some index, every term lies inside the band $(L-\varepsilon, L+\varepsilon)$, however narrow the band is chosen. Limits are unique: if $a_n \to L$ and $a_n \to M$, taking $\varepsilon = |L-M|/2$ gives a contradiction unless $L = M$. A convergent sequence is bounded, since all but finitely many terms lie within $1$ of $L$.

## Algebra of limits

If $a_n \to a$ and $b_n \to b$, then $a_n + b_n \to a + b$, $a_n b_n \to ab$, and $a_n / b_n \to a/b$ provided $b \ne 0$. For the product, write $a_n b_n - ab = a_n(b_n - b) + b(a_n - a)$ and use that $(a_n)$ is bounded. These rules let you compute limits such as $\lim \frac{3n^2 + 1}{n^2 - 5} = 3$ by dividing numerator and denominator by $n^2$.

## Monotone convergence theorem

Every bounded monotone sequence of real numbers converges. If $(a_n)$ is increasing and bounded above, then $a_n \to \sup_n a_n$. The proof uses the completeness axiom: let $s = \sup a_n$; for $\varepsilon > 0$ some $a_N > s - \varepsilon$, and monotonicity gives $s - \varepsilon < a_n \le s$ for all $n \ge N$. Example: $a_1 = \sqrt 2$, $a_{n+1} = \sqrt{2 + a_n}$ is increasing and bounded by $2$, so it converges to the fixed point $L = \sqrt{2+L}$, i.e. $L = 2$.

## Squeeze theorem

If $b_n \le a_n \le c_n$ for all large $n$ and $b_n \to L$, $c_n \to L$, then $a_n \to L$. Example: $0 \le \frac{\sin^2 n}{n} \le \frac1n$, so $\frac{\sin^2 n}{n} \to 0$. The same argument works for functions: $-|x| \le x\sin(1/x) \le |x|$ shows $x \sin(1/x) \to 0$ as $x \to 0$.

## Cauchy sequences and completeness

A sequence is Cauchy if for every $\varepsilon > 0$ there is $N$ with $|a_m - a_n| < \varepsilon$ for all $m, n \ge N$. In $\mathbb R$ a sequence converges if and only if it is Cauchy; this is one form of the completeness of the real numbers. The rationals are not complete: the decimal truncations of $\sqrt 2$ form a Cauchy sequence of rationals with no rational limit. The Bolzano–Weierstrass theorem, that every bounded real sequence has a convergent subsequence, is equivalent to completeness.
