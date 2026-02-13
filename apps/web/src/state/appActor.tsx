import * as React from 'react'
import { createActorContext } from '@xstate/react'
import { ToastProvider } from '../ui/toast'
import { appMachine } from './appMachine'

export const AppActorContext = createActorContext(appMachine)

export function AppProvider(props: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AppActorContext.Provider>{props.children}</AppActorContext.Provider>
    </ToastProvider>
  )
}

export const useAppActorRef = AppActorContext.useActorRef
export const useAppSelector = AppActorContext.useSelector
