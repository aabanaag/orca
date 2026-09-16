/**
 * Compact view of a Headroom proxy's `GET /stats` payload, for the status bar.
 *
 * The payload is produced by a separately-versioned third-party process, so every field is read
 * defensively and a missing or malformed branch degrades to zero rather than failing the read.
 */

export type HeadroomAgentSavings = {
  /** Headroom's own human-readable agent name (`Claude Code`, `Codex`), not an Orca TuiAgent id. */
  label: string
  tokensSaved: number
  savingsPercent: number
}

export type HeadroomSavings = {
  tokensSaved: number
  savingsPercent: number
  costSavedUsd: number
  requests: number
  agents: HeadroomAgentSavings[]
}

export const EMPTY_HEADROOM_SAVINGS: HeadroomSavings = {
  tokensSaved: 0,
  savingsPercent: 0,
  costSavedUsd: 0,
  requests: 0,
  agents: []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readAgentRows(value: unknown): HeadroomAgentSavings[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    const row = readRecord(entry)
    const label = row && typeof row.label === 'string' ? row.label.trim() : ''
    if (!label) {
      return []
    }
    const tokensSaved = readNumber(row?.tokens_saved)
    // Why drop zero-saving rows: an agent that routed traffic but saved nothing adds a line to the
    // popover that tells the reader nothing, and the totals already account for its requests.
    return tokensSaved > 0
      ? [{ label, tokensSaved, savingsPercent: readNumber(row?.savings_percent) }]
      : []
  })
}

/** Parse a `/stats` body into the status-bar shape. Returns null when it is not a usable payload. */
export function parseHeadroomSavings(payload: unknown): HeadroomSavings | null {
  const root = readRecord(payload)
  if (!root) {
    return null
  }
  const agentUsage = readRecord(root.agent_usage)
  const totals = readRecord(agentUsage?.totals)
  const cost = readRecord(readRecord(root.summary)?.cost)
  if (!totals && !cost) {
    return null
  }
  return {
    tokensSaved: readNumber(totals?.tokens_saved),
    savingsPercent: readNumber(totals?.savings_percent),
    costSavedUsd: readNumber(cost?.total_saved_usd),
    requests: readNumber(totals?.requests),
    agents: readAgentRows(agentUsage?.agents)
  }
}

/** Whether there is anything worth showing; drives hiding the status-bar segment. */
export function hasHeadroomSavings(savings: HeadroomSavings | null | undefined): boolean {
  return (savings?.tokensSaved ?? 0) > 0
}

/** Compact token count for the popover (`1.2M`, `980k`). */
export function formatHeadroomTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`
  }
  return String(Math.max(0, Math.round(tokens)))
}

/** Headline percentage for the segment label. */
export function formatHeadroomPercent(percent: number): string {
  return `${Math.round(percent)}%`
}
