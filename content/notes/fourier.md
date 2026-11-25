---
id: fourier
title: Fourier series and transforms
area: Analysis
---
## Fourier series

A $2\pi$-periodic integrable function has Fourier series $f(x) \sim \frac{a_0}{2} + \sum_{n\ge1}(a_n\cos nx + b_n\sin nx)$ with

$$a_n = \frac1\pi\int_{-\pi}^{\pi} f(x)\cos nx\,dx, \qquad b_n = \frac1\pi\int_{-\pi}^{\pi} f(x)\sin nx\,dx.$$

The coefficients come from orthogonality: $\int_{-\pi}^{\pi}\cos mx\cos nx\,dx = \pi\,\delta_{mn}$ for $m,n\ge1$, and sines are orthogonal to cosines. In complex form $f \sim \sum_{n\in\mathbb Z} c_ne^{inx}$ with $c_n = \frac{1}{2\pi}\int f(x)e^{-inx}dx$.

## Convergence of Fourier series

If $f$ is piecewise smooth, its Fourier series converges at every $x$ to $\frac12(f(x^+) + f(x^-))$, the average of the one-sided limits (Dirichlet's theorem). Near a jump the partial sums overshoot by about $9\%$ of the jump, the Gibbs phenomenon, however many terms are taken. For square-integrable $f$ the series converges in mean square, and Parseval's identity holds: $\frac1\pi\int_{-\pi}^{\pi}|f|^2 = \frac{a_0^2}{2} + \sum(a_n^2 + b_n^2)$.

## A worked example and the Basel sum

For $f(x) = x$ on $(-\pi, \pi)$, $f$ is odd so $a_n = 0$, and integration by parts gives $b_n = \frac{2(-1)^{n+1}}{n}$. Thus $x = 2\sum_{n\ge1}\frac{(-1)^{n+1}}{n}\sin nx$ on $(-\pi,\pi)$; at $x = \pi/2$ this gives Leibniz's series for $\pi/4$. Parseval yields $\frac1\pi\int_{-\pi}^{\pi}x^2dx = \frac{2\pi^2}{3} = \sum\frac{4}{n^2}$, hence $\sum_{n\ge1}\frac1{n^2} = \frac{\pi^2}{6}$.

## Fourier transform

For integrable $f$ on $\mathbb R$, $\hat f(\xi) = \int_{-\infty}^{\infty}f(x)e^{-2\pi i x\xi}dx$, inverted by $f(x) = \int\hat f(\xi)e^{2\pi ix\xi}d\xi$ under suitable conditions. Differentiation becomes multiplication, $\widehat{f'}(\xi) = 2\pi i\xi\hat f(\xi)$, and convolution becomes a product, $\widehat{f*g} = \hat f\,\hat g$. The Gaussian $e^{-\pi x^2}$ is its own transform. Plancherel: $\|\hat f\|_2 = \|f\|_2$. The discrete Fourier transform of length $N$ is computed in $O(N\log N)$ operations by the fast Fourier transform.
