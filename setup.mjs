// =====================================================
// PriceIQ — Script de Setup Automático
// Roda com: node setup.mjs
// =====================================================

import fs from 'fs'
import path from 'path'

const ok  = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`)
const log = (msg) => console.log(`\x1b[36m${msg}\x1b[0m`)

// ── CRIAR PASTAS ─────────────────────────────────────

const pastas = [
  'src/lib/supabase',
  'src/lib/adapters',
  'src/lib/ai',
  'src/lib/notifications',
  'src/app/api/search',
  'src/app/api/explain',
  'src/app/api/builder',
  'src/app/api/alerts',
  'src/app/api/cron/update-prices',
  'src/app/search',
  'src/app/product',
  'src/app/compare',
  'src/app/builder',
  'src/app/dashboard',
  'src/store',
  'src/types',
]

log('\n🚀 PriceIQ Setup — Criando estrutura do projeto...\n')

pastas.forEach(p => {
  fs.mkdirSync(p, { recursive: true })
  ok(`pasta criada: ${p}`)
})

log('\n📄 Criando arquivos com código...\n')

// ── ARQUIVOS ─────────────────────────────────────────

const arquivos = {}

// ─────────────────────────────────────────────────────
arquivos['src/lib/supabase/client.ts'] = `
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['src/lib/supabase/server.ts'] = `
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
      },
    }
  )
}
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['src/types/index.ts'] = `
export interface NormalizedProduct {
  id:              string
  source:          string
  title:           string
  price:           number
  currency:        string
  image:           string
  rating:          number
  reviewsCount:    number
  sellerName:      string
  sellerRep:       string
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
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['src/lib/adapters/mercadolivre.ts'] = `
import axios from 'axios'
import { NormalizedProduct } from '@/types'

const ML_BASE = 'https://api.mercadolibre.com'
const ML_AFFILIATE_ID = process.env.MERCADOLIBRE_APP_ID || ''

function buildAffiliateUrl(originalUrl) {
  return originalUrl + '?ref=priceiq&source=af&id=' + ML_AFFILIATE_ID
}

export async function searchMercadoLivre(query) {
  try {
    const { data } = await axios.get(
      ML_BASE + '/sites/MLB/search?q=' + encodeURIComponent(query) + '&limit=20',
      { timeout: 8000 }
    )
    return data.results.map((item) => ({
      id:              'ML-' + item.id,
      source:          'mercadolivre',
      title:           item.title,
      price:           item.price,
      currency:        item.currency_id,
      image:           (item.thumbnail || '').replace('I.jpg', 'O.jpg'),
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
    console.error('Erro ao buscar no ML:', error.message)
    return []
  }
}
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['src/lib/ai/scoring.ts'] = `
import { NormalizedProduct } from '@/types'

const repMap = {
  platinum: 100, gold: 80, silver: 60, bronze: 40, unknown: 20
}

export function calculateScore(product, priorities, allProducts) {
  const maxPrice   = Math.max(...allProducts.map(p => p.price))
  const minPrice   = Math.min(...allProducts.map(p => p.price))
  const priceRange = maxPrice - minPrice || 1

  const factors = {
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
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['src/lib/ai/rank.ts'] = `
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
  ].join('\n')

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
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['src/lib/ai/predict.ts'] = `
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
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['src/lib/notifications/email.ts'] = `
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendPriceDropAlert({ toEmail, productTitle, oldPrice, newPrice, productUrl, imageUrl }) {
  const savings = ((oldPrice - newPrice) / oldPrice * 100).toFixed(0)
  await resend.emails.send({
    from:    'PriceIQ <alertas@priceiq.com>',
    to:      toEmail,
    subject: '🎉 ' + productTitle + ' caiu ' + savings + '% de preco!',
    html: '<div style="font-family:sans-serif;max-width:500px;background:#111;color:#eee;border-radius:12px;overflow:hidden">'
      + '<div style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:24px;text-align:center"><h1 style="color:white;margin:0">💸 Alerta de Preco!</h1></div>'
      + '<div style="padding:24px">'
      + '<img src="' + imageUrl + '" style="width:120px;border-radius:8px;margin-bottom:16px"/>'
      + '<h2 style="color:#eee;font-size:16px">' + productTitle + '</h2>'
      + '<p style="color:#888">De: <s style="color:#ef4444">R$ ' + oldPrice.toFixed(2) + '</s></p>'
      + '<p style="color:#22c55e;font-size:24px;font-weight:bold">R$ ' + newPrice.toFixed(2) + '</p>'
      + '<a href="' + productUrl + '" style="display:block;background:#22c55e;color:black;text-align:center;padding:14px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:20px">Ver Produto →</a>'
      + '</div></div>'
  })
}
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['src/app/api/search/route.ts'] = `
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
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['src/app/api/explain/route.ts'] = `
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
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['src/app/api/builder/route.ts'] = `
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
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['src/app/api/cron/update-prices/route.ts'] = `
import { createClient } from '@/lib/supabase/server'
import { searchMercadoLivre } from '@/lib/adapters/mercadolivre'
import { NextResponse } from 'next/server'

export async function GET(req) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient()
  const { data: alertedProducts } = await supabase
    .from('alerts')
    .select('product:products(id, title, external_id, source)')
    .eq('is_active', true)

  for (const alert of alertedProducts || []) {
    const product = alert.product
    if (!product) continue
    const results = await searchMercadoLivre(product.title)
    const match   = results.find(r => r.id.includes(product.external_id))
    if (match) {
      await supabase.from('price_history').insert({ product_id: product.id, price: match.price })
      await supabase.from('products').update({ price: match.price }).eq('id', product.id)
    }
  }

  return NextResponse.json({ ok: true, updated: alertedProducts?.length || 0 })
}
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['src/store/compare.ts'] = `
import { create } from 'zustand'

export const useCompare = create((set) => ({
  items:  [],
  add:    (p)  => set((s) => ({ items: [...s.items, p].slice(-4) })),
  remove: (id) => set((s) => ({ items: s.items.filter(i => i.id !== id) })),
  clear:  ()   => set({ items: [] }),
}))
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['src/app/page.tsx'] = `
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, TrendingDown, Star, Truck, Shield, Zap } from 'lucide-react'

const PRIORITIES = [
  { key: 'price',    label: 'Menor Preco',    icon: TrendingDown },
  { key: 'quality',  label: 'Alta Qualidade', icon: Star         },
  { key: 'delivery', label: 'Entrega Rapida', icon: Truck        },
  { key: 'warranty', label: 'Garantia',       icon: Shield       },
  { key: 'official', label: 'Loja Oficial',   icon: Zap          },
]

const SUGGESTIONS = ['ESP32', 'Headphones', 'GPU', 'Monitor 4K', 'iPhone', 'SSD 1TB']

export default function HomePage() {
  const router = useRouter()
  const [query,   setQuery]   = useState('')
  const [weights, setWeights] = useState({ price: 3, quality: 3, delivery: 2, warranty: 2, official: 1 })

  const handleSearch = () => {
    if (!query.trim()) return
    const params = new URLSearchParams({ q: query, p: JSON.stringify(weights) })
    router.push('/search?' + params.toString())
  }

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <h1 className="text-5xl font-black text-center mb-2">
        Price<span className="text-green-500">IQ</span>
      </h1>
      <p className="text-muted-foreground text-center mb-10 text-sm">
        IA que acha o melhor produto pra voce em todos os marketplaces
      </p>

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

      <div className="w-full max-w-2xl bg-card border rounded-xl p-5 mb-6">
        <p className="text-sm font-semibold mb-4">🎯 Suas prioridades:</p>
        <div className="grid grid-cols-1 gap-3">
          {PRIORITIES.map(({ key, label, icon: Icon }) => (
            <div key={key} className="flex items-center gap-3">
              <Icon className="w-4 h-4 text-green-500" />
              <span className="text-sm w-36">{label}</span>
              <input
                type="range" min={0} max={5}
                value={weights[key]}
                onChange={e => setWeights(w => ({ ...w, [key]: +e.target.value }))}
                className="flex-1"
              />
              <span className="text-sm w-4 text-muted-foreground text-right">
                {weights[key]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {SUGGESTIONS.map(s => (
          <button key={s} onClick={() => setQuery(s)}
            className="text-xs bg-muted hover:bg-accent px-3 py-1.5 rounded-full transition-colors">
            {s}
          </button>
        ))}
      </div>
    </main>
  )
}
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['src/app/search/page.tsx'] = `
'use client'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import { Trophy, Star, Truck, Shield, ExternalLink } from 'lucide-react'

function SearchResults() {
  const params     = useSearchParams()
  const query      = params.get('q') || ''
  const priorities = JSON.parse(params.get('p') || '{}')
  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res  = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, priorities }),
        })
        const data = await res.json()
        setProducts(data.products || [])
      } finally { setLoading(false) }
    }
    if (query) load()
  }, [query])

  const [best, ...rest] = products

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="animate-spin text-4xl">🔍</div>
      <p className="text-muted-foreground">Buscando "{query}"...</p>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-2">Resultados para "{query}"</h1>
      <p className="text-muted-foreground mb-8">{products.length} produtos ranqueados pela IA</p>

      {best && (
        <div className="bg-gradient-to-br from-green-500/10 to-blue-500/10 border border-green-500/30 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="text-yellow-500 w-5 h-5" />
            <span className="text-sm font-bold text-yellow-500">MELHOR PARA VOCE</span>
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
              <a href={best.affiliateUrl} target="_blank"
                className="mt-4 inline-flex items-center gap-2 bg-green-500 text-black font-bold px-4 py-2 rounded-lg text-sm hover:bg-green-400 transition-colors">
                Ver no {best.source === 'mercadolivre' ? 'Mercado Livre' : 'Amazon'}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      <h3 className="text-sm font-semibold text-muted-foreground mb-4">Outras opcoes</h3>
      <div className="grid gap-4">
        {rest.map((p, i) => (
          <div key={p.id} className="flex gap-4 bg-card border rounded-xl p-4">
            <span className="text-muted-foreground font-mono text-sm w-5 pt-1">#{i + 2}</span>
            <img src={p.image} alt={p.title} className="w-16 h-16 object-contain rounded-lg bg-white/5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{p.title}</p>
              <p className="text-lg font-bold text-green-400">R$ {p.price.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">⭐ {p.rating} · {p.sellerName}</p>
            </div>
            <div className="text-right">
              <span className="text-xs bg-muted px-2 py-1 rounded-full">{Math.round(p.score)}%</span>
              <a href={p.affiliateUrl} target="_blank" className="block mt-2 text-xs text-blue-400 hover:underline">Ver →</a>
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
`.trimStart()

// ─────────────────────────────────────────────────────
arquivos['vercel.json'] = `{
  "crons": [
    {
      "path": "/api/cron/update-prices",
      "schedule": "0 */6 * * *"
    }
  ]
}
`.trimStart()

// ── ESCREVER TODOS OS ARQUIVOS ────────────────────────

Object.entries(arquivos).forEach(([filePath, content]) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
  ok(filePath)
})

// ── RESUMO ────────────────────────────────────────────

console.log('')
console.log('\x1b[36m════════════════════════════════════════\x1b[0m')
console.log('\x1b[32m  ✅ SETUP COMPLETO!\x1b[0m')
console.log('\x1b[36m════════════════════════════════════════\x1b[0m')
console.log('')
console.log('  Próximo passo:')
console.log('\x1b[33m  npm run dev\x1b[0m')
console.log('')
