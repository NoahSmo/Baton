import { LinearView } from './LinearView'

type Props = Parameters<typeof LinearView>[0]

/** The Kanban tab: the Linear issues as a board, in place of the conversation. */
export function BoardView(props: Props) {
  return (
    <section className="board">
      <LinearView {...props} />
    </section>
  )
}
