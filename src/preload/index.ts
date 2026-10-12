import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api } from '../shared/types'

function subscribe<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: Api = {
  getState: () => ipcRenderer.invoke('state:get'),
  pickProjectFolder: () => ipcRenderer.invoke('project:pickFolder'),
  createProject: (input) => ipcRenderer.invoke('project:create', input),
  updateProject: (id, patch) => ipcRenderer.invoke('project:update', id, patch),
  createFeature: (input) => ipcRenderer.invoke('feature:create', input),
  getEvents: (id) => ipcRenderer.invoke('feature:events', id),
  send: (id, text) => ipcRenderer.invoke('feature:send', id, text),
  respondPermission: (id, requestId, decision) => ipcRenderer.invoke('feature:respond', id, requestId, decision),
  interrupt: (id) => ipcRenderer.invoke('feature:interrupt', id),
  removeFeature: (id) => ipcRenderer.invoke('feature:remove', id),
  reveal: (id) => ipcRenderer.invoke('feature:reveal', id),
  renameFeature: (id, title) => ipcRenderer.invoke('feature:rename', id, title),
  menuOpen: (spec) => ipcRenderer.invoke('menu:open', spec),
  menuRun: (menuId, itemId) => ipcRenderer.invoke('menu:run', menuId, itemId),
  onMenuShow: (cb) => subscribe('menu:show', cb),
  onConfirm: (cb) => subscribe('confirm:show', cb),
  answerConfirm: (id, confirmed) => ipcRenderer.invoke('confirm:answer', id, confirmed),
  onProjectRemoved: (cb) => subscribe('project:removed', cb),
  getLanguage: () => ipcRenderer.invoke('language:get'),
  setLanguage: (lang) => ipcRenderer.invoke('language:set', lang),
  linearStatus: () => ipcRenderer.invoke('linear:status'),
  linearConnect: (apiKey) => ipcRenderer.invoke('linear:connect', apiKey),
  linearDisconnect: () => ipcRenderer.invoke('linear:disconnect'),
  linearProjects: () => ipcRenderer.invoke('linear:projects'),
  linearTeamStates: (teamId) => ipcRenderer.invoke('linear:teamStates', teamId),
  linearSetIssueState: (issueId, stateId) => ipcRenderer.invoke('linear:setIssueState', issueId, stateId),
  linearIssues: (linearProjectId) => ipcRenderer.invoke('linear:issues', linearProjectId),
  onEvent: (cb) => subscribe('event', cb),
  onFeature: (cb) => subscribe('feature', cb),
  onFeatureRemoved: (cb) => subscribe('feature:removed', cb),
  onStream: (cb) => subscribe('stream', cb),
  onFocusFeature: (cb) => subscribe('feature:focus', cb)
}

contextBridge.exposeInMainWorld('api', api)
