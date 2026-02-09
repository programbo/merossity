export const truncate = (value: string, maxLength: number, suffix = '...') => {
  if (maxLength <= 0) return ''
  if (value.length <= maxLength) return value
  if (suffix.length >= maxLength) return suffix.slice(0, maxLength)

  return `${value.slice(0, maxLength - suffix.length)}${suffix}`
}
