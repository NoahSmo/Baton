import { useT } from './i18n'
import type { SlashCommandInfo } from '../../shared/slashCommands'

interface Props {
  commands: SlashCommandInfo[]
  selected: number
  onPick(command: SlashCommandInfo): void
}

/** Claude Code commands matching what is typed after "/", above the message box. */
export function CommandMenu({ commands, selected, onPick }: Props) {
  const t = useT()
  return (
    <div className="command-menu" role="listbox" aria-label={t.commands.label}>
      {commands.map((c, i) => (
        <button
          key={c.name}
          type="button"
          role="option"
          aria-selected={i === selected}
          className={`command-item${i === selected ? ' selected' : ''}`}
          // Keeps the focus in the message box.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(c)}
        >
          <span className="command-name">/{c.name}</span>
          {c.argumentHint && <span className="command-arg">{c.argumentHint}</span>}
          <span className="command-desc">{c.description}</span>
        </button>
      ))}
    </div>
  )
}
