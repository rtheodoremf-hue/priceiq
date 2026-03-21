import { NextResponse } from 'next/server'
import { searchMercadoLivre } from '@/lib/adapters/mercadolivre'
import { rankWithAI } from '@/lib/ai/rank'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export async function POST(req) {
  const { query, priorities } = await req.json()
  if (!query) return NextResponse.json({ error: 'Query obrigatoria' }, { status: 400 })

  const cacheKey = 'search:' + query.toLowerCase().trim()
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return NextResponse.json({ products: cached, fromCache: true })
  } catch {}

  const [mlResult] = await Promise.allSettled([searchMercadoLivre(query)])
  const allProducts = mlResult.status === 'fulfilled' ? mlResult.value : []

  if (allProducts.length === 0)
    return NextResponse.json({ products: [], message: 'Nenhum produto encontrado' })

  const ranked = await rankWithAI(allProducts, priorities)

  try { await redis.set(cacheKey, ranked, { ex: 1800 }) } catch {}

  return NextResponse.json({ products: ranked })
}
