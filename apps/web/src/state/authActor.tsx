import * as React from 'react'
import { createActorContext } from '@xstate/react'
import { authMachine } from './authMachine'

export const AuthActorContext = createActorContext(authMachine)

export function AuthProvider(props: { children: React.ReactNode }) {
  return <AuthActorContext.Provider>{props.children}</AuthActorContext.Provider>
}

export const useAuthActorRef = AuthActorContext.useActorRef
export const useAuthSelector = AuthActorContext.useSelector
