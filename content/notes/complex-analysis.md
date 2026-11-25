---
id: complex-analysis
title: Complex numbers and complex analysis
area: Complex analysis
---
## Complex numbers and polar form

A complex number $z = x + iy$ has modulus $|z| = \sqrt{x^2+y^2}$ and argument $\theta$ with $z = r e^{i\theta} = r(\cos\theta + i\sin\theta)$. Multiplication multiplies moduli and adds arguments, so $z^n = r^n e^{in\theta}$. The $n$-th roots of unity are $e^{2\pi i k/n}$ for $k = 0, \ldots, n-1$; they sum to $0$ for $n > 1$. Conjugation satisfies $z\bar z = |z|^2$ and $\overline{zw} = \bar z\bar w$.

## Holomorphic functions and the Cauchy–Riemann equations

$f = u + iv$ is complex differentiable at $z$ if $\lim_{h\to0}\frac{f(z+h)-f(z)}{h}$ exists for complex $h$. Taking $h$ real and then imaginary gives the Cauchy–Riemann equations

$$u_x = v_y, \qquad u_y = -v_x.$$

Conversely, continuous partials satisfying them imply holomorphy. $e^z$, polynomials and $\sin z$ are entire; $\bar z$ is nowhere holomorphic since $u_x = 1 \ne -1 = v_y$. Real and imaginary parts of holomorphic functions are harmonic.

## Cauchy's theorem and integral formula

If $f$ is holomorphic on a simply connected domain containing a closed curve $\gamma$, then $\oint_\gamma f(z)\,dz = 0$. Cauchy's integral formula recovers values inside $\gamma$: $f(a) = \frac{1}{2\pi i}\oint_\gamma \frac{f(z)}{z - a}dz$, and differentiating gives $f^{(n)}(a) = \frac{n!}{2\pi i}\oint\frac{f(z)}{(z-a)^{n+1}}dz$. Hence holomorphic functions are infinitely differentiable and equal their Taylor series. Liouville: a bounded entire function is constant, which proves the fundamental theorem of algebra.

## Residue theorem

If $f$ is holomorphic inside and on $\gamma$ except for isolated singularities $a_k$ inside, then

$$\oint_\gamma f(z)\,dz = 2\pi i \sum_k \operatorname{Res}(f, a_k).$$

At a simple pole, $\operatorname{Res}(f,a) = \lim_{z\to a}(z-a)f(z)$. Example: $\int_{-\infty}^{\infty}\frac{dx}{1+x^2} = \pi$, by closing in the upper half plane, where the only pole is $z = i$ with residue $\frac{1}{2i}$, and the arc contribution vanishes as the radius grows.
