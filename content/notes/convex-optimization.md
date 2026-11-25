---
id: convex-optimization
title: Convexity and optimization
area: Optimization
---
## Convex sets and functions

A set $C$ is convex if it contains the segment between any two of its points. A function $f$ is convex if $f(\lambda x + (1-\lambda)y) \le \lambda f(x) + (1-\lambda)f(y)$ for $\lambda \in [0,1]$. For differentiable $f$ this is equivalent to $f(y) \ge f(x) + \nabla f(x)^\top(y - x)$, and for twice-differentiable $f$ to a positive semidefinite Hessian. Every local minimum of a convex function is global, which is why convex problems are tractable.

## Jensen's inequality

If $f$ is convex and $X$ is a random variable, then $f(E[X]) \le E[f(X)]$. With $f(x) = x^2$ this says $\operatorname{Var}X \ge 0$; with $f = -\ln$ it gives the AM–GM inequality $\frac{x_1 + \cdots + x_n}{n} \ge (x_1\cdots x_n)^{1/n}$ for positive $x_i$. Jensen also shows that Kullback–Leibler divergence is nonnegative.

## Gradient descent and convergence rates

Gradient descent iterates $x_{k+1} = x_k - \eta\nabla f(x_k)$. If $f$ is convex with $L$-Lipschitz gradient and $\eta = 1/L$, then $f(x_k) - f^* \le \frac{L\|x_0 - x^*\|^2}{2k}$, an $O(1/k)$ rate. If $f$ is also $\mu$-strongly convex the convergence is linear: the error shrinks by a factor $(1 - \mu/L)$ each step, so the condition number $L/\mu$ controls the speed. Stochastic gradient descent replaces the gradient by an unbiased estimate from a mini-batch and needs a decaying step size to converge.

## Lagrangian duality and KKT conditions

For minimizing $f(x)$ subject to $g_i(x) \le 0$, form the Lagrangian $\mathcal L(x,\lambda) = f(x) + \sum\lambda_ig_i(x)$ with $\lambda_i \ge 0$. The dual function $\min_x\mathcal L(x,\lambda)$ lower-bounds the optimum (weak duality). For convex problems satisfying Slater's condition the bound is tight, and optimal points satisfy the KKT conditions: stationarity $\nabla f + \sum\lambda_i\nabla g_i = 0$, primal and dual feasibility, and complementary slackness $\lambda_ig_i(x) = 0$.
