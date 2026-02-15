import './index.css'
import { AppProvider, useAppSelector } from './state/appActor'
import { AuthProvider } from './state/authActor'
import { DevicesProvider } from './state/devicesActor'
import { AuthView } from './views/AuthView'
import { BootView } from './views/BootView'
import { InventoryView } from './views/devices/InventoryView'

const getInitialCidr = (): string => {
  // CIDR selection is intentionally not exposed in the main UI (auto-suggest only).
  return ''
}

export function App() {
  return (
    <AppProvider>
      <AppRouter />
    </AppProvider>
  )
}

function AppRouter() {
  const isBooting = useAppSelector((s) => s.matches('booting'))
  const isInActive = useAppSelector((s) => s.matches('active'))
  const isAuthView = useAppSelector((s) => s.matches({ active: 'auth' }))
  const isDevicesView = useAppSelector((s) => s.matches({ active: 'devices' }))
  const cloud = useAppSelector((s) => s.context.cloud)

  if (isBooting) return <BootView />

  return (
    <div className="lab-bg min-h-screen">
      {isInActive ? (
        isAuthView ? (
          <AuthProvider>
            <AuthView />
          </AuthProvider>
        ) : isDevicesView ? (
          cloud ? (
            <DevicesProvider cloud={cloud} initialCidr={getInitialCidr()}>
              <InventoryView />
            </DevicesProvider>
          ) : null
        ) : null
      ) : null}
    </div>
  )
}

export default App
