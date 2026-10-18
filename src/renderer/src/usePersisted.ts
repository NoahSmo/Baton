import { useState } from 'react'

/** State remembered in localStorage; `valid` rejects stored values this version does not know. */
export function usePersisted<T extends string>(key: string, initial: T, valid: readonly T[]): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key) as T | null
    return stored && valid.includes(stored) ? stored : initial
  })
  return [
    value,
    (next) => {
      setValue(next)
      localStorage.setItem(key, next)
    }
  ]
}
