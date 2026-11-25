---
id: multivariable
title: Multivariable calculus
area: Calculus
---
## Partial derivatives and the gradient

For $f:\mathbb R^n \to \mathbb R$, the partial derivative $\partial f/\partial x_i$ differentiates in $x_i$ with the other variables held fixed. The gradient $\nabla f = (\partial_1 f, \ldots, \partial_n f)$ points in the direction of steepest increase, and the directional derivative along a unit vector $u$ is $D_u f = \nabla f \cdot u$. Its maximum value over unit $u$ is $\|\nabla f\|$. Level sets $f = c$ are orthogonal to $\nabla f$. Clairaut's theorem: if the second partials are continuous, $\partial_x\partial_y f = \partial_y \partial_x f$.

## Multivariable chain rule and the Jacobian

If $g:\mathbb R^m \to \mathbb R^n$ and $f:\mathbb R^n \to \mathbb R^p$ are differentiable, then $D(f\circ g)(x) = Df(g(x))\,Dg(x)$, a product of Jacobian matrices with entries $(Dg)_{ij} = \partial g_i/\partial x_j$. For $z = f(x(t), y(t))$ this reads $\frac{dz}{dt} = f_x x'(t) + f_y y'(t)$. Gradient descent iterates $x_{k+1} = x_k - \eta \nabla f(x_k)$, stepping against the gradient.

## Lagrange multipliers

To extremize $f(x)$ subject to $g(x) = c$, look for points where

$$\nabla f(x) = \lambda\,\nabla g(x), \qquad g(x) = c.$$

At a constrained extremum the level set of $f$ is tangent to the constraint surface, so the two gradients are parallel (assuming $\nabla g \ne 0$). Example: maximize $xy$ on $x + y = 10$: $(y, x) = \lambda(1,1)$ gives $x = y = 5$, value $25$. Example: the closest point of the plane $x + 2y + 2z = 9$ to the origin is $(1,2,2)$, at distance $3$.

## Double integrals and change of variables

Fubini's theorem lets a double integral of a continuous function over a rectangle be computed as an iterated integral in either order. Under a change of variables $(x,y) = T(u,v)$, $dx\,dy = |\det DT|\,du\,dv$. In polar coordinates $dx\,dy = r\,dr\,d\theta$, so

$$\left(\int_{-\infty}^\infty e^{-x^2}dx\right)^2 = \int_0^{2\pi}\!\!\int_0^\infty e^{-r^2} r\,dr\,d\theta = \pi.$$

## Second derivative test in two variables

At a critical point of $f(x,y)$, let $D = f_{xx}f_{yy} - f_{xy}^2$ be the determinant of the Hessian. If $D > 0$ and $f_{xx} > 0$ the point is a local minimum; if $D > 0$ and $f_{xx} < 0$ a local maximum; if $D < 0$ a saddle point; if $D = 0$ the test is inconclusive. Example: $f = x^2 - y^2$ has $D = -4$ at the origin, a saddle. More generally, a critical point is a local minimum when the Hessian is positive definite.
