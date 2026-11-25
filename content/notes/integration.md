---
id: integration
title: Integration and the fundamental theorem of calculus
area: Calculus
---
## Riemann integral

For a bounded $f$ on $[a,b]$ and a partition $a = x_0 < x_1 < \cdots < x_n = b$, the Riemann sum $\sum f(\xi_i)(x_i - x_{i-1})$ approximates signed area. $f$ is Riemann integrable when the upper and lower sums can be made arbitrarily close; every continuous function on $[a,b]$ is integrable, as is every monotone function. Linearity and monotonicity hold: if $f \le g$ then $\int_a^b f \le \int_a^b g$.

## Fundamental theorem of calculus

Part 1: if $f$ is continuous on $[a,b]$ and $F(x) = \int_a^x f(t)\,dt$, then $F$ is differentiable and $F'(x) = f(x)$. Part 2: if $G$ is any antiderivative of $f$, then

$$\int_a^b f(x)\,dx = G(b) - G(a).$$

Part 2 follows from Part 1 because $F - G$ has derivative zero and is therefore constant. Example: $\int_0^\pi \sin x\,dx = [-\cos x]_0^\pi = 2$, and $\frac{d}{dx}\int_0^{x^2} e^{t^2}dt = 2x\,e^{x^4}$ by the chain rule.

## Substitution

If $u = g(x)$ with $g$ continuously differentiable, then $\int f(g(x))\,g'(x)\,dx = \int f(u)\,du$, and for definite integrals $\int_a^b f(g(x))g'(x)\,dx = \int_{g(a)}^{g(b)} f(u)\,du$. It is the chain rule read backwards. Example: $\int_0^1 2x\,e^{x^2}\,dx = \int_0^1 e^u\,du = e - 1$. Trigonometric substitution handles $\sqrt{a^2 - x^2}$ via $x = a\sin\theta$, giving $\int_0^a \sqrt{a^2-x^2}\,dx = \pi a^2/4$.

## Integration by parts

From the product rule, $\int u\,dv = uv - \int v\,du$, or $\int_a^b u v' = [uv]_a^b - \int_a^b u' v$. Choose $u$ to become simpler on differentiation. Examples: $\int x e^x dx = xe^x - e^x + C$; $\int \ln x\,dx = x\ln x - x + C$; and applying parts twice to $\int e^x \sin x\,dx$ gives $\frac12 e^x(\sin x - \cos x) + C$.

## Improper integrals

An integral over an infinite interval or of an unbounded function is defined as a limit: $\int_1^\infty f = \lim_{R\to\infty}\int_1^R f$. Thus $\int_1^\infty x^{-p}dx$ converges to $\frac{1}{p-1}$ when $p > 1$ and diverges when $p \le 1$, while $\int_0^1 x^{-p}dx$ converges exactly when $p < 1$. The Gaussian integral $\int_{-\infty}^{\infty} e^{-x^2}dx = \sqrt\pi$ is computed by squaring it and switching to polar coordinates.

## Partial fractions

A rational function $P/Q$ with $\deg P < \deg Q$ splits into simple pieces according to the factorization of $Q$. Linear factors give terms $\frac{A}{x-a}$, repeated factors give $\frac{A_1}{x-a} + \frac{A_2}{(x-a)^2} + \cdots$, and irreducible quadratics give $\frac{Bx + C}{x^2 + px + q}$. Example: $\frac{1}{x^2-1} = \frac12\left(\frac{1}{x-1} - \frac{1}{x+1}\right)$, so $\int \frac{dx}{x^2 - 1} = \frac12 \ln\left|\frac{x-1}{x+1}\right| + C$.
