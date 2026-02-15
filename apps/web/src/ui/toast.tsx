import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, m } from './motion/MotionProvider'

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
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] px-4" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {toast ? (
            <m.div
              key="toast"
              className="mx-auto w-full max-w-[620px] rounded-[var(--radius-xl)] border border-white/15 bg-black/35 p-3 shadow-[0_34px_90px_rgba(0,0,0,0.65)] backdrop-blur-xl backdrop-saturate-150"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <div className="flex items-center justify-between gap-3">
                <div
                  className={[
                    'rounded-full border px-2.5 py-1 text-[11px] tracking-[0.16em] uppercase',
                    toast.kind === 'ok'
                      ? 'border-[color:color-mix(in_srgb,var(--color-accent-2)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--color-accent-2)_10%,transparent)] text-white/85'
                      : 'border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] text-white/85',
                  ].join(' ')}
                >
                  {toast.kind === 'ok' ? 'OK' : 'ERROR'}
                </div>
                <div className="text-muted text-[11px] tracking-[0.16em] uppercase">merossity</div>
              </div>
              <div className="text-foreground mt-2 text-[16px] leading-tight font-[var(--font-display)]">
                {toast.title}
              </div>
              {toast.detail ? <div className="text-muted mt-1 text-[13px] leading-snug">{toast.detail}</div> : null}
            </m.div>
          ) : null}
        </AnimatePresence>
      </div>
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
