/** The number a registrant carries in the Registry card and on the intel map: ① to ⑳, then #21… */
export const registryMark = (n: number) => (n >= 1 && n <= 20 ? String.fromCharCode(0x245f + n) : `#${n}`)

/** The number at the start of a Registry pin's label (as the globe reports a click), or null. */
export function registryNumber(label: string): number | null {
  const m = /^(?:([\u2460-\u2473])|#(\d{1,4}))\s/.exec(label)
  if (!m) return null
  return m[1] ? m[1].charCodeAt(0) - 0x245f : Number(m[2])
}

/** The Registry card entry for a number, and the window event that opens it. */
export const registryEntryId = (n: number) => `registrant-${n}`
export const REGISTRY_OPEN = 'smg:registry-open'
