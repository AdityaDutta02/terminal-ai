export interface TopUpPackage {
  credits: number
  price: string
  planCode: string
  popular: boolean
}

export function getTopUpPackages(): TopUpPackage[] {
  return [
    { credits: 500, price: '₹199', planCode: 'credits_500', popular: false },
    { credits: 2000, price: '₹599', planCode: 'credits_2000', popular: true },
    { credits: 5000, price: '₹1299', planCode: 'credits_5000', popular: false },
  ]
}
