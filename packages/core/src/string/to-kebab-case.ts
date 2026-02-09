export const toKebabCase = (value: string) => {
  const normalized = value
    .replace(/[_\s]+/g, '-')
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z\d-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized.toLowerCase()
}
