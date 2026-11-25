---
id: linear-algebra-spectral
title: Eigenvalues, orthogonality and the SVD
area: Linear algebra
---
## Eigenvalues and eigenvectors

A nonzero $v$ is an eigenvector of $A$ with eigenvalue $\lambda$ if $Av = \lambda v$. Eigenvalues are the roots of the characteristic polynomial $p(\lambda) = \det(A - \lambda I)$. The sum of the eigenvalues (with multiplicity) is $\operatorname{tr}A$ and their product is $\det A$. Example: $A = \begin{pmatrix}2&1\\1&2\end{pmatrix}$ has $p(\lambda) = (2-\lambda)^2 - 1$, so $\lambda = 1, 3$ with eigenvectors $(1,-1)$ and $(1,1)$.

## Diagonalization

$A$ is diagonalizable if $A = PDP^{-1}$ with $D$ diagonal; the columns of $P$ are eigenvectors and $D$ holds the eigenvalues. An $n\times n$ matrix is diagonalizable if and only if it has $n$ linearly independent eigenvectors, which is guaranteed when it has $n$ distinct eigenvalues. Diagonalization makes powers easy: $A^k = PD^kP^{-1}$. The matrix $\begin{pmatrix}1&1\\0&1\end{pmatrix}$ is not diagonalizable: its only eigenvalue $1$ has a one-dimensional eigenspace.

## Inner products and Gram–Schmidt

An inner product gives lengths $\|v\| = \sqrt{\langle v,v\rangle}$ and angles via $\langle u, v\rangle = \|u\|\|v\|\cos\theta$. The Cauchy–Schwarz inequality $|\langle u,v\rangle| \le \|u\|\|v\|$ implies the triangle inequality. Gram–Schmidt turns a basis $v_1,\ldots,v_n$ into an orthonormal basis: set $u_k = v_k - \sum_{j<k}\langle v_k, e_j\rangle e_j$ and $e_k = u_k/\|u_k\|$. In matrix form this is the QR factorization $A = QR$ with $Q$ orthonormal columns and $R$ upper triangular.

## Spectral theorem

Every real symmetric matrix $A = A^\top$ has real eigenvalues and an orthonormal basis of eigenvectors, so $A = Q\Lambda Q^\top$ with $Q$ orthogonal. Eigenvectors for distinct eigenvalues are automatically orthogonal: $\lambda\langle u,v\rangle = \langle Au, v\rangle = \langle u, Av\rangle = \mu\langle u,v\rangle$. A symmetric matrix is positive definite ($x^\top A x > 0$ for $x \ne 0$) exactly when all its eigenvalues are positive. The complex analogue holds for Hermitian matrices.

## Singular value decomposition

Every real $m\times n$ matrix factors as $A = U\Sigma V^\top$ with $U$, $V$ orthogonal and $\Sigma$ diagonal with nonnegative singular values $\sigma_1 \ge \sigma_2 \ge \cdots \ge 0$. The $\sigma_i^2$ are the eigenvalues of $A^\top A$, the columns of $V$ are its eigenvectors, and $u_i = Av_i/\sigma_i$. Eckart–Young: the best rank-$k$ approximation of $A$ in Frobenius or spectral norm is $A_k = \sum_{i\le k}\sigma_i u_i v_i^\top$. Truncated SVD of a term–document matrix is latent semantic analysis.

## Least squares and projections

When $Ax = b$ has no solution, the least-squares solution minimizes $\|Ax - b\|^2$ and satisfies the normal equations

$$A^\top A\,\hat x = A^\top b.$$

The vector $A\hat x$ is the orthogonal projection of $b$ onto the column space, and the residual $b - A\hat x$ is orthogonal to every column of $A$. If $A$ has independent columns, the projection matrix is $P = A(A^\top A)^{-1}A^\top$, which satisfies $P^2 = P = P^\top$. Fitting a line $y = c_0 + c_1 x$ to data is the case where $A$ has columns $\mathbf 1$ and $x$.
