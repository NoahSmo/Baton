import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { spawn, type IPty } from 'node-pty'
import type { LaunchCommand, TerminalInfo } from '../shared/types'

export interface TerminalSink {
  data(id: string, data: string): void
  exit(id: string): void
}

/**
 * node-pty starts shells through a helper binary that ships without its
 * executable bit when npm install scripts are skipped.
 */
function ensureSpawnHelper(): void {
  if (process.platform === 'win32') return
  try {
    const root = dirname(createRequire(import.meta.url).resolve('node-pty/package.json'))
    for (const dir of ['build/Release', `prebuilds/${process.platform}-${process.arch}`]) {
      const helper = join(root, dir, 'spawn-helper')
      if (existsSync(helper)) chmodSync(helper, 0o755)
    }
  } catch {
    // Spawning reports the actual problem.
  }
}

function shellCommand(): { file: string; args: string[] } {
  if (process.platform === 'win32') return { file: process.env.COMSPEC || 'powershell.exe', args: [] }
  // A login shell, so the user's profile sets up PATH, aliases and prompt as in their own terminal.
  return { file: process.env.SHELL || '/bin/zsh', args: ['-l'] }
}

/** The app's environment, minus what `npm run dev` adds to it: version managers choke on those. */
function shellEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('npm_')))
}

/** The shells behind the terminal panel, one pseudo-terminal each. */
export class Terminals {
  private ptys = new Map<string, { info: TerminalInfo; pty: IPty }>()
  private helperChecked = false

  constructor(private readonly sink: TerminalSink) {}

  /** Starts a shell where `target` says; `launch` is typed into it once it is up, and stays in its history. */
  open(target: Pick<TerminalInfo, 'projectId' | 'featureId' | 'cwd'>, launch?: LaunchCommand): TerminalInfo {
    if (!this.helperChecked) {
      ensureSpawnHelper()
      this.helperChecked = true
    }
    const { file, args } = shellCommand()
    const info: TerminalInfo = {
      id: randomUUID(),
      ...target,
      shell: basename(file).replace(/\.exe$/i, ''),
      command: launch ? launch.name || launch.command : null,
      commandId: launch?.id ?? null
    }
    const pty = spawn(file, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      // A worktree can vanish while its feature is still listed.
      cwd: existsSync(info.cwd) ? info.cwd : homedir(),
      env: {
        ...shellEnv(),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        // An app opened from Finder has no locale, which breaks accented characters.
        LANG: process.env.LANG || 'en_US.UTF-8'
      }
    })
    this.ptys.set(info.id, { info, pty })
    pty.onData((data) => this.sink.data(info.id, data))
    if (launch) {
      // Typed once the shell has spoken, so the command lands on its prompt rather than above it.
      const ready = pty.onData(() => {
        ready.dispose()
        pty.write(`${launch.command}\r`)
      })
    }
    pty.onExit(() => {
      if (this.ptys.delete(info.id)) this.sink.exit(info.id)
    })
    return info
  }

  write(id: string, data: string): void {
    this.ptys.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    if (cols > 0 && rows > 0) this.ptys.get(id)?.pty.resize(Math.floor(cols), Math.floor(rows))
  }

  close(id: string): void {
    const entry = this.ptys.get(id)
    if (!entry) return
    this.ptys.delete(id)
    entry.pty.kill()
    this.sink.exit(id)
  }

  /** Closes the terminals matching a predicate, e.g. those of a feature being deleted. */
  closeWhere(match: (info: TerminalInfo) => boolean): void {
    for (const { info } of [...this.ptys.values()]) if (match(info)) this.close(info.id)
  }

  closeAll(): void {
    this.closeWhere(() => true)
  }
}
