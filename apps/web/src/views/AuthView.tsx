import { useEffect, useMemo, useRef } from 'react'
import { useAppActorRef } from '../state/appActor'
import { useAuthActorRef, useAuthSelector } from '../state/authActor'
import type { LoginRegion } from '../state/authMachine'
import { Button } from '../ui/rac/Button'
import { TextField } from '../ui/rac/TextField'
import { getLikelyLoginRegion, getStoredLoginRegion, persistLoginRegion } from './auth/loginRegion'

const INPUT_COMMON = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const
const INPUT_EMAIL = { ...INPUT_COMMON, type: 'email' as const, autoComplete: 'email' } as const
const INPUT_PASSWORD = { ...INPUT_COMMON, type: 'password' as const } as const
const INPUT_NUMERIC = { ...INPUT_COMMON, inputMode: 'numeric' as const } as const

const isTotpValid = (s: string) => /^[0-9]{6}$/.test(String(s ?? '').trim())

const isLoginRegion = (v: string): v is LoginRegion =>
  v === 'auto' || v === 'global' || v === 'us' || v === 'eu' || v === 'ap'

export function AuthView() {
  const app = useAppActorRef()
  const auth = useAuthActorRef()
  const email = useAuthSelector((s) => s.context.email)
  const password = useAuthSelector((s) => s.context.password)
  const totp = useAuthSelector((s) => s.context.totp)
  const region = useAuthSelector((s) => s.context.region)
  const cloud = useAuthSelector((s) => s.context.cloud)
  const error = useAuthSelector((s) => s.context.error)
  const isSubmitting = useAuthSelector((s) => s.matches('submitting'))
  const isSuccess = useAuthSelector((s) => s.matches('success'))
  const didInitRegionRef = useRef(false)

  const likelyRegion = useMemo(() => getLikelyLoginRegion(), [])
  const regionHint =
    region === 'auto'
      ? `Auto tries multiple regions on failure. Likely: ${likelyRegion.region}.`
      : `Likely: ${likelyRegion.region}.`

  const canSubmit = useMemo(() => {
    if (!isTotpValid(totp)) return false
    return Boolean(email.trim() && password)
  }, [email, password, totp])

  useEffect(() => {
    if (!isSuccess || !cloud) return
    app.send({ type: 'auth_loginSuccess', cloud })
  }, [app, cloud, isSuccess])

  useEffect(() => {
    if (didInitRegionRef.current) return
    didInitRegionRef.current = true
    const saved = getStoredLoginRegion()
    if (saved) {
      auth.send({ type: 'SET_REGION', region: saved })
      return
    }
    auth.send({ type: 'SET_REGION', region: getLikelyLoginRegion().region })
  }, [auth])

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 pt-6 pb-24">
      <header className="glass-panel shadow-panel grid gap-3 rounded-[var(--radius-xl)] px-5 py-4">
        <div className="text-[42px] leading-[0.92] font-[var(--font-display)] tracking-[-0.02em]">
          Meross Account Login
        </div>
      </header>

      <main className="mt-4">
        <section className="glass-panel shadow-panel overflow-hidden rounded-[var(--radius-xl)]">
          <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
            <div>
              <div className="text-[22px] leading-tight font-[var(--font-display)]">Sign In to Continue</div>
            </div>
          </header>

          <form
            className="grid gap-4 p-4"
            onSubmit={(e) => {
              e.preventDefault()
              persistLoginRegion(region)
              auth.send({ type: 'SUBMIT' })
            }}
          >
            <div className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-[11px] tracking-[0.16em] text-white/50 uppercase" htmlFor="login-region">
                  Region
                </label>
                <select
                  id="login-region"
                  name="region"
                  className="text-foreground h-11 w-full rounded-[var(--radius-md)] border border-white/15 bg-black/25 px-3 text-[13px] transition-colors outline-none focus-visible:border-[color:color-mix(in_srgb,var(--color-accent-2)_35%,transparent)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-accent-2)_16%,transparent)]"
                  value={region}
                  onChange={(e) => {
                    const next = e.currentTarget.value
                    if (!isLoginRegion(next)) return
                    auth.send({ type: 'SET_REGION', region: next })
                  }}
                  disabled={isSubmitting}
                  required
                >
                  <option value="auto">Auto (Recommended)</option>
                  <option value="global">Global (iotx.meross.com)</option>
                  <option value="us">United States (iotx-us.meross.com)</option>
                  <option value="eu">Europe (iotx-eu.meross.com)</option>
                  <option value="ap">Asia-Pacific (iotx-ap.meross.com)</option>
                </select>
                <div className="text-muted text-[13px] leading-snug">{regionHint}</div>
                <div className="text-muted text-[13px] leading-snug">Heuristic basis: {likelyRegion.reason}.</div>
              </div>

              <TextField
                label="Email"
                value={email}
                onChange={(email) => auth.send({ type: 'SET_EMAIL', email })}
                placeholder="name@example.com…"
                isDisabled={isSubmitting}
                inputProps={{ ...INPUT_EMAIL, name: 'email', required: true }}
              />

              <TextField
                label="Password"
                value={password}
                onChange={(password) => auth.send({ type: 'SET_PASSWORD', password })}
                placeholder="Enter your password…"
                isDisabled={isSubmitting}
                inputProps={{ ...INPUT_PASSWORD, name: 'password', autoComplete: 'current-password', required: true }}
              />

              <TextField
                label="TOTP (6 digits)"
                value={totp}
                onChange={(totp) => auth.send({ type: 'SET_TOTP', totp: totp.replace(/[^0-9]/g, '').slice(0, 6) })}
                placeholder="123456…"
                isDisabled={isSubmitting}
                inputProps={{
                  ...INPUT_NUMERIC,
                  name: 'mfaCode',
                  autoComplete: 'one-time-code',
                  maxLength: 6,
                  pattern: '[0-9]{6}',
                  required: true,
                }}
              />
            </div>

            {error ? (
              <div
                className="text-[13px] leading-relaxed text-[color:color-mix(in_srgb,var(--color-danger)_70%,white)]"
                role="status"
                aria-live="polite"
              >
                {error}
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-3">
              <Button tone="primary" type="submit" isDisabled={isSubmitting || !canSubmit} isPending={isSubmitting}>
                Fetch Key & Device List
              </Button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}
