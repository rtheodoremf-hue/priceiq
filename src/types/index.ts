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
