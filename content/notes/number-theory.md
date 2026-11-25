---
id: number-theory
title: Elementary number theory
area: Number theory
---
## Divisibility and the Euclidean algorithm

$a \mid b$ means $b = ak$ for some integer $k$. The division algorithm writes $a = qb + r$ with $0 \le r < |b|$. Since $\gcd(a,b) = \gcd(b, r)$, repeated division computes the greatest common divisor: $\gcd(252, 198)$: $252 = 1\cdot198 + 54$, $198 = 3\cdot54 + 36$, $54 = 1\cdot36 + 18$, $36 = 2\cdot18$, so the gcd is $18$. The algorithm takes $O(\log\min(a,b))$ steps.

## Bézout's identity

For integers $a, b$ not both zero there are integers $x, y$ with $ax + by = \gcd(a,b)$, found by running the Euclidean algorithm backwards (the extended Euclidean algorithm). From the example above, $18 = 54 - 36 = 54 - (198 - 3\cdot54) = 4\cdot252 - 5\cdot198$. Consequences: Euclid's lemma (if $p$ is prime and $p \mid ab$ then $p \mid a$ or $p \mid b$), and $a$ has an inverse modulo $n$ exactly when $\gcd(a,n) = 1$.

## Primes and unique factorization

Every integer $n > 1$ is a product of primes, uniquely up to order (the fundamental theorem of arithmetic; uniqueness uses Euclid's lemma). There are infinitely many primes: given primes $p_1,\ldots,p_k$, the number $p_1p_2\cdots p_k + 1$ is divisible by none of them, so some prime is missing from the list. The prime number theorem says the number of primes up to $x$ satisfies $\pi(x) \sim x/\ln x$.

## Modular arithmetic

$a \equiv b \pmod n$ means $n \mid a - b$. Congruence respects addition and multiplication, so arithmetic can be done on residues. Fast exponentiation computes $a^k \bmod n$ by repeated squaring in $O(\log k)$ multiplications. Example: the last digit of $7^{100}$: $7^4 = 2401 \equiv 1 \pmod{10}$, so $7^{100} = (7^4)^{25} \equiv 1$. Divisibility rules come from $10 \equiv 1 \pmod 9$ and $10 \equiv -1 \pmod{11}$.

## Fermat's little theorem and Euler's theorem

If $p$ is prime and $p \nmid a$, then $a^{p-1} \equiv 1 \pmod p$. More generally Euler's theorem gives $a^{\varphi(n)} \equiv 1 \pmod n$ for $\gcd(a,n) = 1$, where $\varphi(n)$ counts the integers in $[1,n]$ coprime to $n$, and $\varphi(n) = n\prod_{p\mid n}(1 - 1/p)$. Proof idea: multiplication by $a$ permutes the units mod $n$, so the product of all units equals $a^{\varphi(n)}$ times itself. RSA encryption relies on $m^{ed} \equiv m \pmod{pq}$ when $ed \equiv 1 \pmod{\varphi(pq)}$.

## Chinese remainder theorem

If $n_1, \ldots, n_k$ are pairwise coprime, the system $x \equiv a_i \pmod{n_i}$ has a unique solution modulo $N = n_1\cdots n_k$. Construction: with $N_i = N/n_i$ and $M_i \equiv N_i^{-1} \pmod{n_i}$, take $x = \sum a_i N_i M_i$. Example: $x \equiv 2 \pmod 3$, $x \equiv 3 \pmod 5$, $x \equiv 2 \pmod 7$ gives $x \equiv 23 \pmod{105}$. Equivalently $\mathbb Z/N \cong \mathbb Z/n_1 \times\cdots\times \mathbb Z/n_k$ as rings.
