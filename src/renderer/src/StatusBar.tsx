import { LANGS, type Lang } from '../../shared/i18n'
import type { Feature, LinearStatus } from '../../shared/types'
import { useLang, useT } from './i18n'

interface Props {
  features: Feature[]
  linear: LinearStatus
  onOpenLinear(): void
  onLanguage(lang: Lang): void
}

export function StatusBar({ features, linear, onOpenLinear, onLanguage }: Props) {
  const t = useT()
  const lang = useLang()
  const count = (...statuses: Feature['status'][]) => features.filter((f) => statuses.includes(f.status)).length
  const cost = features.reduce((sum, f) => sum + f.costUsd, 0)

  return (
    <footer className="statusbar">
      <span>
        <span className="dot working still" /> {t.statusbar.working(count('working'))}
      </span>
      <span>
        <span className="dot waiting" /> {t.statusbar.waiting(count('waiting'))}
      </span>
      <span>
        <span className="dot done" /> {t.statusbar.done(count('done'))}
      </span>
      {count('error', 'limited') > 0 && (
        <span>
          <span className="dot error" /> {t.statusbar.stopped(count('error', 'limited'))}
        </span>
      )}
      <span className="statusbar-sep" />
      <span>
        {t.statusbar.total} <span className="num strong">${cost.toFixed(2)}</span>
      </span>
      <button className="statusbar-linear" onClick={onOpenLinear}>
        <span className={`dot ${linear.connected ? 'done' : ''}`} />
        {linear.connected ? `Linear · ${linear.userName ?? t.statusbar.linearConnected}` : t.statusbar.connectLinear}
      </button>
      <span className="lang-switch" role="group" aria-label={t.statusbar.language}>
        {LANGS.map((l) => (
          <button key={l} className={l === lang ? 'selected' : ''} aria-pressed={l === lang} onClick={() => onLanguage(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </span>
    </footer>
  )
}
