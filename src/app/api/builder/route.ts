import { createGroq } from '@ai-sdk/groq'
import { generateObject } from 'ai'
import { z } from 'zod'
import { searchMercadoLivre } from '@/lib/adapters/mercadolivre'

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(req) {
  const { description, budget } = await req.json()

  const { object } = await generateObject({
    model: groq('llama-3.1-70b-versatile'),
    schema: z.object({
      components: z.array(z.object({
        name:        z.string(),
        searchQuery: z.string(),
        budget:      z.number(),
        essential:   z.boolean(),
      }))
    }),
    prompt: 'Montar: "' + description + '" com R$' + budget + '. Liste componentes com query de busca e orcamento. Em portugues.'
  })

  const results = await Promise.all(
    object.components.map(async (comp) => {
      const products = await searchMercadoLivre(comp.searchQuery)
      const inBudget = products.filter(p => p.price <= comp.budget)
      const best = inBudget.length > 0 ? inBudget[0] : products[0]
      return { component: comp.name, product: best, budget: comp.budget }
    })
  )

  const totalCost = results.reduce((sum, r) => sum + (r.product?.price || 0), 0)
  return Response.json({ setup: results, totalCost, budget })
}
