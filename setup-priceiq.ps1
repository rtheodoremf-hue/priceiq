# =====================================================
# PriceIQ — Script de Setup Automático
# Roda dentro da pasta: C:\Users\rtheo\Downloads\priceiq
# =====================================================

Write-Host ""
Write-Host "🚀 PriceIQ Setup — Criando estrutura do projeto..." -ForegroundColor Cyan
Write-Host ""

# ── CRIAR PASTAS ──────────────────────────────────────────────────────────────

$pastas = @(
    "src/lib/supabase",
    "src/lib/adapters",
    "src/lib/ai",
    "src/lib/notifications",
    "src/app/api/search",
    "src/app/api/explain",
    "src/app/api/builder",
    "src/app/api/alerts",
    "src/app/api/cron/update-prices",
    "src/app/search",
    "src/app/product",
    "src/app/compare",
    "src/app/builder",
    "src/app/dashboard",
    "src/store",
    "src/types"
)

foreach ($pasta in $pastas) {
    New-Item -ItemType Directory -Force -Path $pasta | Out-Null
    Write-Host "  ✓ pasta criada: $pasta" -ForegroundColor Green
}

Write-Host ""
Write-Host "📄 Criando arquivos com código..." -ForegroundColor Cyan
Write-Host ""

# ── src/lib/supabase/client.ts ────────────────────────────────────────────────

@'
// Usado no NAVEGADOR (componentes React client-side)
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
'@ | Set-Content -Path "src/lib/supabase/client.ts" -Encoding UTF8
Write-Host "  ✓ src/lib/supabase/client.ts" -ForegroundColor Green

# ── src/lib/supabase/server.ts ────────────────────────────────────────────────

@'
// Usado no SERVIDOR (API routes, Server Components)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
      },
    }
  )
}
'@ | Set-Content -Path "src/lib/supabase/server.ts" -Encoding UTF8
Write-Host "  ✓ src/lib/supabase/server.ts" -ForegroundColor Green

# ── src/types/index.ts ────────────────────────────────────────────────────────

@'
// Tipo principal que representa um produto normalizado
// (igual pra todos os marketplaces: ML, Amazon, eBay...)
export interface NormalizedProduct {
  id:              string   // ex: "ML-123456"
  source:          string   // "mercadolivre" | "amazon" | "ebay"
  title:           string
  price:           number
  currency:        string   // "BRL"
  image:           string
  rating:          number   // 0 a 5
  reviewsCount:    number
  sellerName:      string
  sellerRep:       string   // "platinum" | "gold" | "silver" ...
  deliveryDays:    number
  hasWarranty:     boolean
  isOfficialStore: boolean
  affiliateUrl:    string
  originalUrl:     string
}

export interface RankedProduct extends NormalizedProduct {
  score:      number
  pros:       string[]
  cons:       string[]
  summary:    string
  prediction: 'BUY_NOW' | 'WAIT' | 'GOOD_DEAL' | 'BAD_DEAL' | 'NEUTRAL'
}

export interface PricePoint {
  price:       number
  recorded_at: string
}

export interface Prediction {
  verdict:    'BUY_NOW' | 'WAIT' | 'GOOD_DEAL' | 'BAD_DEAL' | 'NEUTRAL'
  confidence: number
  reason:     string
}
'@ | Set-Content -Path "src/types/index.ts" -Encoding UTF8
Write-Host "  ✓ src/types/index.ts" -ForegroundColor Green

# ── src/lib/adapters/mercadolivre.ts ──────────────────────────────────────────

@'
import axios from 'axios'
import { NormalizedProduct } from '@/types'

const ML_BASE = 'https://api.mercadolibre.com'
const ML_AFFILIATE_ID = process.env.MERCADOLIBRE_APP_ID || ''

function buildAffiliateUrl(originalUrl: string): string {
  return `${originalUrl}?ref=priceiq&source=af&id=${ML_AFFILIATE_ID}`
}

