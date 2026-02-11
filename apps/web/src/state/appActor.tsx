import * as React from 'react'
import { createActorContext } from '@xstate/react'
import { appMachine } from './appMachine'

const getInitialCidr = (): string => {
  try {
    if (typeof localStorage === 'undefined') return ''
    return localStorage.getItem('merossity.cidr') ?? ''
  } catch {
    return ''
  }
}

export const AppActorContext = createActorContext(appMachine)

export function AppProvider(props: { children: React.ReactNode }) {
  // Keep input stable for the lifetime of this provider.
  const input = React.useMemo(
    () => ({
      initialCidr: getInitialCidr(),
    }),
    [],
  )

  return <AppActorContext.Provider options={{ input }}>{props.children}</AppActorContext.Provider>
}

export const useAppActorRef = AppActorContext.useActorRef
export const useAppSelector = AppActorContext.useSelector
