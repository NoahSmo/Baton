import { agentColumns } from '../../shared/kanban'
import type { Feature } from '../../shared/types'
import { useT } from './i18n'

interface Props {
  features: Feature[]
  selectedId: string | null
  onOpen(feature: Feature): void
}

/** "claude-opus-5-5" reads better as "opus-5-5" on a card. */
function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

/** The project's agents as columns by what they are doing; a card opens its conversation. */
export function AgentBoard({ features, selectedId, onOpen }: Props) {
  const t = useT()
  return (
    <div className="kanban">
      {agentColumns(features).map((col) => (
        <section key={col.key} className="kanban-column">
          <header className="kanban-column-head">
            <span className={`dot ${col.key === 'running' ? 'working' : col.key === 'stopped' ? 'error' : col.key} still`} />
            <span className="kanban-column-name">{t.board.columns[col.key]}</span>
            <span className="num kanban-column-count">{col.features.length}</span>
          </header>
          <div className="kanban-cards">
            {col.features.map((f) => (
              <button key={f.id} className={`kanban-card${f.id === selectedId ? ' selected' : ''}`} onClick={() => onOpen(f)}>
                <span className="kanban-card-title">{f.title}</span>
                <span className="kanban-card-foot">
                  {f.linear && <span className="feature-row-issue">{f.linear.identifier}</span>}
                  {f.model && <span>{shortModel(f.model)}</span>}
                  <span className="num">${f.costUsd.toFixed(2)}</span>
                </span>
              </button>
            ))}
            {!col.features.length && <p className="kanban-empty">{t.board.empty}</p>}
          </div>
        </section>
      ))}
    </div>
  )
}