export async function searchMercadoLivre(query: string): Promise<NormalizedProduct[]> {
  try {
    const { data } = await axios.get(
      `${ML_BASE}/sites/MLB/search?q=${encodeURIComponent(query)}&limit=20`,
      { timeout: 8000 }
    )

    return data.results.map((item: any): NormalizedProduct => ({
      id:              `ML-${item.id}`,
      source:          'mercadolivre',
      title:           item.title,
      price:           item.price,
      currency:        item.currency_id,
      image:           item.thumbnail?.replace('I.jpg', 'O.jpg') || '',
      rating:          item.reviews?.rating_average ?? 0,
      reviewsCount:    item.reviews?.total ?? 0,
      sellerName:      item.seller?.nickname ?? 'Vendedor',
      sellerRep:       item.seller?.seller_reputation?.level_id ?? 'unknown',
      deliveryDays:    item.shipping?.logistic_type === 'fulfillment' ? 2 : 7,
      hasWarranty:     !!item.warranty,
      isOfficialStore: item.official_store_id !== null,
      affiliateUrl:    buildAffiliateUrl(item.permalink),
      originalUrl:     item.permalink,
    }))
  } catch (error) {
    console.error('Erro ao buscar no ML:', error)
    return []
  }
}
'@ | Set-Content -Path "src/lib/adapters/mercadolivre.ts" -Encoding UTF8
Write-Host "  ✓ src/lib/adapters/mercadolivre.ts" -ForegroundColor Green

# ── src/lib/ai/scoring.ts ─────────────────────────────────────────────────────

@'
import { NormalizedProduct } from '@/types'

const repMap: Record<string, number> = {
  platinum: 100, gold: 80, silver: 60, bronze: 40, unknown: 20
}

export function calculateScore(
  product: NormalizedProduct,
  priorities: Record<string, number>,
  allProducts: NormalizedProduct[]
): number {
  const maxPrice  = Math.max(...allProducts.map(p => p.price))
  const minPrice  = Math.min(...allProducts.map(p => p.price))
  const priceRange = maxPrice - minPrice || 1

  const factors: Record<string, number> = {
    price:      100 - ((product.price - minPrice) / priceRange * 100),
    quality:    (product.rating / 5) * 100,
    reviews:    Math.min(product.reviewsCount / 1000, 1) * 100,
    delivery:   product.deliveryDays <= 2 ? 100 : product.deliveryDays <= 5 ? 75 : 40,
    warranty:   product.hasWarranty ? 100 : 0,
    official:   product.isOfficialStore ? 100 : 50,
    reputation: repMap[product.sellerRep] || 50,
  }

  const totalWeight = Object.values(priorities).reduce((a, b) => a + b, 0) || 1

  return Object.entries(priorities).reduce((sum, [key, weight]) => {
    return sum + (factors[key] || 50) * (weight / totalWeight)
  }, 0)
}
'@ | Set-Content -Path "src/lib/ai/scoring.ts" -Encoding UTF8
Write-Host "  ✓ src/lib/ai/scoring.ts" -ForegroundColor Green

# ── src/lib/ai/rank.ts ────────────────────────────────────────────────────────

