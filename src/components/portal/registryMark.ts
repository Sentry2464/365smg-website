/** The number a registrant carries in the Registry card and on the intel map: ① to ⑳, then #21… */
export const registryMark = (n: number) => (n >= 1 && n <= 20 ? String.fromCharCode(0x245f + n) : `#${n}`)
