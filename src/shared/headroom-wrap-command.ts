import type { TuiAgent } from './tui-agent'

/** The `headroom` CLI binary, probed by preflight and prefixed onto wrapped launches. */
export const HEADROOM_COMMAND = 'headroom'

/**
 * Agents Headroom can *launch* (`headroom wrap <sub> [ARGS]...`), mapped to their subcommand.
 *
 * Deliberately excludes Headroom subcommands that only print setup instructions or bootstrap a
 * plugin instead of exec'ing the tool — `cursor`, `cline`, `continue`, `openclaw`, `vscode*`,
 * `grok-build`, `zcode`. Orca has agents by those names, but wrapping them would replace the
 * agent's PTY with a config dump that exits immediately.
 */
export const HEADROOM_WRAP_SUBCOMMAND_BY_AGENT: Partial<Record<TuiAgent, string>> = {
  aider: 'aider',
  claude: 'claude',
  codex: 'codex',
  copilot: 'copilot',
  goose: 'goose',
  grok: 'grok',
  kimi: 'kimi',
  omp: 'omp',
  openclaude: 'openclaude',
  opencode: 'opencode',
  // Why: Headroom names Mistral Vibe `vibe`; Orca calls the same agent `mistral-vibe`.
  'mistral-vibe': 'vibe'
}

export function isHeadroomWrappableAgent(agent: TuiAgent): boolean {
  return Object.hasOwn(HEADROOM_WRAP_SUBCOMMAND_BY_AGENT, agent)
}

export function getHeadroomWrapSubcommand(agent: TuiAgent): string | null {
  return HEADROOM_WRAP_SUBCOMMAND_BY_AGENT[agent] ?? null
}

export function isHeadroomEnabledForAgent(
  agent: TuiAgent,
  enabledAgents: Partial<Record<TuiAgent, boolean>> | null | undefined
): boolean {
  return isHeadroomWrappableAgent(agent) && enabledAgents?.[agent] === true
}

/** Code-navigation MCP Headroom registers at user scope when wrapping. */
export type HeadroomCodeMemory = 'none' | 'serena'

export type HeadroomWrapOptions = {
  /** `serena` writes a Serena MCP entry into the agent's *global* config (e.g. ~/.claude.json). */
  codeMemory?: HeadroomCodeMemory
  /** Register Headroom's own MCP server, without which compression markers are unactionable.
   *  Separate from `codeMemory`: `--code-memory none` still registers it. */
  retrieveMcp?: boolean
  /** Keep Claude's 1M context window; behind a custom base URL it silently caps at 200k. */
  preserve1mContext?: boolean
}

/**
 * Build the `headroom wrap <sub> [flags] --` prefix for an agent launch command.
 *
 * The trailing `--` is load-bearing, not cosmetic. Headroom defines its own `--verbose`,
 * `--memory`, `--port`, `--backend`, `--region` and `--1m` flags on the wrap subcommand, so
 * without a terminator those are consumed by Headroom instead of reaching the agent - a silent
 * behavior change for anyone whose agent takes a flag of the same name. Everything Orca appends
 * after this prefix (session options, user CLI args, an argv prompt) is forwarded verbatim.
 *
 * Returns null when the agent has no launching Headroom subcommand.
 */
export function buildHeadroomWrapPrefix(
  agent: TuiAgent,
  options?: HeadroomWrapOptions
): string | null {
  const subcommand = getHeadroomWrapSubcommand(agent)
  if (!subcommand) {
    return null
  }
  const flags: string[] = []
  if (options?.codeMemory !== 'serena') {
    flags.push('--code-memory none')
  }
  if (options?.retrieveMcp === false) {
    flags.push('--no-mcp')
  }
  // Why only claude: `--1m` is a Claude-specific context-window flag; other wrap subcommands
  // reject it.
  if (options?.preserve1mContext && agent === 'claude') {
    flags.push('--1m')
  }
  return [HEADROOM_COMMAND, 'wrap', subcommand, ...flags, '--'].join(' ')
}

/**
 * Whether a resolved launch command routes through `headroom wrap`.
 *
 * Readiness checks need this because the wrapper is not identifiable from the PTY foreground:
 * Headroom is a Python console script, so its foreground name is the interpreter (`Python` on
 * macOS framework builds), which `isAgentForegroundWrapperProcess` already accepts as a
 * ready-enough agent wrapper. The launch command is the only reliable signal, and Orca built it.
 */
export function isHeadroomWrappedCommand(command: string | null | undefined): boolean {
  return /(?:^|[\s"'])headroom\s+wrap\s+/i.test(command ?? '')
}

/** The Headroom fields a launch-plan builder needs, as carried in global settings. */
export type HeadroomLaunchSettings = {
  headroomAgents?: Partial<Record<TuiAgent, boolean>>
  headroomWrapOptions?: HeadroomWrapOptions
}

/**
 * Narrow global settings to the Headroom launch fields, for spreading into a plan-builder call.
 *
 * Exists so the ~two dozen launch sites stay in lockstep: a site that forgets these fields does
 * not fail to compile, it just silently ignores the user's Headroom toggle on that one path.
 */
export function headroomLaunchSettings(
  settings: HeadroomLaunchSettings | null | undefined
): HeadroomLaunchSettings {
  return {
    headroomAgents: settings?.headroomAgents,
    headroomWrapOptions: settings?.headroomWrapOptions
  }
}

/**
 * Whether a launch for `agent` actually routes through Headroom, given the user's settings.
 *
 * Mirrors the decision `resolveAgentLaunchCommand` makes, including the command-override opt-out,
 * for readiness paths that only have the agent id rather than the resolved launch plan. Keeping
 * the override clause here matters: without it a user who set both an override and the toggle
 * would have every launch wait out the wrapper's long startup budget for a wrapper that never ran.
 */
export function isHeadroomLaunchActive(
  agent: TuiAgent,
  settings:
    | (HeadroomLaunchSettings & { agentCmdOverrides?: Partial<Record<TuiAgent, string>> })
    | null
    | undefined
): boolean {
  if (settings?.agentCmdOverrides?.[agent]?.trim()) {
    return false
  }
  return isHeadroomEnabledForAgent(agent, settings?.headroomAgents)
}
