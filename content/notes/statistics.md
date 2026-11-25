---
id: statistics
title: Statistical inference
area: Probability
---
## Estimators, bias and variance

An estimator $\hat\theta$ of a parameter $\theta$ is unbiased if $E[\hat\theta] = \theta$. Its mean squared error decomposes as $E[(\hat\theta - \theta)^2] = \operatorname{Var}(\hat\theta) + \operatorname{bias}(\hat\theta)^2$. The sample mean is unbiased for $\mu$ with variance $\sigma^2/n$. The sample variance $s^2 = \frac{1}{n-1}\sum(X_i - \bar X)^2$ uses $n - 1$ (Bessel's correction) to be unbiased, because $\sum(X_i - \bar X)^2$ has expectation $(n-1)\sigma^2$.

## Maximum likelihood

The likelihood is $L(\theta) = \prod_i f(x_i;\theta)$; the maximum likelihood estimate maximizes it, usually by solving $\frac{d}{d\theta}\ln L = 0$. For i.i.d. Bernoulli$(p)$ data with $k$ successes in $n$ trials, $\ln L = k\ln p + (n-k)\ln(1-p)$ gives $\hat p = k/n$. For a normal sample, $\hat\mu = \bar x$ and $\hat\sigma^2 = \frac1n\sum(x_i - \bar x)^2$, which is biased. Under regularity conditions the MLE is consistent and asymptotically normal with variance given by the inverse Fisher information.

## Confidence intervals

A $95\%$ confidence interval is a random interval that contains the true parameter with probability $0.95$ before the data are seen. For a normal mean with known $\sigma$, $\bar x \pm 1.96\,\sigma/\sqrt n$. With unknown $\sigma$, use $\bar x \pm t_{n-1,0.975}\,s/\sqrt n$ from Student's $t$ distribution. For a proportion, the Wald interval $\hat p \pm 1.96\sqrt{\hat p(1-\hat p)/n}$ is a large-sample approximation; halving the width requires four times as many observations.

## Hypothesis testing and p-values

A test compares a null hypothesis $H_0$ with an alternative. The p-value is the probability, computed under $H_0$, of a test statistic at least as extreme as the one observed; rejecting when $p < \alpha$ controls the type I error rate at $\alpha$. Power is the probability of rejecting $H_0$ when it is false. A p-value is not the probability that $H_0$ is true. Example: $60$ heads in $100$ flips gives $z = (60-50)/5 = 2$ and a two-sided p-value near $0.046$.
