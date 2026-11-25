---
id: proof-techniques
title: Proof techniques
area: Foundations
---
## Mathematical induction

To prove $P(n)$ for all $n \ge n_0$: prove the base case $P(n_0)$, then show $P(k) \Rightarrow P(k+1)$. Example: $\sum_{i=1}^n i = \frac{n(n+1)}{2}$; if true for $k$, then $\sum_{i=1}^{k+1} i = \frac{k(k+1)}{2} + (k+1) = \frac{(k+1)(k+2)}{2}$. Strong induction assumes $P(n_0), \ldots, P(k)$ to prove $P(k+1)$, which is how existence of prime factorizations is shown. Induction is equivalent to the well-ordering of $\mathbb N$.

## Proof by contradiction

Assume the statement is false and derive a contradiction. Classic example: $\sqrt2$ is irrational. Suppose $\sqrt2 = p/q$ in lowest terms. Then $p^2 = 2q^2$, so $p^2$ is even and hence $p$ is even, $p = 2m$. Then $4m^2 = 2q^2$ gives $q^2 = 2m^2$, so $q$ is even too, contradicting lowest terms. The same pattern shows $\sqrt n$ is irrational unless $n$ is a perfect square.

## Contrapositive and direct proof

The contrapositive of $P \Rightarrow Q$ is $\lnot Q \Rightarrow \lnot P$, which is logically equivalent; the converse $Q \Rightarrow P$ is not. Example: to show "if $n^2$ is even then $n$ is even", prove instead "if $n$ is odd then $n^2$ is odd": $(2k+1)^2 = 2(2k^2 + 2k) + 1$. A direct proof chains definitions forward, such as showing the sum of two even numbers $2a + 2b = 2(a+b)$ is even.

## Counterexamples and quantifiers

A universal claim $\forall x\,P(x)$ is refuted by a single $x$ with $\lnot P(x)$; its negation is $\exists x\,\lnot P(x)$. Negating swaps quantifiers: the negation of "for every $\varepsilon > 0$ there is $\delta > 0$ such that..." is "there is $\varepsilon > 0$ such that for every $\delta > 0$...". Example: "every continuous function is differentiable" fails at $|x|$; "$n^2 + n + 41$ is always prime" fails at $n = 40$, where it equals $41^2$.

## Extremal and invariant arguments

Some proofs pick an extremal object (the smallest counterexample, the longest path) and show it cannot exist or has a needed property. Invariants are quantities preserved by every allowed move: a chessboard with two opposite corners removed cannot be tiled by dominoes, because each domino covers one black and one white square while the board has $32$ squares of one colour and $30$ of the other. Infinite descent, used by Fermat, combines both ideas.
