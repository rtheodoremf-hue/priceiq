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
