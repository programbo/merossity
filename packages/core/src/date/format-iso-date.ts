const pad = (value: number) => value.toString().padStart(2, '0')

export const formatIsoDate = (date: Date) => {
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  return `${year}-${month}-${day}`
}
