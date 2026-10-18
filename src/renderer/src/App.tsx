import { useEffect, useState } from 'react'
import { DICTS, langFromLocale, type Lang } from '../../shared/i18n'
import type { BackgroundTask, Feature, LinearIssue, LinearStatus, Project, StoredEvent, UpdateInfo } from '../../shared/types'
import { ConfirmHost } from './ConfirmHost'
import { ContextMenuHost } from './ContextMenuHost'
import { EditorPane, type EditorPanel } from './EditorPane'
import { FeatureView } from './FeatureView'
import { LaunchDialog } from './LaunchDialog'
import { LangContext } from './i18n'
import { LinearDialog } from './LinearDialog'
import { LinearView } from './LinearView'
import { NewFeatureDialog } from './NewFeatureDialog'
import { ProjectDialog } from './ProjectDialog'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { TerminalPanel } from './TerminalPanel'
import { TopBar } from './TopBar'
import { SettingsDialog } from './SettingsDialog'
import { UpdateDialog } from './UpdateDialog'
import { useGitStatus } from './useGitStatus'
import { useResize } from './useResize'

/** Stable empty list, so features without background work do not re-render on every update. */
const NO_TASKS: BackgroundTask[] = []
const SIDEBAR_WIDTH = 300
/** Room the conversation keeps when the editor is dragged wide. */
const MIN_CHAT_WIDTH = 340

type Dialog =
  | { kind: 'feature'; project?: Project; issue?: LinearIssue; repositories?: Project[] }
  | { kind: 'update' }
  | { kind: 'settings' }
  | { kind: 'launch'; project: Project }
  | { kind: 'project'; project?: Project } | { kind: 'linear' } | null

