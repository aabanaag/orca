import { translate } from '@/i18n/i18n'
import { SettingsSwitchRow } from './SettingsFormControls'

export type AgentHeadroomControl = {
  /** Headroom can launch this agent (`headroom wrap <sub>` execs it). */
  isSupported: boolean
  /** The `headroom` CLI was found on PATH by preflight. */
  isInstalled: boolean
  isEnabled: boolean
  /** A command override is set, which `headroom wrap` cannot honor. */
  blockedByCmdOverride: boolean
  onSetEnabled: (enabled: boolean) => void
}

/**
 * Per-agent opt-in to routing an agent's API traffic through the local Headroom proxy.
 *
 * Kept out of AgentCatalogRow so the row stays within max-lines, and because every disabled state
 * here needs its own reason text - a silent inert switch is worse than no switch.
 */
export function AgentHeadroomToggle({
  agentLabel,
  control
}: {
  agentLabel: string
  control: AgentHeadroomControl
}): React.JSX.Element | null {
  if (!control.isSupported) {
    return null
  }
  const disabled = !control.isInstalled || control.blockedByCmdOverride
  const checked = control.isEnabled && !disabled
  return (
    <SettingsSwitchRow
      label={translate('auto.components.settings.AgentHeadroomControl.label', 'Headroom')}
      description={resolveDescription(control)}
      checked={checked}
      disabled={disabled}
      onChange={() => control.onSetEnabled(!checked)}
      ariaLabel={translate(
        'auto.components.settings.AgentHeadroomControl.aria',
        'Route {{value0}} through Headroom',
        { value0: agentLabel }
      )}
    />
  )
}

function resolveDescription(control: AgentHeadroomControl): string {
  if (!control.isInstalled) {
    return translate(
      'auto.components.settings.AgentHeadroomControl.notInstalled',
      'Not found on PATH. Install headroom-ai, then use Refresh above.'
    )
  }
  if (control.blockedByCmdOverride) {
    return translate(
      'auto.components.settings.AgentHeadroomControl.overrideConflict',
      'Unavailable while a command override is set — Headroom resolves the agent binary itself.'
    )
  }
  return translate(
    'auto.components.settings.AgentHeadroomControl.enabled',
    'Compress context through a local Headroom proxy. The first launch also starts the proxy, which takes a few seconds.'
  )
}
