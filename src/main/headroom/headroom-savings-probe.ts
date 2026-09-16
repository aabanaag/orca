import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseHeadroomSavings, type HeadroomSavings } from '../../shared/headroom-savings'

/** Headroom's documented default proxy port; `wrap` only moves off it when it is taken. */
const DEFAULT_HEADROOM_PORT = 8787
const BEACON_LOCK_PREFIX = '.beacon_lock_'
const PROBE_TIMEOUT_MS = 1500
/** Collapses the status-bar poll and any other caller onto one HTTP round trip. */
const CACHE_TTL_MS = 4000

let cached: { savings: HeadroomSavings | null; expiresAt: number } | null = null
let inFlight: Promise<HeadroomSavings | null> | null = null

function headroomHome(): string {
  return join(homedir(), '.headroom')
}

/**
 * Ports that currently have a Headroom proxy.
 *
 * Headroom writes `~/.headroom/.beacon_lock_<port>` holding the proxy's pid. Reading that is how
 * Orca finds a proxy that `wrap` moved off the default port, which it does whenever 8787 is busy.
 * The default is always probed first so a healthy common case never depends on this convention.
 */
async function discoverPorts(): Promise<number[]> {
  const ports = [DEFAULT_HEADROOM_PORT]
  try {
    for (const entry of await readdir(headroomHome())) {
      if (!entry.startsWith(BEACON_LOCK_PREFIX)) {
        continue
      }
      const port = Number.parseInt(entry.slice(BEACON_LOCK_PREFIX.length), 10)
      // A stale lock left by a crashed proxy has no pid in it; skip those rather than probe them.
      if (!Number.isInteger(port) || port <= 0 || ports.includes(port)) {
        continue
      }
      const pid = (await readFile(join(headroomHome(), entry), 'utf8').catch(() => '')).trim()
      if (pid) {
        ports.push(port)
      }
    }
  } catch {
    // No ~/.headroom at all: the default probe below still answers.
  }
  return ports
}

async function fetchSavings(port: number): Promise<HeadroomSavings | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/stats`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    })
    return response.ok ? parseHeadroomSavings(await response.json()) : null
  } catch {
    // No proxy on this port, or it is still loading its models and not serving yet.
    return null
  }
}

async function probeAllPorts(): Promise<HeadroomSavings | null> {
  for (const port of await discoverPorts()) {
    const savings = await fetchSavings(port)
    if (savings) {
      return savings
    }
  }
  return null
}

/**
 * Read compression savings from a locally running Headroom proxy, or null when none is reachable.
 *
 * Local-only by design. A wrapped agent on an SSH host runs its proxy on that host, so localhost
 * would answer for the wrong machine; reporting it as this session's savings would be wrong rather
 * than merely incomplete. Remote hosts need their own probe before the segment can speak for them.
 */
export async function readHeadroomSavings(): Promise<HeadroomSavings | null> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.savings
  }
  inFlight ??= probeAllPorts()
    .then((savings) => {
      cached = { savings, expiresAt: Date.now() + CACHE_TTL_MS }
      return savings
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** @internal - tests need a clean cache between cases. */
export function _resetHeadroomSavingsCache(): void {
  cached = null
  inFlight = null
}
