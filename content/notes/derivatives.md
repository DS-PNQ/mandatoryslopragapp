---
id: derivatives
title: Derivatives and the mean value theorem
area: Calculus
---
## Definition of the derivative

The derivative of $f$ at $a$ is the limit of difference quotients

$$f'(a) = \lim_{h \to 0} \frac{f(a+h) - f(a)}{h},$$

when the limit exists. Geometrically it is the slope of the tangent line $y = f(a) + f'(a)(x - a)$, the best linear approximation to $f$ near $a$. Differentiability implies continuity, but not conversely: $|x|$ is continuous at $0$ with no derivative there, because the one-sided quotients are $-1$ and $+1$.

## Product, quotient and chain rules

For differentiable $f$ and $g$: $(fg)' = f'g + fg'$, and $(f/g)' = \frac{f'g - fg'}{g^2}$ where $g \ne 0$. Chain rule: $(f \circ g)'(x) = f'(g(x))\,g'(x)$. In Leibniz notation, if $y = f(u)$ and $u = g(x)$ then $\frac{dy}{dx} = \frac{dy}{du}\frac{du}{dx}$. Example: $\frac{d}{dx}\sin(x^2) = 2x\cos(x^2)$ and $\frac{d}{dx} e^{3x}\ln x = 3e^{3x}\ln x + \frac{e^{3x}}{x}$.

## Derivatives of standard functions

$\frac{d}{dx}x^n = nx^{n-1}$, $\frac{d}{dx}e^x = e^x$, $\frac{d}{dx}\ln x = \frac1x$ for $x>0$, $\frac{d}{dx}\sin x = \cos x$, $\frac{d}{dx}\cos x = -\sin x$, $\frac{d}{dx}\tan x = \sec^2 x$, $\frac{d}{dx}\arctan x = \frac{1}{1+x^2}$, $\frac{d}{dx}\arcsin x = \frac{1}{\sqrt{1-x^2}}$. The rule for $\sin$ comes from $\lim_{h\to0}\frac{\sin h}{h} = 1$ and $\lim_{h\to0}\frac{\cos h - 1}{h} = 0$.

## Rolle's theorem and the mean value theorem

Rolle: if $f$ is continuous on $[a,b]$, differentiable on $(a,b)$ and $f(a) = f(b)$, then $f'(c) = 0$ for some $c \in (a,b)$. Applying Rolle to $f(x) - \frac{f(b)-f(a)}{b-a}(x-a)$ gives the mean value theorem:

$$f'(c) = \frac{f(b) - f(a)}{b - a} \quad \text{for some } c \in (a,b).$$

Consequences: if $f' = 0$ on an interval then $f$ is constant; if $f' > 0$ then $f$ is strictly increasing; and $|\sin x - \sin y| \le |x - y|$ because $|\cos| \le 1$.

## L'Hôpital's rule

If $f(x), g(x) \to 0$ (or both $\to \pm\infty$) as $x \to a$, $g'(x) \ne 0$ near $a$, and $\lim f'(x)/g'(x) = L$ exists, then $\lim_{x\to a} f(x)/g(x) = L$. It follows from Cauchy's mean value theorem. Examples: $\lim_{x\to0}\frac{1-\cos x}{x^2} = \lim \frac{\sin x}{2x} = \frac12$, and $\lim_{x\to\infty} \frac{\ln x}{x} = \lim \frac{1/x}{1} = 0$. Indeterminate forms such as $0\cdot\infty$ or $1^\infty$ must first be rewritten as a quotient, e.g. $\lim (1 + 1/x)^x = \exp\lim x\ln(1+1/x) = e$.

## Optimization and critical points

At an interior local extremum of a differentiable $f$, $f'(c) = 0$ (Fermat's theorem). The second derivative test: if $f'(c) = 0$ and $f''(c) > 0$, $c$ is a local minimum; if $f''(c) < 0$, a local maximum. To find a global extremum on $[a,b]$, compare $f$ at critical points and at the endpoints. Example: among rectangles with perimeter $P$, area $A(x) = x(P/2 - x)$ has $A'(x) = P/2 - 2x = 0$ at $x = P/4$, so the square maximizes area.
