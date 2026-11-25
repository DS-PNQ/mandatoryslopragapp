---
id: differential-equations
title: Ordinary differential equations
area: Differential equations
---
## Separable equations

An equation $y' = g(x)h(y)$ separates as $\int \frac{dy}{h(y)} = \int g(x)\,dx$. Example: exponential growth $y' = ky$ gives $\ln|y| = kx + C$, so $y = y_0 e^{kx}$. The logistic equation $y' = ry(1 - y/K)$ separates with partial fractions to give $y(t) = \frac{K}{1 + Ae^{-rt}}$, which tends to the carrying capacity $K$. Constant solutions where $h(y) = 0$ must be checked separately.

## First-order linear equations

$y' + p(x)y = q(x)$ is solved with the integrating factor $\mu(x) = e^{\int p(x)\,dx}$: multiplying through gives $(\mu y)' = \mu q$, so $y = \frac{1}{\mu}\left(\int \mu q\,dx + C\right)$. Example: $y' + 2y = e^{x}$ has $\mu = e^{2x}$, $(e^{2x}y)' = e^{3x}$, hence $y = \frac13 e^{x} + Ce^{-2x}$. Newton's law of cooling $T' = -k(T - T_{\text{env}})$ is of this form.

## Second-order linear equations with constant coefficients

For $ay'' + by' + cy = 0$, try $y = e^{rx}$ to get the characteristic equation $ar^2 + br + c = 0$. Distinct real roots give $y = c_1e^{r_1x} + c_2e^{r_2x}$; a repeated root $r$ gives $y = (c_1 + c_2x)e^{rx}$; complex roots $\alpha \pm i\beta$ give $y = e^{\alpha x}(c_1\cos\beta x + c_2\sin\beta x)$. The harmonic oscillator $y'' + \omega^2 y = 0$ has solutions $A\cos\omega t + B\sin\omega t$. For the inhomogeneous equation, add a particular solution found by undetermined coefficients or variation of parameters.

## Existence and uniqueness

Picard–Lindelöf: if $f(x,y)$ is continuous and Lipschitz in $y$ near $(x_0, y_0)$, the initial value problem $y' = f(x,y)$, $y(x_0) = y_0$ has a unique solution on some interval around $x_0$. The proof shows the Picard iteration $y_{k+1}(x) = y_0 + \int_{x_0}^x f(t, y_k(t))\,dt$ is a contraction. Without the Lipschitz condition uniqueness can fail: $y' = 3y^{2/3}$, $y(0) = 0$ has both $y = 0$ and $y = x^3$.

## Linear systems and the matrix exponential

The system $x' = Ax$ with constant matrix $A$ has solution $x(t) = e^{tA}x(0)$, where $e^{tA} = \sum_{k\ge0}\frac{t^kA^k}{k!}$. If $A = PDP^{-1}$ is diagonalizable, $e^{tA} = Pe^{tD}P^{-1}$, and each eigenpair $(\lambda, v)$ contributes a mode $e^{\lambda t}v$. The origin is asymptotically stable when every eigenvalue has negative real part. A second-order equation $y'' + by' + cy = 0$ becomes such a system with $x = (y, y')$.

## Laplace transform

$\mathcal L\{f\}(s) = \int_0^\infty e^{-st}f(t)\,dt$ turns differentiation into multiplication: $\mathcal L\{f'\} = sF(s) - f(0)$ and $\mathcal L\{f''\} = s^2F(s) - sf(0) - f'(0)$. Standard pairs: $\mathcal L\{1\} = 1/s$, $\mathcal L\{e^{at}\} = \frac{1}{s-a}$, $\mathcal L\{\sin\omega t\} = \frac{\omega}{s^2+\omega^2}$, $\mathcal L\{t^n\} = \frac{n!}{s^{n+1}}$. Example: $y'' + y = 0$, $y(0) = 0$, $y'(0) = 1$ gives $(s^2+1)Y = 1$, so $y = \sin t$.
