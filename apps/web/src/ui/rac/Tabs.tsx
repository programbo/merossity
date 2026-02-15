import {
  Tab as RACTab,
  TabList as RACTabList,
  TabPanel as RACTabPanel,
  TabPanels as RACTabPanels,
  Tabs as RACTabs,
  type TabProps,
  type TabsProps,
  composeRenderProps,
} from 'react-aria-components'
import { cls } from '../cls'

export function Tabs(props: TabsProps) {
  return <RACTabs {...props} className={composeRenderProps(props.className, (c) => cls('grid gap-3', c))} />
}

export function TabList(props: React.ComponentProps<typeof RACTabList>) {
  return (
    <RACTabList
      {...props}
      className={composeRenderProps(props.className, (c) =>
        cls(
          'grid w-full grid-flow-col auto-cols-fr gap-2 rounded-full border border-white/15 bg-[rgba(10,14,22,0.72)] p-2 shadow-[0_34px_90px_rgba(0,0,0,0.65)] backdrop-blur-xl backdrop-saturate-150',
          c,
        ),
      )}
    />
  )
}

export function Tab(props: TabProps) {
  return (
    <RACTab
      {...props}
      className={composeRenderProps(props.className, (c) =>
        cls(
          'inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/3 text-[12px] tracking-[0.16em] text-white/85 uppercase outline-none',
          'transition-[transform,background,border-color,color] duration-150 ease-out [-webkit-tap-highlight-color:transparent]',
          'data-hovered:border-white/16 data-hovered:bg-white/6',
          'data-selected:border-[color-mix(in_srgb,var(--color-accent)_38%,transparent)] data-selected:bg-[radial-gradient(100px_60px_at_25%_20%,rgba(255,255,255,0.16),transparent_55%),linear-gradient(180deg,rgba(255,106,0,0.92),rgba(255,106,0,0.72))] data-selected:text-[rgba(11,16,32,0.92)]',
          'data-focus-visible:border-[color-mix(in_srgb,var(--color-accent-2)_35%,transparent)] data-focus-visible:ring-2 data-focus-visible:ring-[color-mix(in_srgb,var(--color-accent-2)_20%,transparent)]',
          c,
        ),
      )}
    >
      {props.children}
    </RACTab>
  )
}

export function TabPanels(props: React.ComponentProps<typeof RACTabPanels>) {
  return (
    <RACTabPanels
      {...props}
      className={cls('grid gap-3', typeof props.className === 'string' ? props.className : '')}
    />
  )
}

export function TabPanel(props: React.ComponentProps<typeof RACTabPanel>) {
  return (
    <RACTabPanel
      {...props}
      className={cls('outline-none', typeof props.className === 'string' ? props.className : '')}
    />
  )
}
