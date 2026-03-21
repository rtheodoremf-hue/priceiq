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
