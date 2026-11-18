import { useState } from 'react'
import { BUILTIN_PRESETS, parsePresets, presetMatches, type AgentPreset } from '../../shared/presets'
import type { AgentEffort, AgentModel, PermissionMode } from '../../shared/types'
import { useT } from './i18n'
import { Icon } from './ui/Icon'

const KEY = 'baton.agentPresets'

interface Props {
  model: AgentModel
  effort: AgentEffort | null
  mode: PermissionMode
  onPick(preset: AgentPreset): void
}

/** Chips setting the model, effort and permissions of a new agent at once, built-in ones and the user's own. */
export function PresetPicker({ model, effort, mode, onPick }: Props) {
  const t = useT()
  const [custom, setCustom] = useState(() => parsePresets(localStorage.getItem(KEY)))
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const builtin = BUILTIN_PRESETS.map((p) => ({ ...p, name: t.presets.builtin[p.id].name, hint: t.presets.builtin[p.id].hint }))
  const all = [...builtin, ...custom.map((p) => ({ ...p, hint: '' }))]
  const current = all.some((p) => presetMatches(p, model, effort, mode))

  function store(next: AgentPreset[]) {
    setCustom(next)
    localStorage.setItem(KEY, JSON.stringify(next))
  }

  function save() {
    const trimmed = name.trim()
    if (trimmed) store([...custom, { id: crypto.randomUUID(), name: trimmed, model, effort, permissionMode: mode }])
    setNaming(false)
    setName('')
  }

  return (
    <div className="template-chips preset-chips" role="group" aria-label={t.presets.label}>
      {all.map((p) => {
        const selected = presetMatches(p, model, effort, mode)
        const isCustom = custom.some((c) => c.id === p.id)
        return (
          <span key={p.id} className="preset-chip">
            <button type="button" className={`filter${selected ? ' selected' : ''}`} aria-pressed={selected} title={p.hint} onClick={() => onPick(p)}>
              {p.name}
            </button>
            {isCustom && (
              <button
                type="button"
                className="icon preset-remove"
                title={t.presets.remove}
                aria-label={`${t.presets.remove}: ${p.name}`}
                onClick={() => store(custom.filter((c) => c.id !== p.id))}
              >
                <Icon name="close" size={10} />
              </button>
            )}
          </span>
        )
      })}
      {naming ? (
        <input
          className="preset-name"
          autoFocus
          value={name}
          placeholder={t.presets.savePrompt}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              save()
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              setName('')
              setNaming(false)
            }
          }}
        />
      ) : (
        !current && (
          <button type="button" className="filter" onClick={() => setNaming(true)}>
            <Icon name="plus" size={12} /> {t.presets.save}
          </button>
        )
      )}
    </div>
  )
}
