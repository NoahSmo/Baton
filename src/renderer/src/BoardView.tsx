import type { Project } from '../../shared/types'
import { useT } from './i18n'
import { LinearView } from './LinearView'

type LinearProps = Parameters<typeof LinearView>[0]

interface Props extends LinearProps {
  project: Project
  /** Leave the board and go back to the agents. */
  onClose(): void
}

/** The Kanban tab: the project's Linear issues as a board, over the whole window. */
export function BoardView({ project, onClose, ...linearProps }: Props) {
  const t = useT()
  return (
    <section className="board">
      <header className="board-head">
        <h1>{project.name}</h1>
        <button className="board-close" onClick={onClose}>
          {t.board.close}
        </button>
      </header>
      <LinearView {...linearProps} />
    </section>
  )
}
