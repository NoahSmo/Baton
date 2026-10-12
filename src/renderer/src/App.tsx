import { useEffect, useState } from 'react'
import { DICTS, langFromLocale, type Lang } from '../../shared/i18n'
import type { Feature, LinearIssue, LinearStatus, Project, StoredEvent } from '../../shared/types'
import { ConfirmHost } from './ConfirmHost'
import { ContextMenuHost } from './ContextMenuHost'
import { FeatureView } from './FeatureView'
import { LangContext } from './i18n'
import { LinearDialog } from './LinearDialog'
import { LinearView } from './LinearView'
import { NewFeatureDialog } from './NewFeatureDialog'
import { ProjectDialog } from './ProjectDialog'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { TopBar } from './TopBar'

type Dialog =
  | { kind: 'feature'; project?: Project; issue?: LinearIssue }
  | { kind: 'project'; project?: Project } | { kind: 'linear' } | null

export function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  /** Each project tab remembers the feature it was showing. */
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [events, setEvents] = useState<Record<string, StoredEvent[]>>({})
  const [streams, setStreams] = useState<Record<string, string>>({})
  const [linear, setLinear] = useState<LinearStatus>({ connected: false })
  const [dialog, setDialog] = useState<Dialog>(null)
  /** The Linear tab is showing instead of a project. */
  const [showLinear, setShowLinear] = useState(false)

  function goToProject(id: string) {
    setShowLinear(false)
    setActiveProjectId(id)
  }
  // System language until the stored choice arrives from the main process.
  const [lang, setLang] = useState<Lang>(() => langFromLocale(navigator.language))
  const t = DICTS[lang]

  useEffect(() => {
    void window.api.getLanguage().then(setLang)
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
      window.api.onStream((id, text) => setStreams((s) => ({ ...s, [id]: text })))
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
        linearActive={showLinear}
        onSelectLinear={() => setShowLinear(true)}
        onSelect={goToProject}
        onNew={() => setDialog({ kind: 'project' })}
        onMenuAction={(target, action) => {
          goToProject(target.id)
          if (action === 'new-feature') setDialog({ kind: 'feature' })
          if (action === 'project-settings') setDialog({ kind: 'project', project: target })
        }}
      />

      {showLinear ? (
        <LinearView
          linear={linear}
          projects={projects}
          features={features}
          onConnect={() => setDialog({ kind: 'linear' })}
          onStart={(target, issue) => setDialog({ kind: 'feature', project: target, issue })}
          onOpenFeature={showFeature}
          onProjectChanged={upsertProject}
        />
      ) : project ? (
        <>
          <Sidebar
            project={project}
            features={projectFeatures}
            selectedId={feature?.id ?? null}
            onSelect={showFeature}
            onNew={() => setDialog({ kind: 'feature' })}
            onEditProject={() => setDialog({ kind: 'project', project })}
          />
          <main className="main">
            {feature ? (
              <FeatureView
                key={feature.id}
                feature={feature}
                project={project}
                events={events[feature.id] ?? []}
                stream={streams[feature.id] ?? ''}
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
          </main>
        </>
      ) : (
        <main className="main wide">
          <div className="empty">
            <h1>{t.empty.firstProjectTitle}</h1>
            <p>{t.empty.firstProjectBody}</p>
            <button className="primary" onClick={() => setDialog({ kind: 'project' })}>
              {t.topbar.newProject}
            </button>
          </div>
        </main>
      )}

      <StatusBar
        features={features}
        linear={linear}
        onOpenLinear={() => setDialog({ kind: 'linear' })}
        onLanguage={changeLanguage}
      />

      {dialog?.kind === 'feature' && (dialog.project ?? project) && (
        <NewFeatureDialog
          project={(dialog.project ?? project)!}
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
      {dialog?.kind === 'linear' && <LinearDialog status={linear} onChange={setLinear} onClose={() => setDialog(null)} />}
      <ContextMenuHost />
      <ConfirmHost />
    </div>
    </LangContext.Provider>
  )
}
