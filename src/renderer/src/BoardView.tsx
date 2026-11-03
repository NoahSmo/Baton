import type { Feature, Project } from '../../shared/types'
import { AgentBoard } from './AgentBoard'
import { useT } from './i18n'
import { LinearView } from './LinearView'
import { usePersisted } from './usePersisted'

export type BoardKind = 'agents' | 'linear'
const BOARD_KINDS: BoardKind[] = ['agents', 'linear']

type LinearProps = Parameters<typeof LinearView>[0]

interface Props extends LinearProps {
  /** Agents of the project on screen. */
  projectFeatures: Feature[]
  selectedId: string | null
  project: Project
}

/** The Kanban tab: a board of the project's agents, or of its Linear issues. */
export function BoardView({ projectFeatures, selectedId, project, ...linearProps }: Props) {
  const t = useT()
  const [kind, setKind] = usePersisted<BoardKind>('board-kind', 'agents', BOARD_KINDS)
  return (
    <section className="board">
      <header className="board-head">
        <h1>{project.name}</h1>
        <div className="filters" role="group">
          {BOARD_KINDS.map((k) => (
            <button key={k} className={`filter${kind === k ? ' selected' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {t.board.kinds[k]}
            </button>
          ))}
        </div>
      </header>
      {kind === 'agents' ? (
        <AgentBoard features={projectFeatures} selectedId={selectedId} onOpen={linearProps.onOpenFeature} />
      ) : (
        <LinearView {...linearProps} />
      )}
    </section>
  )
}
