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
