---
id: linear-algebra-foundations
title: Vector spaces, rank and determinants
area: Linear algebra
---
## Vector spaces, span and linear independence

A vector space over a field $F$ is a set closed under addition and scalar multiplication satisfying the usual axioms. Vectors $v_1, \ldots, v_k$ are linearly independent if $c_1v_1 + \cdots + c_kv_k = 0$ forces all $c_i = 0$. Their span is the set of all linear combinations. A basis is an independent spanning set; every basis of a finite-dimensional space has the same number of elements, the dimension. In $\mathbb R^n$, $n$ vectors form a basis exactly when the matrix with those columns is invertible.

## Linear maps and the rank–nullity theorem

A linear map $T: V \to W$ satisfies $T(au + bv) = aT(u) + bT(v)$. Its kernel $\ker T = \{v : Tv = 0\}$ and image $\operatorname{im} T$ are subspaces. For finite-dimensional $V$,

$$\dim V = \dim\ker T + \dim\operatorname{im}T.$$

For an $m\times n$ matrix $A$ this says $n = \operatorname{nullity}(A) + \operatorname{rank}(A)$. Consequently a linear map between spaces of equal finite dimension is injective if and only if it is surjective. Row rank equals column rank.

## Solving linear systems

The system $Ax = b$ is solved by Gaussian elimination: row operations reduce $[A\,|\,b]$ to row echelon form without changing the solution set. The system is consistent exactly when $\operatorname{rank}A = \operatorname{rank}[A\,|\,b]$. If $x_0$ is one solution, every solution has the form $x_0 + z$ with $z \in \ker A$. When $A$ is square, the following are equivalent: $A$ is invertible, $\det A \ne 0$, $\ker A = \{0\}$, $\operatorname{rank}A = n$, and $Ax = b$ has a unique solution for every $b$.

## Determinants

The determinant is the unique function of the columns of a square matrix that is multilinear, alternating, and equals $1$ on the identity. For $2\times2$, $\det\begin{pmatrix}a&b\\c&d\end{pmatrix} = ad - bc$. Key facts: $\det(AB) = \det A\det B$, $\det A^\top = \det A$, swapping two rows changes the sign, and the determinant of a triangular matrix is the product of its diagonal. $|\det A|$ is the factor by which $A$ scales volume, which is why it appears in the change-of-variables formula.

## Inverse of a matrix

A square matrix $A$ is invertible if $AB = BA = I$ for some $B = A^{-1}$. For $2\times2$, $A^{-1} = \frac{1}{ad-bc}\begin{pmatrix}d&-b\\-c&a\end{pmatrix}$. In general $A^{-1}$ can be found by row reducing $[A\,|\,I]$ to $[I\,|\,A^{-1}]$, or by the adjugate formula $A^{-1} = \operatorname{adj}(A)/\det A$. Also $(AB)^{-1} = B^{-1}A^{-1}$ and $(A^\top)^{-1} = (A^{-1})^\top$. Cramer's rule gives $x_i = \det A_i/\det A$, where $A_i$ replaces column $i$ by $b$.
