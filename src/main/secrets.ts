import { safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

/** A single secret kept on disk, encrypted with the OS keychain. */
export class SecretFile {
  private cached: string | null | undefined

  constructor(private readonly file: string) {}

  get(): string | null {
    if (this.cached !== undefined) return this.cached
    try {
      this.cached = existsSync(this.file) ? safeStorage.decryptString(readFileSync(this.file)) : null
    } catch {
      // Unreadable with the current keychain: treat as absent so the user can reconnect.
      this.cached = null
    }
    return this.cached
  }

  set(value: string): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('The system keychain is not available.')
    writeFileSync(this.file, safeStorage.encryptString(value), { mode: 0o600 })
    this.cached = value
  }

  clear(): void {
    rmSync(this.file, { force: true })
    this.cached = null
  }
}
