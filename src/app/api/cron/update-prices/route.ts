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
