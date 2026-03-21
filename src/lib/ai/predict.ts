export function predictPrice(history) {
  if (history.length < 3)
    return { verdict: 'NEUTRAL', confidence: 30, reason: 'Historico insuficiente' }

  const prices  = history.map(h => h.price)
  const current = prices[prices.length - 1]
  const min     = Math.min(...prices)
  const avg     = prices.reduce((a, b) => a + b, 0) / prices.length

  const n     = prices.length
  const sumX  = prices.reduce((_, __, i) => _ + i, 0)
  const sumY  = prices.reduce((a, b) => a + b, 0)
  const sumXY = prices.reduce((a, p, i) => a + i * p, 0)
  const sumX2 = prices.reduce((a, _, i) => a + i * i, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)

  if (current <= min * 1.03)
    return { verdict: 'BUY_NOW',   confidence: 90, reason: 'Preco proximo do minimo historico de R$' + min.toFixed(2) }
  if (slope < -0.5 && current > avg)
    return { verdict: 'WAIT',      confidence: 75, reason: 'Preco caindo. Media historica e R$' + avg.toFixed(2) }
  if (current < avg * 0.92)
    return { verdict: 'GOOD_DEAL', confidence: 80, reason: ((1 - current / avg) * 100).toFixed(0) + '% abaixo da media historica' }
  if (current > avg * 1.10)
    return { verdict: 'BAD_DEAL',  confidence: 70, reason: ((current / avg - 1) * 100).toFixed(0) + '% acima da media historica' }

  return { verdict: 'NEUTRAL', confidence: 50, reason: 'Preco estavel e na media historica' }
}