@'
import Groq from 'groq-sdk'
import { NormalizedProduct, RankedProduct } from '@/types'
import { calculateScore } from './scoring'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function rankWithAI(
  products: NormalizedProduct[],
  priorities: Record<string, number>
): Promise<RankedProduct[]> {

  // 1) Score matemático rápido (sem custo de API)
  const withScores = products
    .map(p => ({ ...p, score: calculateScore(p, priorities, products) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  // 2) Groq gera pros, cons e summary
  const prompt = `
Você é um especialista em análise de produtos. Analise estes produtos e retorne um JSON.

PRIORIDADES DO USUÁRIO: ${JSON.stringify(priorities)}

PRODUTOS:
${JSON.stringify(withScores.map(p => ({
  id: p.id, title: p.title, price: p.price,
  rating: p.rating, reviews: p.reviewsCount,
  delivery: p.deliveryDays, warranty: p.hasWarranty,
  official: p.isOfficialStore, score: Math.round(p.score)
})))}

Retorne SOMENTE este JSON (sem texto extra):
{
  "products": [
    {
      "id": "ML-xxx",
      "pros": ["ponto positivo 1", "ponto positivo 2"],
      "cons": ["ponto negativo 1"],
      "summary": "resumo de 1 frase"
    }
  ]
}
`

  try {
    const response = await groq.chat.completions.create({
      model:           'llama-3.1-70b-versatile',
      messages:        [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature:     0.3,
      max_tokens:      2000,
    })

    const aiData = JSON.parse(response.choices[0].message.content!)
    const aiMap  = new Map(aiData.products.map((p: any) => [p.id, p]))

    return withScores.map(p => ({
      ...p,
      ...(aiMap.get(p.id) || {}),
      prediction: 'NEUTRAL' as const,
    })) as RankedProduct[]

  } catch (error) {
    return withScores.map(p => ({
      ...p, pros: [], cons: [], summary: '', prediction: 'NEUTRAL' as const
    })) as RankedProduct[]
  }
}
'@ | Set-Content -Path "src/lib/ai/rank.ts" -Encoding UTF8
Write-Host "  ✓ src/lib/ai/rank.ts" -ForegroundColor Green

# ── src/lib/ai/predict.ts ─────────────────────────────────────────────────────

@'
import { PricePoint, Prediction } from '@/types'

function getSlope(prices: number[]): number {
  const n = prices.length
  if (n < 2) return 0
  const sumX  = prices.reduce((_, __, i) => _ + i, 0)
  const sumY  = prices.reduce((a, b) => a + b, 0)
  const sumXY = prices.reduce((a, p, i) => a + i * p, 0)
  const sumX2 = prices.reduce((a, _, i) => a + i * i, 0)
  return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
}

export function predictPrice(history: PricePoint[]): Prediction {
  if (history.length < 3) {
    return { verdict: 'NEUTRAL', confidence: 30, reason: 'Histórico insuficiente' }
  }

  const prices  = history.map(h => h.price)
  const current = prices[prices.length - 1]
  const min     = Math.min(...prices)
  const avg     = prices.reduce((a, b) => a + b, 0) / prices.length
  const slope   = getSlope(prices)

  if (current <= min * 1.03)
    return { verdict: 'BUY_NOW',   confidence: 90, reason: `Preço próximo do mínimo histórico de R$${min.toFixed(2)}` }

  if (slope < -0.5 && current > avg)
    return { verdict: 'WAIT',      confidence: 75, reason: `Preço caindo. Média histórica é R$${avg.toFixed(2)}` }

  if (current < avg * 0.92)
    return { verdict: 'GOOD_DEAL', confidence: 80, reason: `${((1 - current / avg) * 100).toFixed(0)}% abaixo da média histórica` }

  if (current > avg * 1.10)
    return { verdict: 'BAD_DEAL',  confidence: 70, reason: `${((current / avg - 1) * 100).toFixed(0)}% acima da média histórica` }

  return { verdict: 'NEUTRAL', confidence: 50, reason: 'Preço estável e na média histórica' }
}
'@ | Set-Content -Path "src/lib/ai/predict.ts" -Encoding UTF8
Write-Host "  ✓ src/lib/ai/predict.ts" -ForegroundColor Green

# ── src/lib/notifications/email.ts ───────────────────────────────────────────

@'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendPriceDropAlert({
  toEmail, productTitle, oldPrice, newPrice, productUrl, imageUrl
}: {
  toEmail: string
  productTitle: string
  oldPrice: number
  newPrice: number
  productUrl: string
  imageUrl: string
}) {
  const savings = ((oldPrice - newPrice) / oldPrice * 100).toFixed(0)

  await resend.emails.send({
    from:    'PriceIQ <alertas@priceiq.com>',
    to:      toEmail,
    subject: `🎉 ${productTitle} caiu ${savings}% de preço!`,
    html: `
<div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#111;color:#eee;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:24px;text-align:center">
    <h1 style="color:white;margin:0;font-size:28px">💸 Alerta de Preço!</h1>
  </div>
  <div style="padding:24px">
    <img src="${imageUrl}" style="width:120px;border-radius:8px;margin-bottom:16px"/>
    <h2 style="color:#eee;font-size:16px">${productTitle}</h2>
    <p style="color:#888">De: <s style="color:#ef4444">R$ ${oldPrice.toFixed(2)}</s></p>
    <p style="color:#22c55e;font-size:24px;font-weight:bold">R$ ${newPrice.toFixed(2)}</p>
    <p style="color:#22c55e">Economia de ${savings}%! 🎯</p>
    <a href="${productUrl}" style="display:block;background:#22c55e;color:black;text-align:center;padding:14px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:20px">
      Ver Produto →
    </a>
  </div>
</div>
`
  })
}
'@ | Set-Content -Path "src/lib/notifications/email.ts" -Encoding UTF8
Write-Host "  ✓ src/lib/notifications/email.ts" -ForegroundColor Green

# ── src/app/api/search/route.ts ───────────────────────────────────────────────

@'
import { NextRequest, NextResponse } from 'next/server'
import { searchMercadoLivre } from '@/lib/adapters/mercadolivre'
import { rankWithAI } from '@/lib/ai/rank'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export async function POST(req: NextRequest) {
  const { query, priorities } = await req.json()

  if (!query) {
    return NextResponse.json({ error: 'Query é obrigatória' }, { status: 400 })
  }

  // Tenta pegar do cache primeiro
  const cacheKey = `search:${query.toLowerCase().trim()}`
  try {
    const cached = await redis.get(cacheKey)
    if (cached) {
      return NextResponse.json({ products: cached, fromCache: true })
    }
  } catch (e) { /* ignora erro de cache */ }

  // Busca em todos os marketplaces ao mesmo tempo
  const [mlResult] = await Promise.allSettled([
    searchMercadoLivre(query),
    // searchAmazon(query),  ← adicionar depois
  ])

  const allProducts = [
    ...(mlResult.status === 'fulfilled' ? mlResult.value : []),
  ]

  if (allProducts.length === 0) {
    return NextResponse.json({ products: [], message: 'Nenhum produto encontrado' })
  }

  const ranked = await rankWithAI(allProducts, priorities)

  // Salva no cache por 30 minutos
  try {
    await redis.set(cacheKey, ranked, { ex: 1800 })
  } catch (e) { /* ignora erro de cache */ }

  return NextResponse.json({ products: ranked })
}
'@ | Set-Content -Path "src/app/api/search/route.ts" -Encoding UTF8
Write-Host "  ✓ src/app/api/search/route.ts" -ForegroundColor Green

# ── src/app/api/explain/route.ts ──────────────────────────────────────────────

@'
import { streamText } from 'ai'
import { createGroq } from '@ai-sdk/groq'

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(req: Request) {
  const { product, priorities } = await req.json()

  const result = await streamText({
    model: groq('llama-3.1-70b-versatile'),
    prompt: `Você é um assistente de compras. Explique em 3 parágrafos curtos
em português por que "${product.title}" (R$ ${product.price}) é uma
boa escolha para quem prioriza: ${JSON.stringify(priorities)}.
Mencione: preço atual, avaliação (${product.rating}/5),
prazo de entrega (${product.deliveryDays} dias) e custo-benefício.
Seja direto e amigável.`,
    temperature: 0.6,
    maxTokens:   400,
  })

  return result.toDataStreamResponse()
}
'@ | Set-Content -Path "src/app/api/explain/route.ts" -Encoding UTF8
Write-Host "  ✓ src/app/api/explain/route.ts" -ForegroundColor Green

# ── src/app/api/builder/route.ts ──────────────────────────────────────────────

@'
import { createGroq } from '@ai-sdk/groq'
import { generateObject } from 'ai'
import { z } from 'zod'
import { searchMercadoLivre } from '@/lib/adapters/mercadolivre'

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(req: Request) {
  const { description, budget } = await req.json()

  // IA decompõe o pedido em componentes
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
    prompt: `Usuário quer montar: "${description}" com orçamento de R$${budget}.
Liste os componentes necessários com query de busca e orçamento sugerido.
Responda em português. Seja específico nas queries de busca.`
  })

  // Busca o melhor produto para cada componente em paralelo
  const results = await Promise.all(
    object.components.map(async (comp) => {
      const products = await searchMercadoLivre(comp.searchQuery)
      const inBudget = products.filter(p => p.price <= comp.budget)
      const best     = inBudget.length > 0 ? inBudget[0] : products[0]
      return { component: comp.name, product: best, budget: comp.budget }
    })
  )

  const totalCost = results.reduce((sum, r) => sum + (r.product?.price || 0), 0)
  return Response.json({ setup: results, totalCost, budget })
}
'@ | Set-Content -Path "src/app/api/builder/route.ts" -Encoding UTF8
Write-Host "  ✓ src/app/api/builder/route.ts" -ForegroundColor Green

