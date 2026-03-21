import { streamText } from 'ai'
import { createGroq } from '@ai-sdk/groq'

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(req) {
  const { product, priorities } = await req.json()
  const result = await streamText({
    model: groq('llama-3.1-70b-versatile'),
    prompt: 'Explique em 3 paragrafos em portugues por que "' + product.title + '" (R$ ' + product.price + ') e boa escolha para quem prioriza: ' + JSON.stringify(priorities) + '. Mencione preco, avaliacao (' + product.rating + '/5) e entrega (' + product.deliveryDays + ' dias).',
    temperature: 0.6,
    maxTokens: 400,
  })
  return result.toDataStreamResponse()
}
