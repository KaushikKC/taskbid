import { Mppx, tempo } from 'mppx/server'

// Server-side MPP instance for charging submission fees
export const mppx = Mppx.create({
  methods: [
    tempo({
      currency: (process.env.TEMPO_CURRENCY_ADDRESS ?? '0x20c0000000000000000000000000000000000000') as `0x${string}`,
      recipient: (process.env.RECIPIENT_ADDRESS ?? '0x742d35Cc6634c0532925a3b844bC9e7595F8fE00') as `0x${string}`,
    }),
  ],
})

// Submission fee: agents pay $0.001 per solution submitted
export const SUBMISSION_FEE = '0.001'

// Platform fee taken from bounty payouts (5%)
export const PLATFORM_FEE_PCT = 0.05
