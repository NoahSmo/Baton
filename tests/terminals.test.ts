import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Terminals } from '../src/main/terminals'

describe('Terminals', () => {
  const shell = process.env.SHELL
  let terminals: Terminals
  let output = ''
  let onOutput = () => {}

  beforeEach(() => {
    // A plain shell: the profile of whoever runs the tests stays out of them.
    process.env.SHELL = '/bin/sh'
    output = ''
    terminals = new Terminals({
      data: (_id, data) => {
        output += data
        onOutput()
      },
      exit: () => {}
    })
  })

  afterEach(() => {
    terminals.closeAll()
    process.env.SHELL = shell
  })

  const target = { projectId: 'p', featureId: null, cwd: tmpdir() }

  it('names a terminal after its shell', () => {
    expect(terminals.open(target)).toMatchObject({ shell: 'sh', command: null, commandId: null })
  })

  it.skipIf(process.platform === 'win32')('runs a launch command in the shell it starts', async () => {
    const info = terminals.open(target, { id: 'c', name: 'Sum', command: 'echo baton-$((40+2))' })
    expect(info).toMatchObject({ command: 'Sum', commandId: 'c' })
    await new Promise<void>((resolve) => {
      onOutput = () => output.includes('baton-42') && resolve()
    })
  })

  it('falls back on the command when it has no name', () => {
    expect(terminals.open(target, { id: 'c', name: '', command: 'true' }).command).toBe('true')
  })
})
