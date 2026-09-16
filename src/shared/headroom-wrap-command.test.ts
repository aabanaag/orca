import { describe, expect, it } from 'vitest'
import {
  buildHeadroomWrapPrefix,
  getHeadroomWrapSubcommand,
  headroomLaunchSettings,
  isHeadroomEnabledForAgent,
  isHeadroomWrappableAgent,
  isHeadroomWrappedCommand
} from './headroom-wrap-command'
import { resolveAgentLaunchCommand } from './tui-agent-launch-command'

describe('headroom wrappable agents', () => {
  it("maps Mistral Vibe to Headroom's differently-named subcommand", () => {
    expect(getHeadroomWrapSubcommand('mistral-vibe')).toBe('vibe')
  })

  it.each(['cursor', 'cline', 'continue', 'openclaw'] as const)(
    'excludes %s, whose Headroom subcommand only prints config instead of launching',
    (agent) => {
      expect(isHeadroomWrappableAgent(agent)).toBe(false)
    }
  )

  it('excludes agents Headroom has no subcommand for', () => {
    expect(isHeadroomWrappableAgent('gemini')).toBe(false)
    expect(buildHeadroomWrapPrefix('gemini')).toBeNull()
  })
})

describe('buildHeadroomWrapPrefix', () => {
  it('terminates with -- so agent flags are not eaten by Headroom', () => {
    expect(buildHeadroomWrapPrefix('claude')).toBe('headroom wrap claude --code-memory none --')
  })

  it('opts out of the global Serena config write unless asked', () => {
    expect(buildHeadroomWrapPrefix('codex')).toContain('--code-memory none')
    expect(buildHeadroomWrapPrefix('codex', { codeMemory: 'serena' })).not.toContain(
      '--code-memory'
    )
  })

  it('passes --1m only for claude, the only subcommand that defines it', () => {
    expect(buildHeadroomWrapPrefix('claude', { preserve1mContext: true })).toContain('--1m')
    expect(buildHeadroomWrapPrefix('codex', { preserve1mContext: true })).not.toContain('--1m')
  })

  it('keeps Headroom flags ahead of the terminator', () => {
    const prefix = buildHeadroomWrapPrefix('claude', {
      retrieveMcp: false,
      preserve1mContext: true
    })
    expect(prefix).toBe('headroom wrap claude --code-memory none --no-mcp --1m --')
  })
})

describe('isHeadroomEnabledForAgent', () => {
  it('requires both an opt-in and a wrappable agent', () => {
    expect(isHeadroomEnabledForAgent('claude', { claude: true })).toBe(true)
    expect(isHeadroomEnabledForAgent('claude', { claude: false })).toBe(false)
    expect(isHeadroomEnabledForAgent('claude', undefined)).toBe(false)
    // Enabled in settings but not launchable by Headroom.
    expect(isHeadroomEnabledForAgent('cursor', { cursor: true })).toBe(false)
  })
})

describe('resolveAgentLaunchCommand with Headroom', () => {
  const platform: NodeJS.Platform = 'darwin'
  const base = { cmdOverrides: {}, platform, shell: 'posix' as const }

  it('wraps the launch and keeps agent args after the terminator', () => {
    const result = resolveAgentLaunchCommand({
      ...base,
      agent: 'claude',
      agentArgs: '--dangerously-skip-permissions',
      headroomAgents: { claude: true }
    })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.command).toBe(
      "headroom wrap claude --code-memory none -- claude '--dangerously-skip-permissions'"
    )
  })

  it('leaves the command untouched when the agent is not opted in', () => {
    const result = resolveAgentLaunchCommand({ ...base, agent: 'claude' })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.command).toBe('claude')
  })

  it('lets a command override win, since Headroom resolves the binary itself', () => {
    const result = resolveAgentLaunchCommand({
      ...base,
      agent: 'claude',
      cmdOverrides: { claude: '/opt/custom/claude' },
      headroomAgents: { claude: true }
    })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.command).toBe('/opt/custom/claude')
    expect(isHeadroomWrappedCommand(result.command)).toBe(false)
  })
})

describe('isHeadroomWrappedCommand', () => {
  it('recognizes a wrapped command and ignores lookalikes', () => {
    expect(isHeadroomWrappedCommand('headroom wrap claude -- claude')).toBe(true)
    expect(isHeadroomWrappedCommand('claude')).toBe(false)
    expect(isHeadroomWrappedCommand('claude --prompt "headroom wraps things"')).toBe(false)
    expect(isHeadroomWrappedCommand(null)).toBe(false)
  })
})

describe('headroomLaunchSettings', () => {
  it('narrows settings and tolerates a missing settings object', () => {
    expect(headroomLaunchSettings({ headroomAgents: { codex: true } })).toEqual({
      headroomAgents: { codex: true },
      headroomWrapOptions: undefined
    })
    expect(headroomLaunchSettings(null)).toEqual({
      headroomAgents: undefined,
      headroomWrapOptions: undefined
    })
  })
})
