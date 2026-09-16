import {
  inspectRuntimeTerminalProcess,
  sendRuntimePtyInputVerified
} from '@/runtime/runtime-terminal-inspection'
import {
  isAgentForegroundWrapperProcess,
  isExpectedAgentProcess
} from '../../../shared/agent-process-recognition'
import { isShellProcess } from '../../../shared/shell-process-detection'
import type { GlobalSettings } from '../../../shared/global-settings-types'

type RuntimeOwnerSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined

export async function sendFollowupPromptWhenAgentReady(args: {
  ptyId: string
  expectedProcess: string
  prompt: string
  settings: RuntimeOwnerSettings
  /** Set when the launch went through `headroom wrap`; see waitForAgentForeground. */
  headroomWrapped?: boolean
}): Promise<boolean> {
  const { ptyId, expectedProcess, prompt, settings, headroomWrapped } = args
  if (!(await waitForAgentForeground(ptyId, expectedProcess, settings, headroomWrapped))) {
    return false
  }
  try {
    return await sendRuntimePtyInputVerified(settings, ptyId, `${prompt}\r`)
  } catch {
    return false
  }
}

// Why: delayed follow-ups must not type into an arbitrary shell. Require a
// positive readiness signal before writing user/task text to the PTY.
async function waitForAgentForeground(
  ptyId: string,
  expectedProcess: string,
  settings: RuntimeOwnerSettings,
  headroomWrapped?: boolean
): Promise<boolean> {
  // Why the longer budget: a cold `headroom wrap` spends 20-30s loading compression models and
  // binding its proxy before the agent starts, far past the 30-attempt (~4.5s) default.
  const maxAttempts = headroomWrapped ? 300 : 30
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 150))
    }
    try {
      const process = await inspectRuntimeTerminalProcess(settings, ptyId)
      const foreground = process.foregroundProcess?.toLowerCase() ?? ''
      if (isExpectedAgentProcess(foreground, expectedProcess)) {
        return true
      }
      // Why: interpreter-wrapped agents (aider, mistral-vibe are pip console
      // scripts) surface a python/node foreground comm, so the exact-name check
      // never matches — locally when the ps-table resolver can't pin the child,
      // and over SSH when the relay falls back to the bare interpreter name. If
      // the foreground is a known agent wrapper (not a shell) with a live
      // non-shell child, the agent has taken over the PTY and can accept input.
      // Why headroomWrapped opts out: Headroom is itself a Python console script, so a booting
      // wrapper is indistinguishable here from an interpreter-wrapped agent - same interpreter
      // foreground, same live children - and accepting it would type the follow-up before the
      // agent exists. Wrapped launches wait for the exact-name match above instead.
      if (
        attempt >= 4 &&
        !headroomWrapped &&
        isAgentForegroundWrapperProcess(foreground) &&
        !isShellProcess(foreground) &&
        process.hasChildProcesses
      ) {
        return true
      }
    } catch {
      // Ignore transient PTY inspection failures and keep polling.
    }
  }
  return false
}
