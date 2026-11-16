import { useT } from './i18n'
import { Icon } from './ui/Icon'

/** The corner button that dismisses a dialog, for whoever looks for it before looking for Cancel. */
export function DialogClose({ onClose, disabled }: { onClose(): void; disabled?: boolean }) {
  const t = useT()
  return (
    <button type="button" className="dialog-close" aria-label={t.update.close} title={t.update.close} disabled={disabled} onClick={onClose}>
      <Icon name="close" size={14} />
    </button>
  )
}
