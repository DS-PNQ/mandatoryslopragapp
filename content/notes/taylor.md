---
id: taylor
title: Taylor polynomials and power series
area: Calculus
---
## Taylor's theorem

If $f$ has $n+1$ continuous derivatives near $a$, then $f(x) = T_n(x) + R_n(x)$ with Taylor polynomial

$$T_n(x) = \sum_{k=0}^{n} \frac{f^{(k)}(a)}{k!}(x-a)^k$$

and Lagrange remainder $R_n(x) = \frac{f^{(n+1)}(\xi)}{(n+1)!}(x-a)^{n+1}$ for some $\xi$ between $a$ and $x$. The remainder bound $|R_n(x)| \le \frac{M}{(n+1)!}|x-a|^{n+1}$, where $M$ bounds $|f^{(n+1)}|$, controls the approximation error.

## Standard Maclaurin series

Expanding at $a = 0$: $e^x = \sum_{n\ge0}\frac{x^n}{n!}$, $\sin x = \sum_{n\ge0}\frac{(-1)^n x^{2n+1}}{(2n+1)!}$, $\cos x = \sum_{n\ge0}\frac{(-1)^n x^{2n}}{(2n)!}$, all valid for every real $x$. Also $\frac{1}{1-x} = \sum x^n$ and $\ln(1+x) = \sum_{n\ge1}\frac{(-1)^{n+1}x^n}{n}$ for $|x| < 1$ (the latter also at $x = 1$), and $\arctan x = \sum \frac{(-1)^n x^{2n+1}}{2n+1}$ for $|x| \le 1$, which at $x = 1$ gives Leibniz's $\frac\pi4 = 1 - \frac13 + \frac15 - \cdots$.

## Radius of convergence

A power series $\sum c_n (x-a)^n$ converges absolutely for $|x - a| < R$ and diverges for $|x - a| > R$, where $\frac1R = \limsup |c_n|^{1/n}$ (Cauchy–Hadamard). Often $R = \lim |c_n/c_{n+1}|$ when this exists. Behaviour at $|x-a| = R$ must be checked separately. Inside the disc of convergence the series may be differentiated and integrated term by term, and the radius does not change.

## Using series to compute limits and approximations

Series turn limits into algebra: $\frac{\sin x - x}{x^3} = \frac{-x^3/6 + O(x^5)}{x^3} \to -\frac16$. For approximation, $e^{0.1} \approx 1 + 0.1 + 0.005 + 0.000167 = 1.105167$ with error below $\frac{e^{0.1}(0.1)^4}{24} < 5\times10^{-6}$. The small-angle approximation $\sin\theta \approx \theta$ has relative error about $\theta^2/6$.

## Euler's formula from power series

Substituting $x = i\theta$ into the exponential series and separating real and imaginary parts gives $e^{i\theta} = \cos\theta + i\sin\theta$. At $\theta = \pi$ this is $e^{i\pi} + 1 = 0$. De Moivre's formula $(\cos\theta + i\sin\theta)^n = \cos n\theta + i\sin n\theta$ follows from $(e^{i\theta})^n = e^{in\theta}$, and it yields multiple-angle identities such as $\cos 2\theta = \cos^2\theta - \sin^2\theta$.
