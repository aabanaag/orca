import { describe, expect, it } from 'vitest'
import {
  formatHeadroomPercent,
  formatHeadroomTokens,
  hasHeadroomSavings,
  parseHeadroomSavings
} from './headroom-savings'

// Shaped after a real `GET /stats` body from headroom 0.37.0.
const STATS_PAYLOAD = {
  summary: {
    compression: { total_tokens_saved_all_layers: 1_240_000 },
    cost: { total_saved_usd: 4.1832, savings_pct: 19.4 }
  },
  agent_usage: {
    agents: [
      { agent: 'claude-code', label: 'Claude Code', tokens_saved: 980_000, savings_percent: 28.4 },
      { agent: 'codex', label: 'Codex', tokens_saved: 240_000, savings_percent: 11.2 },
      { agent: 'gemini', label: 'Gemini', tokens_saved: 0, savings_percent: 0 }
    ],
    totals: { requests: 412, tokens_saved: 1_220_000, savings_percent: 23.1 }
  }
}

describe('parseHeadroomSavings', () => {
  it('reads the totals and cost the status bar shows', () => {
    const savings = parseHeadroomSavings(STATS_PAYLOAD)
    expect(savings).toMatchObject({
      tokensSaved: 1_220_000,
      savingsPercent: 23.1,
      costSavedUsd: 4.1832,
      requests: 412
    })
  })

  it('keeps agents that saved something and drops the ones that did not', () => {
    expect(parseHeadroomSavings(STATS_PAYLOAD)?.agents).toEqual([
      { label: 'Claude Code', tokensSaved: 980_000, savingsPercent: 28.4 },
      { label: 'Codex', tokensSaved: 240_000, savingsPercent: 11.2 }
    ])
  })

  it.each([null, undefined, 'nope', 42, [], {}])(
    'returns null rather than throwing on %s',
    (payload) => {
      expect(parseHeadroomSavings(payload)).toBeNull()
    }
  )

  it('degrades a partial payload to zeros instead of failing', () => {
    // A future headroom could drop or rename a field; the segment must not crash the status bar.
    const savings = parseHeadroomSavings({ agent_usage: { totals: {} } })
    expect(savings).toEqual({
      tokensSaved: 0,
      savingsPercent: 0,
      costSavedUsd: 0,
      requests: 0,
      agents: []
    })
  })

  it('ignores non-numeric and unlabeled rows', () => {
    const savings = parseHeadroomSavings({
      agent_usage: {
        totals: { tokens_saved: 'lots' },
        agents: [{ label: '  ', tokens_saved: 10 }, { tokens_saved: 10 }, 'junk']
      }
    })
    expect(savings?.tokensSaved).toBe(0)
    expect(savings?.agents).toEqual([])
  })
})

describe('hasHeadroomSavings', () => {
  it('hides the segment until something was actually saved', () => {
    expect(hasHeadroomSavings(null)).toBe(false)
    expect(hasHeadroomSavings(parseHeadroomSavings({ agent_usage: { totals: {} } }))).toBe(false)
    expect(hasHeadroomSavings(parseHeadroomSavings(STATS_PAYLOAD))).toBe(true)
  })
})

describe('formatting', () => {
  it('formats token counts compactly', () => {
    expect(formatHeadroomTokens(1_240_000)).toBe('1.2M')
    expect(formatHeadroomTokens(980_000)).toBe('980k')
    expect(formatHeadroomTokens(512)).toBe('512')
    expect(formatHeadroomTokens(0)).toBe('0')
  })

  it('rounds the headline percentage', () => {
    expect(formatHeadroomPercent(23.1)).toBe('23%')
    expect(formatHeadroomPercent(0)).toBe('0%')
  })
})
