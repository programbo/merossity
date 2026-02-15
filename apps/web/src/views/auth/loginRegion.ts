import type { LoginRegion } from '../../state/authMachine'

export const LOGIN_REGION_STORAGE_KEY = 'merossity.loginRegion'

const isLoginRegion = (v: string): v is LoginRegion =>
  v === 'auto' || v === 'global' || v === 'us' || v === 'eu' || v === 'ap'

export const getLikelyLoginRegion = (): { region: Exclude<LoginRegion, 'auto'>; reason: string } => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  const languages = [...(navigator.languages ?? []), navigator.language].filter(Boolean).join(', ')

  if (timezone.startsWith('America/')) {
    return { region: 'us', reason: `timezone: ${timezone}` }
  }

  if (timezone.startsWith('Europe/')) {
    return { region: 'eu', reason: `timezone: ${timezone}` }
  }

  if (timezone.startsWith('Asia/') || timezone.startsWith('Australia/') || timezone.startsWith('Pacific/')) {
    return { region: 'ap', reason: `timezone: ${timezone}` }
  }

  const usLocale = /-(US|CA|MX)\b/i.test(languages)
  if (usLocale) {
    return { region: 'us', reason: `language: ${languages}` }
  }

  const euLocale = /-(GB|IE|FR|DE|ES|IT|NL|BE|SE|NO|DK|FI|PL|PT|AT|CH)\b/i.test(languages)
  if (euLocale) {
    return { region: 'eu', reason: `language: ${languages}` }
  }

  const apLocale = /-(AU|NZ|JP|KR|SG|HK|TW)\b/i.test(languages)
  if (apLocale) {
    return { region: 'ap', reason: `language: ${languages}` }
  }

  return { region: 'global', reason: timezone ? `timezone: ${timezone}` : 'default' }
}

export const getStoredLoginRegion = (): LoginRegion | null => {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(LOGIN_REGION_STORAGE_KEY) ?? ''
    return isLoginRegion(raw) ? raw : null
  } catch {
    return null
  }
}

export const persistLoginRegion = (region: LoginRegion): void => {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(LOGIN_REGION_STORAGE_KEY, region)
  } catch {
    // ignore
  }
}
