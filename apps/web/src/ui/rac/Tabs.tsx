'use client'

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
  return <RACTabs {...props} className={composeRenderProps(props.className, (c) => cls('rac-tabs', c))} />
}

export function TabList(props: React.ComponentProps<typeof RACTabList>) {
  return (
    <RACTabList {...props} className={composeRenderProps(props.className, (c) => cls('rac-tabList', c))} />
  )
}

export function Tab(props: TabProps) {
  return (
    <RACTab {...props} className={composeRenderProps(props.className, (c) => cls('rac-tab', c))}>
      {props.children}
    </RACTab>
  )
}

export function TabPanels(props: React.ComponentProps<typeof RACTabPanels>) {
  return (
    <RACTabPanels
      {...props}
      className={cls('rac-tabPanels', typeof props.className === 'string' ? props.className : '')}
    />
  )
}

export function TabPanel(props: React.ComponentProps<typeof RACTabPanel>) {
  return (
    <RACTabPanel
      {...props}
      className={cls('rac-tabPanel', typeof props.className === 'string' ? props.className : '')}
    />
  )
}
