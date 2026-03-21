import Groq from 'groq-sdk'
import { calculateScore } from './scoring'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function rankWithAI(products, priorities) {
  const withScores = products
    .map(p => ({ ...p, score: calculateScore(p, priorities, products) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  const productsJson = JSON.stringify(withScores.map(p => ({
    id: p.id, title: p.title, price: p.price,
    rating: p.rating, reviews: p.reviewsCount,
    delivery: p.deliveryDays, warranty: p.hasWarranty,
    official: p.isOfficialStore, score: Math.round(p.score)
  })))

  const prompt = [
    'Analise estes produtos e retorne JSON com pros, cons e summary.',
    'PRIORIDADES: ' + JSON.stringify(priorities),
    'PRODUTOS: ' + productsJson,
    'Retorne SOMENTE: {"products":[{"id":"...","pros":["..."],"cons":["..."],"summary":"..."}]}'
  ].join('
')

  try {
    const response = await groq.chat.completions.create({
      model:           'llama-3.1-70b-versatile',
      messages:        [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature:     0.3,
      max_tokens:      2000,
    })
    const aiData = JSON.parse(response.choices[0].message.content)
    const aiMap  = new Map(aiData.products.map(p => [p.id, p]))
    return withScores.map(p => ({
      ...p, ...(aiMap.get(p.id) || {}), prediction: 'NEUTRAL',
    }))
  } catch {
    return withScores.map(p => ({
      ...p, pros: [], cons: [], summary: '', prediction: 'NEUTRAL'
    }))
  }
}
