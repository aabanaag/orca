import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendFollowupPromptWhenAgentReady } from './agent-followup-delivery'
import {
  inspectRuntimeTerminalProcess,
  sendRuntimePtyInputVerified
} from '@/runtime/runtime-terminal-inspection'
import { TUI_AGENT_CONFIG } from '../../../shared/tui-agent-config'

vi.mock('@/runtime/runtime-terminal-inspection', () => ({
  inspectRuntimeTerminalProcess: vi.fn(),
  sendRuntimePtyInputVerified: vi.fn()
}))

// The interpreter-wrapped agents that deliver their prompt over stdin after the
// process starts. These are pip console-scripts, so the PTY foreground comm is
// python/python3 — never the agent's own name.
const INTERPRETER_WRAPPED_AGENTS = [
  { agent: 'aider', expectedProcess: TUI_AGENT_CONFIG.aider.expectedProcess },
  { agent: 'mistral-vibe', expectedProcess: TUI_AGENT_CONFIG['mistral-vibe'].expectedProcess }
] as const

describe('sendFollowupPromptWhenAgentReady — interpreter-wrapped agents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('globalThis', globalThis)
    // Deliver the prompt write eagerly so the test does not depend on retries.
    vi.mocked(sendRuntimePtyInputVerified).mockResolvedValue(true)
  })

  it('sanity: config keeps aider/vibe as stdin-after-start with python-style expected process', () => {
    expect(TUI_AGENT_CONFIG.aider.promptInjectionMode).toBe('stdin-after-start')
    expect(TUI_AGENT_CONFIG['mistral-vibe'].promptInjectionMode).toBe('stdin-after-start')
  })

  for (const { agent, expectedProcess } of INTERPRETER_WRAPPED_AGENTS) {
    it(`types the prompt once ${agent} is up behind a python3 wrapper with a live child`, async () => {
      // The console-script agent is running: foreground comm is python3 and the
      // PTY has a non-shell child. The exact agent name never appears.
      vi.mocked(inspectRuntimeTerminalProcess).mockResolvedValue({
        foregroundProcess: 'python3',
        hasChildProcesses: true
      })

      const delivered = await sendFollowupPromptWhenAgentReady({
        ptyId: 'pty-1',
        expectedProcess,
        prompt: 'ship it',
        settings: null
      })

      expect(delivered).toBe(true)
      expect(sendRuntimePtyInputVerified).toHaveBeenCalledWith(null, 'pty-1', 'ship it\r')
    })

    it(`still refuses to type into a bare ${agent} shell foreground`, async () => {
      // No agent yet: foreground is a plain shell with no non-shell child. The
      // guard must NOT write user text into an arbitrary shell.
      vi.mocked(inspectRuntimeTerminalProcess).mockResolvedValue({
        foregroundProcess: 'zsh',
        hasChildProcesses: false
      })

      const delivered = await sendFollowupPromptWhenAgentReady({
        ptyId: 'pty-1',
        expectedProcess,
        prompt: 'ship it',
        settings: null
      })

      expect(delivered).toBe(false)
      expect(sendRuntimePtyInputVerified).not.toHaveBeenCalled()
    })

    it(`refuses to type into a ${agent} wrapper without a live child`, async () => {
      vi.mocked(inspectRuntimeTerminalProcess).mockResolvedValue({
        foregroundProcess: 'python3',
        hasChildProcesses: false
      })

      const delivered = await sendFollowupPromptWhenAgentReady({
        ptyId: 'pty-1',
        expectedProcess,
        prompt: 'ship it',
        settings: null
      })

      expect(delivered).toBe(false)
      expect(sendRuntimePtyInputVerified).not.toHaveBeenCalled()
    })
  }

  it('types immediately when the resolver already returns the agent name (local ps path)', async () => {
    // On local desktop the ps-table resolver usually resolves python3 → aider
    // before we poll; the exact-match path must keep working.
    vi.mocked(inspectRuntimeTerminalProcess).mockResolvedValue({
      foregroundProcess: 'aider',
      hasChildProcesses: true
    })

    const delivered = await sendFollowupPromptWhenAgentReady({
      ptyId: 'pty-1',
      expectedProcess: 'aider',
      prompt: 'ship it',
      settings: null
    })

    expect(delivered).toBe(true)
    expect(sendRuntimePtyInputVerified).toHaveBeenCalledWith(null, 'pty-1', 'ship it\r')
  })
})

describe('sendFollowupPromptWhenAgentReady — Headroom-wrapped launches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('globalThis', globalThis)
    vi.mocked(sendRuntimePtyInputVerified).mockResolvedValue(true)
  })

  it('does not accept a python foreground while the Headroom wrapper is still booting', async () => {
    // Headroom is itself a pip console script, so a wrapper that is still loading its compression
    // models and binding the proxy looks exactly like a started interpreter-wrapped agent. Typing
    // here would send the prompt into a terminal the agent has not launched in yet.
    vi.mocked(inspectRuntimeTerminalProcess).mockResolvedValue({
      foregroundProcess: 'python3',
      hasChildProcesses: true
    })
    // Fake timers: a wrapped launch polls out its full multi-minute budget before giving up.
    vi.useFakeTimers()
    try {
      const pending = sendFollowupPromptWhenAgentReady({
        ptyId: 'pty-1',
        expectedProcess: TUI_AGENT_CONFIG.aider.expectedProcess,
        prompt: 'ship it',
        settings: null,
        headroomWrapped: true
      })
      await vi.advanceTimersByTimeAsync(300 * 150)
      expect(await pending).toBe(false)
    } finally {
      vi.useRealTimers()
    }
    expect(sendRuntimePtyInputVerified).not.toHaveBeenCalled()
  })

  it('types once the wrapped agent itself owns the foreground', async () => {
    vi.mocked(inspectRuntimeTerminalProcess).mockResolvedValue({
      foregroundProcess: 'aider',
      hasChildProcesses: true
    })

    const delivered = await sendFollowupPromptWhenAgentReady({
      ptyId: 'pty-1',
      expectedProcess: TUI_AGENT_CONFIG.aider.expectedProcess,
      prompt: 'ship it',
      settings: null,
      headroomWrapped: true
    })

    expect(delivered).toBe(true)
    expect(sendRuntimePtyInputVerified).toHaveBeenCalledWith(null, 'pty-1', 'ship it\r')
  })
})
