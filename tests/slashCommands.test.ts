import { describe, expect, it } from 'vitest'
import { BUILTIN_COMMANDS, commandQuery, matchCommands, mergeCommands, modelFromArgument, parseSlashCommand } from '../src/shared/slashCommands'

describe('parseSlashCommand', () => {
  it('splits the name from its arguments', () => {
    expect(parseSlashCommand('/compact')).toEqual({ name: 'compact', args: '' })
    expect(parseSlashCommand('  /compact keep the API\nnotes ')).toEqual({ name: 'compact', args: 'keep the API\nnotes' })
    expect(parseSlashCommand('/plugin:skill a')).toEqual({ name: 'plugin:skill', args: 'a' })
  })

  it('ignores text that is not a command', () => {
    expect(parseSlashCommand('fix /compact')).toBeNull()
    expect(parseSlashCommand('/ nothing')).toBeNull()
    expect(parseSlashCommand('/usr/bin/env')).toBeNull()
  })
})

describe('commandQuery', () => {
  it('is set only while the command name is being typed', () => {
    expect(commandQuery('/')).toBe('')
    expect(commandQuery('/co')).toBe('co')
    expect(commandQuery('/compact now')).toBeNull()
    expect(commandQuery('hello /co')).toBeNull()
  })
})

describe('matchCommands', () => {
  const list = [
    { name: 'compact', description: '' },
    { name: 'context', description: '' },
    { name: 'recompute', description: '' },
    { name: 'compact', description: 'duplicate' }
  ]
  it('puts prefixes first, then other hits, without duplicates', () => {
    expect(matchCommands(list, 'co').map((c) => c.name)).toEqual(['compact', 'context', 'recompute'])
    expect(matchCommands(list, 'comp').map((c) => c.name)).toEqual(['compact', 'recompute'])
    expect(matchCommands(list, 'zzz')).toEqual([])
  })
})

describe('mergeCommands', () => {
  it('falls back to the built-in commands', () => {
    expect(mergeCommands(null)).toBe(BUILTIN_COMMANDS)
    expect(mergeCommands([])).toBe(BUILTIN_COMMANDS)
  })
  it('adds the built-in commands the session did not list', () => {
    const merged = mergeCommands([{ name: 'compact', description: 'x' }, { name: 'deploy', description: 'y' }])
    expect(merged.filter((c) => c.name === 'compact')).toHaveLength(1)
    expect(merged.map((c) => c.name)).toContain('model')
    expect(merged[1].name).toBe('deploy')
  })
})

describe('modelFromArgument', () => {
  it('understands aliases, ids and short names', () => {
    expect(modelFromArgument('opus')).toBe('opus')
    expect(modelFromArgument(' Sonnet[1m] ')).toBe('sonnet[1m]')
    expect(modelFromArgument('claude-opus-5-5')).toBe('claude-opus-5-5')
    expect(modelFromArgument('haiku-5.5')).toBe('claude-haiku-5-5')
    expect(modelFromArgument('fable')).toBe('claude-fable-5-2')
  })
  it('refuses what it does not know', () => {
    expect(modelFromArgument('')).toBeNull()
    expect(modelFromArgument('gpt')).toBeNull()
  })
})