# ── src/app/api/cron/update-prices/route.ts ───────────────────────────────────

@'
import { createClient } from '@/lib/supabase/server'
import { searchMercadoLivre } from '@/lib/adapters/mercadolivre'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()

  const { data: alertedProducts } = await supabase
    .from('alerts')
    .select('product:products(id, title, external_id, source)')
    .eq('is_active', true)

  for (const alert of alertedProducts || []) {
    const product = alert.product as any
    if (!product) continue

    const results = await searchMercadoLivre(product.title)
    const match   = results.find(r => r.id.includes(product.external_id))

    if (match) {
      await supabase.from('price_history').insert({
        product_id: product.id,
        price:      match.price,
      })
      await supabase.from('products').update({ price: match.price }).eq('id', product.id)
    }
  }

  return NextResponse.json({ ok: true, updated: alertedProducts?.length || 0 })
}
'@ | Set-Content -Path "src/app/api/cron/update-prices/route.ts" -Encoding UTF8
Write-Host "  ✓ src/app/api/cron/update-prices/route.ts" -ForegroundColor Green

# ── src/store/compare.ts ──────────────────────────────────────────────────────

@'
import { create } from 'zustand'
import { RankedProduct } from '@/types'

interface CompareStore {
  items:  RankedProduct[]
  add:    (p: RankedProduct) => void
  remove: (id: string) => void
  clear:  () => void
}

