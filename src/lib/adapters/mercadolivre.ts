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
