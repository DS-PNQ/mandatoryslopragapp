---
id: combinatorics
title: Counting and combinatorics
area: Combinatorics
---
## Permutations and combinations

The number of ordered arrangements of $k$ objects chosen from $n$ is $n!/(n-k)!$, and the number of unordered selections is $\binom nk = \frac{n!}{k!(n-k)!}$. Pascal's rule $\binom nk = \binom{n-1}{k-1} + \binom{n-1}{k}$ splits on whether a fixed element is chosen. Stars and bars: the number of ways to write $n$ as an ordered sum of $k$ nonnegative integers is $\binom{n+k-1}{k-1}$. A 5-card hand from 52 cards can be chosen in $\binom{52}{5} = 2{,}598{,}960$ ways.

## Binomial theorem

For any $x, y$ in a commutative ring and integer $n \ge 0$,

$$(x+y)^n = \sum_{k=0}^n \binom nk x^k y^{n-k}.$$

Setting $x = y = 1$ gives $\sum_k\binom nk = 2^n$, the number of subsets of an $n$-set; setting $x = -1, y = 1$ gives $\sum_k(-1)^k\binom nk = 0$ for $n \ge 1$. Vandermonde's identity $\binom{m+n}{r} = \sum_k\binom mk\binom n{r-k}$ follows by comparing coefficients in $(1+x)^m(1+x)^n$.

## Inclusion–exclusion

For finite sets, $|A_1\cup\cdots\cup A_n| = \sum|A_i| - \sum_{i<j}|A_i\cap A_j| + \cdots + (-1)^{n+1}|A_1\cap\cdots\cap A_n|$. Derangements, permutations with no fixed point, number $D_n = n!\sum_{k=0}^n\frac{(-1)^k}{k!}$, so the probability that a random permutation has no fixed point tends to $1/e$. Euler's totient formula $\varphi(n) = n\prod_{p\mid n}(1 - 1/p)$ is also inclusion–exclusion over the prime divisors.

## Pigeonhole principle

If $n + 1$ objects are placed in $n$ boxes, some box holds at least two. More generally some box holds at least $\lceil N/n\rceil$ of $N$ objects. Examples: among any $n+1$ integers two have the same remainder mod $n$; any $5$ points in a unit square include two within distance $\frac{\sqrt2}{2}$; and every sequence of $n^2 + 1$ distinct reals contains a monotone subsequence of length $n + 1$ (Erdős–Szekeres).

## Recurrences and generating functions

A linear recurrence $a_n = c_1a_{n-1} + c_2a_{n-2}$ is solved by the roots of $r^2 = c_1r + c_2$. For Fibonacci numbers $F_n = F_{n-1} + F_{n-2}$ the roots are $\varphi = \frac{1+\sqrt5}{2}$ and $\psi = \frac{1-\sqrt5}{2}$, giving Binet's formula $F_n = \frac{\varphi^n - \psi^n}{\sqrt5}$. The generating function $\sum F_nx^n = \frac{x}{1 - x - x^2}$ encodes the same information. Catalan numbers $C_n = \frac{1}{n+1}\binom{2n}{n}$ count balanced parenthesizations and binary trees with $n$ internal nodes.