export const useCompare = create<CompareStore>()(set => ({
  items:  [],
  add:    (p)  => set(s => ({ items: [...s.items, p].slice(-4) })),
  remove: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),
  clear:  ()   => set({ items: [] }),
}))
'@ | Set-Content -Path "src/store/compare.ts" -Encoding UTF8
Write-Host "  ✓ src/store/compare.ts" -ForegroundColor Green

# ── src/app/page.tsx ──────────────────────────────────────────────────────────

@'
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, TrendingDown, Star, Truck, Shield, Zap } from 'lucide-react'

const PRIORITIES = [
  { key: 'price',    label: 'Menor Preço',    icon: TrendingDown },
  { key: 'quality',  label: 'Alta Qualidade', icon: Star         },
  { key: 'delivery', label: 'Entrega Rápida', icon: Truck        },
  { key: 'warranty', label: 'Garantia',       icon: Shield       },
  { key: 'official', label: 'Loja Oficial',   icon: Zap          },
]

const SUGGESTIONS = ['ESP32', 'Headphones', 'GPU', 'Monitor 4K', 'iPhone', 'SSD 1TB', 'Teclado Mecânico']

export default function HomePage() {
  const router = useRouter()
  const [query,   setQuery]   = useState('')
  const [weights, setWeights] = useState({ price: 3, quality: 3, delivery: 2, warranty: 2, official: 1 })

  const handleSearch = () => {
    if (!query.trim()) return
    const params = new URLSearchParams({ q: query, p: JSON.stringify(weights) })
    router.push(`/search?${params.toString()}`)
  }

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <h1 className="text-5xl font-black text-center mb-2">
        Price<span className="text-green-500">IQ</span>
      </h1>
      <p className="text-muted-foreground text-center mb-10 text-sm">
        IA que acha o melhor produto pra você em todos os marketplaces
      </p>

      {/* Barra de busca */}
      <div className="w-full max-w-2xl flex gap-2 mb-8">
        <div className="flex-1 flex items-center bg-card border rounded-xl px-4 gap-3">
          <Search className="text-muted-foreground w-4 h-4" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Pesquise qualquer produto..."
            className="flex-1 bg-transparent py-4 outline-none text-sm"
          />
        </div>
        <button
          onClick={handleSearch}
          className="bg-green-500 hover:bg-green-400 text-black font-bold px-6 rounded-xl transition-colors"
        >
          Buscar
        </button>
      </div>

      {/* Prioridades */}
      <div className="w-full max-w-2xl bg-card border rounded-xl p-5 mb-6">
        <p className="text-sm font-semibold mb-4">🎯 Suas prioridades:</p>
        <div className="grid grid-cols-1 gap-3">
          {PRIORITIES.map(({ key, label, icon: Icon }) => (
            <div key={key} className="flex items-center gap-3">
              <Icon className="w-4 h-4 text-green-500" />
              <span className="text-sm w-36">{label}</span>
              <input
                type="range" min={0} max={5}
                value={weights[key as keyof typeof weights]}
                onChange={e => setWeights(w => ({ ...w, [key]: +e.target.value }))}
                className="flex-1"
              />
              <span className="text-sm w-4 text-muted-foreground text-right">
                {weights[key as keyof typeof weights]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Sugestões */}
      <div className="flex flex-wrap gap-2 justify-center">
        {SUGGESTIONS.map(s => (
          <button
            key={s} onClick={() => setQuery(s)}
            className="text-xs bg-muted hover:bg-accent px-3 py-1.5 rounded-full transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </main>
  )
}
'@ | Set-Content -Path "src/app/page.tsx" -Encoding UTF8
Write-Host "  ✓ src/app/page.tsx" -ForegroundColor Green

# ── src/app/search/page.tsx ───────────────────────────────────────────────────

@'
'use client'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import { RankedProduct } from '@/types'
import { Trophy, Star, Truck, Shield, ExternalLink } from 'lucide-react'

function SearchResults() {
  const params      = useSearchParams()
  const query       = params.get('q') || ''
  const priorities  = JSON.parse(params.get('p') || '{}')

  const [products, setProducts] = useState<RankedProduct[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    async function fetchResults() {
      try {
        const res  = await fetch('/api/search', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ query, priorities }),
        })
        const data = await res.json()
        setProducts(data.products || [])
      } finally {
        setLoading(false)
      }
    }
    if (query) fetchResults()
  }, [query])

  const [best, ...rest] = products

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="animate-spin text-4xl">🔍</div>
      <p className="text-muted-foreground">Buscando "{query}" em todos os sites...</p>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-2">Resultados para "{query}"</h1>
      <p className="text-muted-foreground mb-8">{products.length} produtos ranqueados pela IA</p>

      {/* Card destaque — Melhor para você */}
      {best && (
        <div className="bg-gradient-to-br from-green-500/10 to-blue-500/10 border border-green-500/30 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="text-yellow-500 w-5 h-5" />
            <span className="text-sm font-bold text-yellow-500">MELHOR PARA VOCÊ</span>
            <span className="ml-auto bg-green-500 text-black text-xs font-bold px-2 py-1 rounded-full">
              {Math.round(best.score)}% match
            </span>
          </div>
          <div className="flex gap-4">
            <img src={best.image} alt={best.title} className="w-28 h-28 object-contain rounded-lg bg-white/5" />
            <div className="flex-1">
              <h2 className="font-bold mb-1">{best.title}</h2>
              <p className="text-2xl font-black text-green-400">R$ {best.price.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground mt-1">{best.summary}</p>
              <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
                <span><Star className="w-3 h-3 inline" /> {best.rating}</span>
                <span><Truck className="w-3 h-3 inline" /> {best.deliveryDays} dias</span>
                {best.hasWarranty && <span><Shield className="w-3 h-3 inline" /> Garantia</span>}
              </div>
              <a
                href={best.affiliateUrl} target="_blank"
                className="mt-4 inline-flex items-center gap-2 bg-green-500 text-black font-bold px-4 py-2 rounded-lg text-sm hover:bg-green-400 transition-colors"
              >
                Ver no {best.source === 'mercadolivre' ? 'Mercado Livre' : 'Amazon'}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Lista das outras opções */}
      <h3 className="text-sm font-semibold text-muted-foreground mb-4">Outras boas opções</h3>
      <div className="grid gap-4">
        {rest.map((product, i) => (
          <div key={product.id} className="flex gap-4 bg-card border rounded-xl p-4 hover:border-border/80 transition-colors">
            <span className="text-muted-foreground font-mono text-sm w-5 pt-1">#{i + 2}</span>
            <img src={product.image} alt={product.title} className="w-16 h-16 object-contain rounded-lg bg-white/5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{product.title}</p>
              <p className="text-lg font-bold text-green-400">R$ {product.price.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">⭐ {product.rating} · {product.sellerName}</p>
            </div>
            <div className="text-right">
              <span className="text-xs bg-muted px-2 py-1 rounded-full">{Math.round(product.score)}%</span>
              <a href={product.affiliateUrl} target="_blank" className="block mt-2 text-xs text-blue-400 hover:underline">Ver →</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Carregando...</div>}>
      <SearchResults />
    </Suspense>
  )
}
'@ | Set-Content -Path "src/app/search/page.tsx" -Encoding UTF8
Write-Host "  ✓ src/app/search/page.tsx" -ForegroundColor Green

# ── vercel.json ───────────────────────────────────────────────────────────────

@'
{
  "crons": [
    {
      "path": "/api/cron/update-prices",
      "schedule": "0 */6 * * *"
    }
  ]
}
'@ | Set-Content -Path "vercel.json" -Encoding UTF8
Write-Host "  ✓ vercel.json" -ForegroundColor Green

# ── RESUMO FINAL ───────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✅ SETUP COMPLETO!" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Arquivos criados:" -ForegroundColor White
Write-Host "  • src/lib/supabase/client.ts" -ForegroundColor Gray
Write-Host "  • src/lib/supabase/server.ts" -ForegroundColor Gray
Write-Host "  • src/lib/adapters/mercadolivre.ts" -ForegroundColor Gray
Write-Host "  • src/lib/ai/scoring.ts" -ForegroundColor Gray
Write-Host "  • src/lib/ai/rank.ts" -ForegroundColor Gray
Write-Host "  • src/lib/ai/predict.ts" -ForegroundColor Gray
Write-Host "  • src/lib/notifications/email.ts" -ForegroundColor Gray
Write-Host "  • src/app/api/search/route.ts" -ForegroundColor Gray
Write-Host "  • src/app/api/explain/route.ts" -ForegroundColor Gray
Write-Host "  • src/app/api/builder/route.ts" -ForegroundColor Gray
Write-Host "  • src/app/api/cron/update-prices/route.ts" -ForegroundColor Gray
Write-Host "  • src/store/compare.ts" -ForegroundColor Gray
Write-Host "  • src/types/index.ts" -ForegroundColor Gray
Write-Host "  • src/app/page.tsx" -ForegroundColor Gray
Write-Host "  • src/app/search/page.tsx" -ForegroundColor Gray
Write-Host "  • vercel.json" -ForegroundColor Gray
Write-Host ""
Write-Host "  Próximo passo: npm run dev" -ForegroundColor Yellow
Write-Host ""
