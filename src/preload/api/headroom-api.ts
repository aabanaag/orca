import type { HeadroomSavings } from '../../shared/headroom-savings'

export type { HeadroomSavings }

export type HeadroomApi = {
  /** Savings from a locally running Headroom proxy, or null when none is reachable. */
  getSavings: () => Promise<HeadroomSavings | null>
}
