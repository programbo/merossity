import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'

export type ToastData = {
  kind: 'ok' | 'err'
  title: string
  detail?: string
}

type ToastContextValue = {
  show: (toast: ToastData) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null)

  useEffect(() => {
    if (!toast) return

    const timeout = setTimeout(() => {
      setToast(null)
    }, 4500)

    return () => clearTimeout(timeout)
  }, [toast])

  const show = useCallback((toast: ToastData) => {
    setToast(toast)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div className="toastRegion" role="status" aria-live="polite">
          <div className={`toast toast--${toast.kind}`}>
            <div className="toast__row">
              <div className="toast__badge">{toast.kind === 'ok' ? 'OK' : 'ERROR'}</div>
              <div className="toast__brand">merossity</div>
            </div>
            <div className="toast__title">{toast.title}</div>
            {toast.detail && <div className="toast__detail">{toast.detail}</div>}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