export function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  /** Each project tab remembers the feature it was showing. */
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [events, setEvents] = useState<Record<string, StoredEvent[]>>({})
  const [background, setBackground] = useState<Record<string, BackgroundTask[]>>({})
  const [streams, setStreams] = useState<Record<string, string>>({})
  const [linear, setLinear] = useState<LinearStatus>({ connected: false })
  const [dialog, setDialog] = useState<Dialog>(null)
  /** The Linear tab is showing instead of a project. */
  const [showLinear, setShowLinear] = useState(false)
  /** Features whose editor was opened; false once hidden again, which keeps its open files. */
  const [editors, setEditors] = useState<Record<string, boolean>>({})
  const [editorPanel, setEditorPanel] = useState<EditorPanel>('files')
  /** Whether each agent's terminal panel is up, keyed by feature, or by project when it has none. */
  const [terminalPanels, setTerminalPanels] = useState<Record<string, boolean>>({})
  /** Agent being linked to an issue. */
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [editorWidth, startEditorResize] = useResize({
    key: 'editor-width',
    initial: 520,
    min: 360,
    max: () => window.innerWidth - SIDEBAR_WIDTH - MIN_CHAT_WIDTH,
    edge: 'left'
  })
  const [terminalHeight, startTerminalResize] = useResize({
    key: 'terminal-height',
    initial: 260,
    min: 120,
    max: () => window.innerHeight - 260,
    edge: 'top'
  })

  const linearShown = showLinear && linear.connected

  function goToProject(id: string) {
    setShowLinear(false)
    setActiveProjectId(id)
  }
  // System language until the stored choice arrives from the main process.
  const [lang, setLang] = useState<Lang>(() => langFromLocale(navigator.language))
  const t = DICTS[lang]

  const [version, setVersion] = useState('')
  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    void window.api.getLanguage().then(setLang)
    void window.api.getVersion().then(setVersion)
    void window.api.getUpdate().then(setUpdate)
    return window.api.onUpdate((next) => {
      setUpdate(next)
      // Ask on our own, unless the user declined this version or is in the middle of something else.
      if (!next.dismissed) setDialog((open) => open ?? { kind: 'update' })
    })
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  function changeLanguage(next: Lang) {
    setLang(next)
    void window.api.setLanguage(next)
  }

  useEffect(() => {
    void window.api.linearStatus().then(setLinear)
    void window.api.getState().then((s) => {
      setProjects(s.projects)
      setFeatures(s.features)
      setActiveProjectId((cur) => cur ?? s.projects[0]?.id ?? null)
    })
    const offs = [
      window.api.onFeature((f) =>
        setFeatures((list) => (list.some((x) => x.id === f.id) ? list.map((x) => (x.id === f.id ? f : x)) : [f, ...list]))
      ),
      window.api.onFeatureRemoved((id) => setFeatures((list) => list.filter((f) => f.id !== id))),
      window.api.onProjectRemoved((id) => {
        setProjects((list) => {
          const rest = list.filter((p) => p.id !== id)
          setActiveProjectId((cur) => (cur === id ? (rest[0]?.id ?? null) : cur))
          return rest
        })
      }),
      window.api.onEvent((ev) =>
        setEvents((all) => {
          const list = all[ev.featureId]
          // Not loaded yet: the full journal is fetched when the feature is opened.
          if (!list || list.some((e) => e.seq === ev.seq)) return all
          return { ...all, [ev.featureId]: [...list, ev] }
        })
      ),
      window.api.onStream((id, text) => setStreams((s) => ({ ...s, [id]: text }))),
      window.api.onBackgroundTasks((id, tasks) => setBackground((b) => ({ ...b, [id]: tasks })))
    ]
    return () => offs.forEach((off) => off())
  }, [])

  function showFeature(feature: Feature) {
    goToProject(feature.projectId)
    setSelected((all) => ({ ...all, [feature.projectId]: feature.id }))
  }

  // Clicking a notification brings its feature up, whichever tab it lives in.
  useEffect(
    () =>
      window.api.onFocusFeature((id) => {
        const feature = features.find((f) => f.id === id)
        if (feature) showFeature(feature)
      }),
    [features]
  )

  const project = projects.find((p) => p.id === activeProjectId) ?? null
  const projectFeatures = features.filter((f) => f.projectId === activeProjectId)
  const feature = projectFeatures.find((f) => f.id === selected[activeProjectId ?? '']) ?? projectFeatures[0] ?? null

  useEffect(() => {
    if (!feature || events[feature.id]) return
    const id = feature.id
    void window.api.getEvents(id).then((list) => setEvents((all) => ({ ...all, [id]: list })))
  }, [feature, events])

  const terminalKey = feature?.id ?? project?.id ?? ''
  const terminalOpen = Boolean(terminalPanels[terminalKey])
  const setTerminalOpen = (open: boolean | ((open: boolean) => boolean)) =>
    setTerminalPanels((all) => ({ ...all, [terminalKey]: typeof open === 'function' ? open(Boolean(all[terminalKey])) : open }))

  const git = useGitStatus(feature?.id ?? null)

  const toggleEditor = (id: string) => setEditors((all) => ({ ...all, [id]: !all[id] }))

  // Ctrl+` as in most editors. Captured, or a focused terminal would take the key.
  useEffect(() => {
    if (!project || linearShown) return
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.metaKey || e.altKey || e.code !== 'Backquote') return
      e.preventDefault()
      e.stopPropagation()
      setTerminalOpen((open) => !open)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [terminalKey, linearShown])

  function upsertProject(saved: Project) {
    setProjects((list) => (list.some((p) => p.id === saved.id) ? list.map((p) => (p.id === saved.id ? saved : p)) : [...list, saved]))
  }

  function onProjectSaved(saved: Project) {
    upsertProject(saved)
    goToProject(saved.id)
    setDialog(null)
  }

  return (
    <LangContext.Provider value={lang}>
    <div className="app">
      <TopBar
        projects={projects}
        features={features}
        activeId={activeProjectId}
        linearAvailable={linear.connected}
        linearActive={linearShown}
        onSelectLinear={() => setShowLinear(true)}
        onSelect={goToProject}
        onNew={() => setDialog({ kind: 'project' })}
        onOpenSettings={() => setDialog({ kind: 'settings' })}
        onMenuAction={(target, action) => {
          goToProject(target.id)
          if (action === 'new-feature') setDialog({ kind: 'feature' })
          if (action === 'project-settings') setDialog({ kind: 'project', project: target })
        }}
      />

      {linearShown && (
        <LinearView
          linear={linear}
          projects={projects}
          features={features}
          onConnect={() => setDialog({ kind: 'linear' })}
          onStart={(issue, repos) => {
            const repositories = repos.length ? repos : projects
            const target = repositories.find((p) => p.id === activeProjectId) ?? repositories[0]
            setDialog({ kind: 'feature', project: target, issue, repositories })
          }}
          onOpenFeature={showFeature}
        />
      )}
      {project ? (
        // Kept mounted behind the Linear tab: editors hold unsaved changes.
        <div className="project-view" hidden={linearShown}>
          <Sidebar
            project={project}
            features={projectFeatures}
            selectedId={feature?.id ?? null}
            onSelect={showFeature}
            onNew={() => setDialog({ kind: 'feature' })}
            onLink={(f) => {
              showFeature(f)
              setLinkingId(f.id)
            }}
            onEditProject={() => setDialog({ kind: 'project', project })}
            onEditCommands={() => setDialog({ kind: 'launch', project })}
            terminalOpen={terminalOpen}
            onShowTerminal={() => setTerminalOpen(true)}
            linearConnected={linear.connected}
          />
          <main className="main">
            <div className="workspace">
              {feature ? (
                <FeatureView
                  key={feature.id}
                  feature={feature}
                  project={project}
                  events={events[feature.id] ?? []}
                  stream={streams[feature.id] ?? ''}
                  background={background[feature.id] ?? NO_TASKS}
                  git={git}
                  editorOpen={Boolean(editors[feature.id])}
                  terminalOpen={terminalOpen}
                  onToggleEditor={() => toggleEditor(feature.id)}
                  onToggleTerminal={() => setTerminalOpen((open) => !open)}
                  onShowChanges={() => {
                    setEditors((all) => ({ ...all, [feature.id]: true }))
                    setEditorPanel('changes')
                  }}
                  linearConnected={linear.connected}
                  linking={linkingId === feature.id}
                  onLinking={(open) => setLinkingId(open ? feature.id : null)}
                />
              ) : (
                <div className="empty">
                  <h1>{t.empty.noFeatureTitle}</h1>
                  <p>{t.empty.noFeatureBody(project.name)}</p>
                  <button className="primary" onClick={() => setDialog({ kind: 'feature' })}>
                    {t.sidebar.newFeature}
                  </button>
                </div>
              )}
              {feature && editors[feature.id] && <div className="resizer vertical" onPointerDown={startEditorResize} />}
              {features
                .filter((f) => f.id in editors)
                .map((f) => (
                  <EditorPane
                    key={f.id}
                    feature={f}
                    visible={f.id === feature?.id && editors[f.id]}
                    width={editorWidth}
                    git={f.id === feature?.id ? git : null}
                    panel={editorPanel}
                    onPanel={setEditorPanel}
                  />
                ))}
            </div>
            {terminalOpen && (
              <>
                <div className="resizer horizontal" onPointerDown={startTerminalResize} />
                <TerminalPanel
                  key={feature?.id ?? project.id}
                  project={project}
                  feature={feature}
                  height={terminalHeight}
                  onHide={() => setTerminalOpen(false)}
                />
              </>
            )}
          </main>
        </div>
      ) : (
        !linearShown && (
        <main className="main wide">
          <div className="empty">
            <h1>{t.empty.firstProjectTitle}</h1>
            <p>{t.empty.firstProjectBody}</p>
            <button className="primary" onClick={() => setDialog({ kind: 'project' })}>
              {t.topbar.newProject}
            </button>
          </div>
        </main>
        )
      )}

      <StatusBar
        features={features}
        linear={linear}
        onOpenLinear={() => setDialog({ kind: 'linear' })}
        version={version}
        update={update}
        onOpenUpdate={() => setDialog({ kind: 'update' })}
        terminal={
          project && !linearShown ? { open: terminalOpen, toggle: () => setTerminalOpen((open) => !open) } : undefined
        }
      />

      {dialog?.kind === 'feature' && (dialog.project ?? project) && (
        <NewFeatureDialog
          project={(dialog.project ?? project)!}
          repositories={dialog.repositories}
          linearConnected={linear.connected}
          initialIssue={dialog.issue}
          onClose={() => setDialog(null)}
          onCreated={(f) => {
            setDialog(null)
            showFeature(f)
          }}
        />
      )}
      {dialog?.kind === 'project' && (
        <ProjectDialog
          project={dialog.project}
          linear={linear}
          onClose={() => setDialog(null)}
          onSaved={onProjectSaved}
          onExisting={(id) => {
            goToProject(id)
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'launch' && (
        <LaunchDialog
          project={dialog.project}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            upsertProject(saved)
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'linear' && <LinearDialog status={linear} onChange={setLinear} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'settings' && (
        <SettingsDialog version={version} onLanguage={changeLanguage} onUpdateFound={() => setDialog({ kind: 'update' })} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'update' && update && (
        <UpdateDialog update={update} currentVersion={version} onClose={() => setDialog(null)} />
      )}
      <ContextMenuHost />
      <ConfirmHost />
    </div>
    </LangContext.Provider>
  )
}
