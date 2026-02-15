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

export type DisclosureProps = RACDisclosureProps & {
  children: ReactNode
}

export function Disclosure(props: DisclosureProps) {
  return (
    <RACDisclosure
      {...props}
      className={composeRenderProps(props.className, (className) =>
        cls('rounded-[var(--radius-lg)] border border-white/15 bg-white/5', className),
      )}
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
            'flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-[11px] tracking-[0.16em] text-white/75 uppercase outline-none',
            'data-[hovered]:bg-white/5 data-[pressed]:translate-y-px data-[pressed]:bg-white/5',
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
