export type Tab = 'connect' | 'devices' | 'settings'

export const getHashTab = (): Tab => {
  if (typeof location === 'undefined') return 'connect'
  const raw = (location.hash || '').replace(/^#/, '').trim()
  if (raw === 'devices') return 'devices'
  if (raw === 'settings') return 'settings'
  return 'connect'
}

export const setHashTab = (t: Tab) => {
  if (typeof location === 'undefined') return
  location.hash = `#${t}`
}

