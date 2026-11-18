import { AGENT_EFFORTS, AGENT_MODELS, PERMISSION_MODES, type AgentEffort, type AgentModel, type PermissionMode } from './types'

/** Settings a new agent starts with, picked in one click. */
export interface AgentPreset {
  id: string
  name: string
  model: AgentModel
  effort: AgentEffort | null
  permissionMode: PermissionMode
}

/** Ready-made presets; their names come from the dictionary under `presets.builtin`. */
export const BUILTIN_PRESETS: (AgentPreset & { id: BuiltinPresetId })[] = [
  { id: 'quick', name: '', model: 'haiku', effort: 'low', permissionMode: 'acceptEdits' },
  { id: 'balanced', name: '', model: 'sonnet', effort: null, permissionMode: 'default' },
  { id: 'deep', name: '', model: 'opus', effort: 'high', permissionMode: 'plan' },
  { id: 'autonomous', name: '', model: 'sonnet', effort: 'medium', permissionMode: 'bypassPermissions' }
]

export type BuiltinPresetId = 'quick' | 'balanced' | 'deep' | 'autonomous'

/** Whether a preset sets exactly these settings. */
export function presetMatches(preset: AgentPreset, model: AgentModel, effort: AgentEffort | null, mode: PermissionMode): boolean {
  return preset.model === model && preset.effort === effort && preset.permissionMode === mode
}

/** Presets read back from storage; entries this version does not understand are dropped. */
export function parsePresets(raw: string | null): AgentPreset[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  return data.flatMap((p): AgentPreset[] => {
    if (!p || typeof p !== 'object') return []
    const { id, name, model, effort, permissionMode } = p as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || !name.trim()) return []
    if (!AGENT_MODELS.includes(model as AgentModel)) return []
    if (effort !== null && !AGENT_EFFORTS.includes(effort as AgentEffort)) return []
    if (!PERMISSION_MODES.includes(permissionMode as PermissionMode)) return []
    return [{ id, name: name.trim(), model: model as AgentModel, effort: effort as AgentEffort | null, permissionMode: permissionMode as PermissionMode }]
  })
}
