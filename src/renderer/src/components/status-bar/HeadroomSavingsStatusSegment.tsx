import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { translate } from '@/i18n/i18n'
import {
  formatHeadroomPercent,
  formatHeadroomTokens,
  hasHeadroomSavings,
  type HeadroomSavings
} from '../../../../shared/headroom-savings'
import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from './status-bar-context-menu-policy'

// Why poll rather than subscribe: the proxy is a separate third-party process with no push
// channel. The main-process probe caches, so this cadence costs one HTTP round trip at most.
const POLL_INTERVAL_MS = 15_000

export function HeadroomSavingsStatusSegment({
  iconOnly
}: {
  iconOnly: boolean
}): React.JSX.Element | null {
  const [savings, setSavings] = useState<HeadroomSavings | null>(null)

  useEffect(() => {
    let mounted = true
    const poll = (): void => {
      void window.api.headroom
        ?.getSavings()
        .then((next) => {
          if (mounted) {
            setSavings(next)
          }
        })
        .catch(() => {})
    }
    poll()
    const timer = window.setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  // Nothing compressed yet (or no proxy): stay out of the status bar entirely.
  if (isPairedWebClientWindow() || !hasHeadroomSavings(savings) || !savings) {
    return null
  }

  const title = translate(
    'auto.components.status.bar.HeadroomSavingsStatusSegment.title',
    'Headroom'
  )
  const percent = formatHeadroomPercent(savings.savingsPercent)
  const tokens = formatHeadroomTokens(savings.tokensSaved)
  const ariaLabel = translate(
    'auto.components.status.bar.HeadroomSavingsStatusSegment.ariaLabel',
    'Headroom, {{percent}} context saved ({{tokens}} tokens)',
    { percent, tokens }
  )

  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
              className="inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
              aria-label={ariaLabel}
            >
              <Zap className="size-3" />
              {!iconOnly ? <span className="text-[11px] font-medium">{percent}</span> : null}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {ariaLabel}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
        side="top"
        align="end"
        sideOffset={8}
        className="w-64"
      >
        <DropdownMenuLabel>
          <div className="flex items-center justify-between gap-3">
            <span>{title}</span>
            <span className="font-normal text-muted-foreground">
              {translate(
                'auto.components.status.bar.HeadroomSavingsStatusSegment.local',
                'this machine'
              )}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <SavingsRow
          label={translate(
            'auto.components.status.bar.HeadroomSavingsStatusSegment.saved',
            'Saved'
          )}
          value={`${percent} (${tokens})`}
        />
        <SavingsRow
          label={translate(
            'auto.components.status.bar.HeadroomSavingsStatusSegment.cost',
            'Cost saved'
          )}
          value={`$${savings.costSavedUsd.toFixed(2)}`}
        />
        {savings.agents.length > 0 && <DropdownMenuSeparator />}
        {savings.agents.map((agent) => (
          <SavingsRow
            key={agent.label}
            label={agent.label}
            value={`${formatHeadroomPercent(agent.savingsPercent)} · ${formatHeadroomTokens(agent.tokensSaved)}`}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SavingsRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}
