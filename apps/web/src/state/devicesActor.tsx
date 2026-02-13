import * as React from 'react'
import { createActorContext } from '@xstate/react'
import type { CloudSummary } from '../lib/types'
import { devicesMachine } from './devicesMachine'


export const DevicesActorContext = createActorContext(devicesMachine)

export function DevicesProvider(props: { children: React.ReactNode; cloud: CloudSummary; initialCidr: string }) {
  const input = React.useMemo(
    () => ({
      cloud: props.cloud,
      initialCidr: props.initialCidr,
    }),
    [props.cloud, props.initialCidr],
  )

  return <DevicesActorContext.Provider options={{ input }}>{props.children}</DevicesActorContext.Provider>
}

export const useDevicesActorRef = DevicesActorContext.useActorRef
export const useDevicesSelector = DevicesActorContext.useSelector
