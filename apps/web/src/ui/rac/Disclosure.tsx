import type { ReactNode } from 'react'
import {
  Button as RACButton,
  Disclosure as RACDisclosure,
  DisclosurePanel as RACDisclosurePanel,
  Heading,
  type DisclosureProps as RACDisclosureProps,
  type DisclosurePanelProps as RACDisclosurePanelProps,
  composeRenderProps,
} from 'react-aria-components'
import { cls } from '../cls'

// Keep parity with react-aria-components: children may be a render function.
export type DisclosureProps = RACDisclosureProps

export function Disclosure(props: DisclosureProps) {
  return (
    <RACDisclosure
      {...props}
      className={composeRenderProps(props.className, (className) => cls('rounded-[var(--radius-lg)]', className))}
    />
  )
}

export function DisclosureTrigger(props: { children: ReactNode; className?: string }) {
  return (
    <Heading className="m-0">
      <RACButton
        slot="trigger"
        className={composeRenderProps(props.className, (className) =>
          cls(
            'outline-none',
            'data-[pressed]:translate-y-px',
            'data-[focus-visible]:ring-2 data-[focus-visible]:ring-[color:color-mix(in_srgb,var(--color-accent-2)_20%,transparent)]',
            className,
          ),
        )}
      >
        {props.children}
      </RACButton>
    </Heading>
  )
}

export type DisclosurePanelProps = RACDisclosurePanelProps & { children: ReactNode }

export function DisclosurePanel(props: DisclosurePanelProps) {
  return (
    <RACDisclosurePanel
      {...props}
      className={composeRenderProps(props.className, (className) =>
        cls(
          // Height animation is constrained to the panel surface; disable in reduced motion.
          'h-(--disclosure-panel-height) overflow-clip motion-safe:transition-[height] motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none',
          className,
        ),
      )}
    />
  )
}
