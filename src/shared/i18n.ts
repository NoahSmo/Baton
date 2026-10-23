import type { SidebarSort } from './features'
import type { AgentModel, FeatureStatus, GitChangeKind, PermissionMode } from './types'

export type Lang = 'en' | 'fr'

export const LANGS: Lang[] = ['en', 'fr']

/** Picks the app language matching a system locale such as "fr-FR". */
export function langFromLocale(locale: string | undefined): Lang {
  return locale?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

/** Which usage window a rate-limit type belongs to; undefined for types we cannot place. */
export function limitWindow(type?: string): 'daily' | 'weekly' | undefined {
  if (type === 'five_hour') return 'daily'
  if (type?.startsWith('seven_day')) return 'weekly'
  return undefined
}

/** 152340 → "152k". */
export function kTokens(tokens: number): string {
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens)
}

const en = {
  status: {
    idle: 'Idle',
    working: 'Working',
    waiting: 'Needs answer',
    done: 'Done',
    error: 'Error',
    limited: 'Usage limit',
    queued: 'Queued'
  } as Record<FeatureStatus, string>,

  /** Notification body when a feature moves to a status worth looking at. */
  attention: {
    waiting: 'Needs your answer',
    done: 'Finished its turn',
    error: 'Stopped on an error',
    limited: 'Usage limit reached'
  } as Partial<Record<FeatureStatus, string>>,

  common: { cancel: 'Cancel', save: 'Save', delete: 'Delete' },

  topbar: { newProject: 'New project', waitingBadge: 'Agents waiting for an answer' },

  sidebar: {
    features: 'Agents',
    newFeature: 'New agent',
    filterByStatus: 'Filter by status',
    all: 'All',
    none: 'No agent yet.',
    project: 'Project',
    projectSettings: 'Project settings',
    linkLinear: 'Link a Linear label',
    launch: 'Launch',
    launchSettings: 'Configure the commands',
    launchAll: 'Launch all',
    launchReady: 'ready',
    launchRunning: 'running',
    noCommand: 'No command.',
    configure: 'Configure',
    runCommand: (command: string) => `Run “${command}” in a new terminal`,
    showCommand: (name: string) => `Show the terminal of “${name}”`,
    stopCommand: (name: string) => `Stop “${name}” and close its terminal`,
    terminals: 'Terminals',
    newTerminal: 'New terminal',
    search: 'Search agents…',
    searchLabel: 'Search agents',
    noMatch: 'No agent matches.',
    sortBy: 'Sort by',
    sort: { status: 'Status', activity: 'Recent activity', created: 'Creation date', cost: 'Cost', name: 'Name' } as Record<SidebarSort, string>,
    archived: (n: number) => `Archived · ${n}`,
    queueRank: (n: number) => `#${n} in line`,
    prompts: 'Prompts',
    promptsSettings: 'Edit the prompts',
    qa: 'Tests',
    qaOpen: 'Open the test reports',
    qaOff: 'No automatic tests.',
    qaCounts: (passed: number, failed: number, running: number) =>
      [running && `${running} running`, failed && `${failed} failed`, passed && `${passed} passed`].filter(Boolean).join(' · ') || 'no run yet'
  },

  launch: {
    title: 'Launch commands',
    hint: 'One click runs a command in a new terminal, in the worktree of the agent on screen.',
    name: 'Name',
    command: 'Command',
    namePlaceholder: 'Dev server',
    commandPlaceholder: 'npm run dev',
    add: 'Add a command',
    remove: 'Remove this command',
    autoTitle: 'Fill in automatically',
    autoBody:
      'Claude reads the project (manifests, scripts, docker-compose, README…) without changing anything and proposes the commands to launch. Review them before saving.',
    autoFill: 'Fill in automatically',
    autoRunning: 'Claude is reading the project…',
    autoStop: 'Stop',
    autoFailed: (reason: string) => `Claude could not read the project: ${reason}`,
    proposalNotice: 'Proposed by Claude: read each command in full. They replace those of the list.',
    proposalEmpty: 'Claude found no command to propose.',
    ignore: 'Ignore',
    replace: 'Replace the commands'
  },

  qa: {
    title: 'Automatic tests',
    hint: 'When an agent of this project is done, its tests run in its worktree and Claude sums the result up here.',
    enabled: 'Run the tests when an agent is done',
    command: 'Test command',
    commandPlaceholder: 'npm test',
    reports: 'Reports',
    none: 'No test run yet.',
    run: 'Run now',
    running: 'running…',
    passed: 'passed',
    failed: 'failed',
    error: 'not completed',
    recapPending: 'Claude is writing the recap…',
    output: 'Output',
    exit: (code: number | null) => (code === null ? 'stopped' : `exit ${code}`),
    needCommand: 'Set a test command first.',
    sendToAgent: 'Send the failure to the agent',
    sent: 'Sent to the agent',
    agentPrompt: (command: string, recap: string, output: string) =>
      `The automatic tests failed (\`${command}\`). Fix the code so they pass, then run them again.\n\n${recap ? `Recap:\n${recap}\n\n` : ''}Output:\n${output}`
  },

  statusbar: {
    working: (n: number) => `${n} working`,
    waiting: (n: number) => `${n} waiting`,
    done: (n: number) => `${n} done`,
    stopped: (n: number) => `${n} stopped`,
    queued: (n: number) => `${n} queued`,
    maxRunning: 'At once',
    maxRunningHint: 'Agents allowed to run at the same time; the others wait in line. ∞ for no limit.',
    usageNear: (time?: string, used?: number, type?: string) =>
      `${limitWindow(type) === 'weekly' ? 'Weekly' : limitWindow(type) === 'daily' ? 'Daily' : 'Usage'} limit near${used !== undefined ? ` (${Math.round(used * 100)}%)` : ''}${time ? ` · resets ${time}` : ''}`,
    total: 'Total',
    creditLeft: (kind: 'daily' | 'weekly' | undefined, left: number, time?: string) =>
      `${kind === 'weekly' ? 'Weekly' : kind === 'daily' ? 'Daily (5 h)' : 'Usage'} credit: ${left}% left${time ? ` · resets ${time}` : ''}`,
    connectLinear: 'Connect Linear',
    linearConnected: 'connected',
    language: 'Language',
    theme: 'Theme',
    nextWaiting: (n: number) => `Next waiting (${n})`,
    usage: 'Usage'
  },

  empty: {
    noFeatureTitle: 'No agent yet',
    noFeatureBody: (project: string) => `Each agent works on its own in ${project}.`,
    firstProjectTitle: 'Add your first project',
    firstProjectBody: 'A project is a folder, ideally a git repository. Its agents can each work in their own worktree.'
  },

  feature: {
    stop: 'Stop',
    stopHint: 'Stop the current message (Esc / Ctrl+C)',
    contextSize: 'Conversation size. Every request of the agent sends all of it again: past 100k, a new agent costs less.',
    openFolder: 'Open folder',
    linkIssue: 'Link to an issue',
    editor: 'Editor',
    terminal: 'Terminal',
    toggleTerminalHint: 'Show or hide the terminal panel (⌃`)',
    sendFirst: 'Send a first message to start the agent.',
    working: 'Working…',
    queuePlaceholder: 'Queue a message for the agent…',
    messagePlaceholder: 'Message the agent…',
    send: 'Send',
    attach: 'Attach files',
    attachHint: 'Attach images or documents — they can also be pasted or dropped here',
    removeAttachment: 'Remove',
    attachRejected: (names: string) => `Could not attach: ${names}`,
    attachmentMissing: 'image no longer available',
    plan: 'Plan',
    running: 'running',
    failed: 'failed',
    noResult: 'no result',
    noOutput: '(no output)',
    stopped: 'Stopped',
    turnFailed: 'Turn failed',
    turnFinished: 'Turn finished',
    backgroundRunning: (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'} still running in the background`,
    approveHint: 'Allow the first pending request',
    templates: 'Prompts'
  },

  editor: {
    files: 'Files',
    pickFile: 'Pick a file to edit it.',
    loading: 'Loading…',
    binary: 'This file is binary and cannot be edited here.',
    tooLarge: (megabytes: string) => `This file is too large to edit here (${megabytes} MB).`,
    unreadable: 'This file could not be read.',
    unsaved: 'Unsaved changes',
    save: 'Save',
    close: 'Close',
    changedOnDisk: 'This file changed on disk while you were editing it.',
    reload: 'Reload from disk'
  },

  git: {
    changes: 'Changes',
    history: 'History',
    uncommitted: (n: number) => `${n} uncommitted ${n === 1 ? 'file' : 'files'}`,
    filterCommits: 'Filter commits, authors, branches…',
    noMatch: 'No matching commit.',
    loadMore: 'Load older commits',
    byAgent: 'Agent',
    byAgentHint: (cost: string) => `Made during a turn of the agent (${cost})`,
    unpushedHint: 'Not pushed yet',
    incomingHint: 'On the remote, not pulled yet',
    mergeClean: (base: string) => `Merges cleanly into ${base}`,
    mergeConflicts: (n: number, base: string) => `${n} ${n === 1 ? 'conflict' : 'conflicts'} merging into ${base}`,
    commitFiles: (n: number) => `${n} changed ${n === 1 ? 'file' : 'files'}`,
    noCommitFiles: 'No file changed.',
    comparing: (hash: string) => `${hash} ↔ checked-out commit`,
    branchName: 'Name of the new branch',
    createBranch: 'Create branch',
    branchCreated: (name: string) => `Branch ${name} created`,
    closeDetail: 'Close',
    actionDone: 'Done',
    noHistory: 'No commit yet.',
    commit: 'Commit',
    commitTitle: 'Commit changes',
    commitHint: 'Only the checked files go into the commit.',
    commitMessage: 'Commit message',
    selectAll: 'Select all',
    selected: (n: number, total: number) => `${n}/${total} selected`,
    committing: 'Committing…',
    drafting: 'Claude is writing the message…',
    draft: 'Write with Claude',
    redraft: 'Write again',
    draftFailed: 'Could not write a message.',
    pull: 'Pull',
    pulling: 'Pulling…',
    push: 'Push',
    pushing: 'Pushing…',
    pullHint: (upstream: string) => `Fast-forward from ${upstream}`,
    pushHint: 'Push the commits to the remote',
    publishHint: 'Publish this branch on origin',
    checking: 'Checking for conflicts…',
    conflictTitle: 'Conflicts before push',
    conflictIntro: (target: string, n: number) =>
      `Merging ${target} would conflict in ${n} ${n === 1 ? 'file' : 'files'}. Claude resolves them; nothing is committed or pushed until you accept.`,
    resolving: 'Claude is resolving the conflicts…',
    recapIntro: (target: string) => `Recap of how ${target} was merged. Edit any file, then accept to commit the merge and push.`,
    needsYou: 'Still in conflict: finish this file by hand.',
    editFile: 'Edit',
    hideFile: 'Hide',
    resetFile: 'Reset to Claude’s version',
    acceptPush: 'Accept, commit and push',
    abortMerge: 'Abort merge',
    abortHint: 'Put the branch back as it was',
    markersLeft: 'Conflict markers remain in a file.',
    resolveFailed: 'The conflicts could not be resolved.',
    noChanges: 'No change since the last commit.',
    before: 'Last commit',
    after: 'Working copy',
    changed: (n: number) => `${n} changed ${n === 1 ? 'file' : 'files'}`,
    switchBranch: 'Switch branch',
    filterBranches: 'Filter branches…',
    noBranch: 'No matching branch.',
    loading: 'Loading branches…',
    remote: 'remote',
    heldBy: (owner: string) => `in ${owner}`,
    heldByHint: (owner: string) => `Checked out in ${owner}: a branch lives in one worktree at a time.`,
    sinceCommit: 'Since last commit',
    lastTurn: 'Last turn',
    lastTurnHint: 'What the agent changed since your last message',
    noTurnChanges: 'Nothing changed during the last turn.',
    noTurnSnapshot: 'No snapshot of the last turn yet: send a message first.',
    beforeTurn: 'Before the turn',
    detached: (head: string) => `detached at ${head}`,
    ahead: (n: number, upstream: string) => `${n} ${n === 1 ? 'commit' : 'commits'} to push to ${upstream}`,
    behind: (n: number, upstream: string) => `${n} ${n === 1 ? 'commit' : 'commits'} to pull from ${upstream}`,
    kind: {
      modified: 'Modified',
      added: 'Added',
      deleted: 'Deleted',
      renamed: 'Renamed',
      untracked: 'Untracked',
      conflicted: 'Conflict'
    } as Record<GitChangeKind, string>
  },

  terminal: {
    newInProject: (project: string) => `New terminal in ${project}`,
    newInWorktree: 'New terminal in the worktree of this agent',
    worktree: 'Worktree',
    close: 'Close terminal',
    hide: 'Hide panel',
    failed: (reason: string) => `The terminal could not start: ${reason}`
  },

  permission: {
    /** Wraps the tool name: "Allow <tool>?" */
    allowBefore: 'Allow ',
    allowAfter: '?',
    allow: 'Allow',
    always: 'Always allow',
    deny: 'Deny',
    question: 'Question',
    answered: 'answered',
    allowed: 'allowed',
    denied: 'denied',
    other: 'Other answer…',
    sendAnswer: 'Send answer',
    dismiss: 'Dismiss'
  },

  notice: {
    appClosed: 'The app was closed during this turn. Send a message to resume.',
    linearMoved: (identifier: string, state: string) => `Linear: ${identifier} moved to ${state}.`,
    linearFailed: (identifier: string, reason: string) => `Linear: could not update ${identifier} (${reason}).`,
    limitReached: (time?: string, type?: string) =>
      `${limitWindow(type) === 'weekly' ? 'Weekly' : limitWindow(type) === 'daily' ? 'Daily (5 h)' : 'Usage'} limit reached.${time ? ` Resets at ${time}.` : ''}`,
    limitNear: (time?: string, type?: string) =>
      `Approaching the ${limitWindow(type) === 'weekly' ? 'weekly' : limitWindow(type) === 'daily' ? 'daily (5 h)' : 'usage'} limit.${time ? ` Resets at ${time}.` : ''}`,
    contextCompacted: (pre: number, post?: number) =>
      `Picked up after a long pause: conversation summarised (${kTokens(pre)}${post ? ` → ${kTokens(post)}` : ''} tokens) rather than paid for again in full.`,
    queued: (max: number) => `Queued: ${max} ${max === 1 ? 'agent is' : 'agents are'} already running. Starts as soon as one finishes.`
  },

  newFeature: {
    title: 'New agent',
    inProject: (project: string) => `in ${project}`,
    issueOf: (label: string) => `Linear issue · ${label}`,
    linearIssue: 'Linear issue',
    unlink: 'Unlink',
    loadingIssues: 'Loading issues…',
    filterIssues: 'Filter issues…',
    noIssueIn: (label: string) => `No matching open issue in ${label}.`,
    newIssue: 'Or create a new issue from the title and message below',
    newIssueProject: 'Linear project',
    newIssueTeam: 'Team',
    newIssueNoTeam: 'This Linear project has no team to create an issue in.',
    newIssueCreate: 'Create Linear issue',
    newIssueCreating: 'Creating issue…',
    titleLabel: 'Title',
    titlePlaceholder: 'Dark mode toggle',
    promptLabel: 'What should the agent do?',
    promptPlaceholder: 'Leave empty to create the worktree and write the first message later.',
    permissions: 'Permissions',
    model: 'Model',
    creating: 'Creating…',
    create: 'Create agent'
  },

  linkIssue: {
    title: 'Link to a Linear issue',
    hint: 'The issue moves to its started state once the agent is at work. Its description is put in the message box, for you to send.'
  },

  modes: {
    default: { label: 'Ask', hint: 'Asks before edits and commands' },
    acceptEdits: { label: 'Accept edits', hint: 'Edits files freely, asks for commands' },
    plan: { label: 'Plan', hint: 'Explores and proposes a plan first' },
    bypassPermissions: { label: 'Bypass', hint: 'Never asks. Runs any command unattended' }
  } as Record<PermissionMode, { label: string; hint: string }>,

  models: {
    sonnet: { label: 'Sonnet', hint: 'Handles most tasks, and lets the usage limit last several times longer' },
    opus: { label: 'Opus', hint: 'For the hardest tasks. Uses up the limit several times faster' }
  } as Record<AgentModel, { label: string; hint: string }>,

  project: {
    newTitle: 'New project',
    settingsTitle: 'Project settings',
    folder: 'Folder',
    folderPlaceholder: 'Choose a folder…',
    browse: 'Browse…',
    gitDetected: (branch: string | null, changed: number) =>
      `Git repository detected${branch ? ` · branch ${branch}` : ''} · ${changed} changed ${changed === 1 ? 'file' : 'files'}`,
    notGit: 'Not a git repository. Agents will work directly in this folder.',
    useWorktrees: 'One worktree per agent',
    useWorktreesHint: 'Each agent works on its own branch, in a copy of the repository. Off, every agent edits the project folder itself.',
    name: 'Name',
    tabPreview: 'Tab preview',
    fallbackName: 'Project',
    color: 'Color',
    linearLabel: 'Linear project label (optional)',
    linearNone: 'None',
    loading: 'Loading…',
    linearHint: 'Issues of the Linear projects carrying this label start their agents in this repository.',
    create: 'Create project'
  },

  linear: {
    connectedAs: (name?: string) => `Connected${name ? ` as ${name}` : ''}.`,
    connectedBody:
      'Agents started from an issue use its branch name; any agent can be linked to one later. The issue moves to its started state when the agent begins.',
    disconnect: 'Disconnect',
    done: 'Done',
    keyLabel: 'Personal API key',
    keyHint:
      'Create one in Linear under Settings → Security & access → Personal API keys. It is stored encrypted with the system keychain.',
    checking: 'Checking…',
    connect: 'Connect'
  },

  menu: {
    copyHash: 'Copy commit hash',
    copySubject: 'Copy commit message',
    compareHead: 'Compare with the checked-out commit',
    branchHere: 'New branch from here…',
    cherryPick: 'Cherry-pick onto this branch',
    revert: 'Revert on this branch',
    openTerminal: 'Open in Terminal',
    openIssue: (identifier: string) => `Open ${identifier} in Linear`,
    linkIssue: 'Link to a Linear issue…',
    unlinkIssue: (identifier: string) => `Unlink from ${identifier}`,
    copyBranch: 'Copy branch name',
    copyIdentifier: 'Copy identifier',
    copyPath: 'Copy path',
    rename: 'Rename…',
    delete: 'Delete…',
    pin: 'Pin to the top',
    unpin: 'Unpin',
    archive: 'Archive',
    unarchive: 'Restore from the archive',
    moveFirst: 'Move to the front of the queue',
    continueNew: 'Continue in a new agent…',
    settings: 'Project settings…',
    removeProject: 'Remove project…',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select all',
    openLink: 'Open link',
    copyLink: 'Copy link',
    copyEntry: { message: 'Copy message', input: 'Copy input', output: 'Copy output' }
  },

  linearView: {
    tab: 'Linear',
    myIssues: 'My issues',
    projects: 'Projects',
    notConnectedTitle: 'Linear is not connected',
    notConnectedBody: 'Connect your account to browse projects and issues, and start agents from them.',
    repository: 'Repository',
    needRepository: 'No repository is linked to a label of this Linear project: you choose one each time you start an agent.',
    needProject: 'Add a project first: an agent needs a git repository.',
    startFeature: 'Start agent',
    selectAll: 'Select all',
    selected: (n: number) => `${n} selected`,
    startMany: (n: number) => `Start ${n} ${n === 1 ? 'agent' : 'agents'}`,
    startingMany: 'Starting…',
    openFeature: 'Open agent',
    allIssues: 'All',
    unassigned: 'Unassigned',
    refresh: 'Refresh',
    noIssues: 'No matching open issue.',
    issues: (n: number) => `${n} open ${n === 1 ? 'issue' : 'issues'}`,
    list: 'List',
    board: 'Board',
    groupByStatus: 'Status',
    groupByPriority: 'Priority',
    noStateInTeam: (name: string) => `This issue's team has no "${name}" state.`,
    priorities: { 0: 'No priority', 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' } as Record<number, string>
  },

  update: {
    available: (version: string) => `Update to ${version}`,
    settings: 'Settings',
    settingsOpen: 'Settings',
    checkNow: 'Check for updates',
    checking: 'Checking…',
    upToDate: (version: string) => `You are up to date (${version}).`,
    checkFailed: 'No newer version found, or GitHub is unreachable.',
    close: 'Close',
    title: (version: string) => `Version ${version} is available`,
    current: (version: string) => `You are on ${version}.`,
    notes: 'Release notes',
    install: 'Update and restart',
    installHint:
      'Homebrew downloads the update here, then upgrades the app and reopens it. Running agents are stopped; their conversations resume when you message them again.',
    manualHint: 'Update it from a terminal:',
    copy: 'Copy command',
    later: 'Later',
    starting: 'Updating…',
    downloading: (percent?: number) => (percent === undefined ? 'Downloading…' : `Downloading… ${percent}%`),
    installing: 'Installing, the app restarts…',
    failed: (reason: string) => `Update failed: ${reason}`,
    retry: 'Retry',
    installHintMac:
      'The new version is downloaded and replaces the app, which then reopens. Running agents are stopped; their conversations resume when you message them again.',
    installHintLinuxPkg:
      'The new package is downloaded and installed (your system asks for your password), then the app reopens. Running agents are stopped; their conversations resume when you message them again.',
    installHintLinuxUser:
      'The new version is downloaded and unpacked over this one, then the app reopens. Running agents are stopped; their conversations resume when you message them again.'
  },

  /** Native dialogs opened by the main process. */
  native: {
    pickTitle: 'New project',
    pickMessage: 'Choose the folder of the project',
    deleteQuestion: (title: string) => `Delete “${title}”?`,
    deleteDetail: (branch: string) =>
      `The worktree will be deleted. Uncommitted changes are kept for 7 days in Settings › Trash. The branch ${branch} is kept.`,
    deleteInPlaceDetail: 'Only the agent is removed. Your project folder is left untouched.',
    mergedRemoved: (branch: string) => `Merged: its worktree was removed. The branch ${branch} is kept.`,
    strayRemoved: (branch: string) => `A worktree left behind by an agent was removed. The branch ${branch} is kept.`,
    removeProjectQuestion: (name: string) => `Remove “${name}” from the app?`,
    removeProjectDetail: 'Its folder and branches are left untouched.',
    remove: 'Remove',
    overwriteQuestion: (name: string) => `Overwrite “${name}”?`,
    overwriteDetail: 'The file changed on disk since you opened it. Saving replaces those changes with yours.',
    overwrite: 'Overwrite',
    discardQuestion: (name: string) => `Close “${name}” without saving?`,
    discardDetail: 'Your unsaved changes will be lost.',
    discard: 'Discard changes'
  },

  errors: {
    unknownProject: 'Unknown project.',
    unknownFeature: 'Unknown agent.',
    unknownCommand: 'This command no longer exists.',
    needTitle: 'An agent needs a title.',
    folderTaken: 'This folder is already a project.',
    projectHasFeatures: 'Delete the agents of this project first.',
    agentBusy: 'Stop the agent before switching branch.',
    agentBusyPull: 'Stop the agent before pulling.',
    linearNotConnected: 'Linear is not connected.',
    linearHttp: (status: number) => `Linear answered with HTTP ${status}.`,
    linearCreateFailed: 'Linear did not create the issue.',
    trashGone: 'This backup no longer exists.',
    detachedHead: 'The worktree is not on a branch.'
  },

  shortcuts: {
    title: 'Keyboard shortcuts',
    actions: {
      newFeature: 'New agent',
      nextWaiting: 'Next agent waiting for me',
      prevFeature: 'Previous agent',
      nextFeature: 'Next agent',
      project: 'Go to project',
      toggleEditor: 'Show or hide the editor',
      approve: 'Allow the first pending request',
      searchSidebar: 'Search agents',
      searchConversation: 'Search the conversation'
    }
  },

  search: {
    placeholder: 'Find in the conversation',
    count: (at: number, total: number) => (total ? `${at}/${total}` : 'No result'),
    next: 'Next',
    previous: 'Previous',
    close: 'Close'
  },

  notifications: {
    title: 'Notifications',
    events: { waiting: 'Needs an answer', done: 'Finished its turn', error: 'Error', limited: 'Usage limit' },
    sound: 'Sound',
    whenFocused: 'Also with the window in front',
    whenFocusedHint: 'Notifies for the agents you are not looking at, even while the app is in front.'
  },

  usage: {
    title: 'Usage',
    lastDays: (n: number) => `Last ${n} days`,
    total: 'Total',
    byDay: 'Per day',
    byProject: 'Per project',
    byAgent: 'Per agent',
    none: 'No cost recorded in this period.',
    note: 'Adds up the turns kept in the history of the agents that still exist.'
  },

  templates: {
    title: 'Prompts',
    hint: 'Ready-made prompts for this project: one click puts one in the message box.',
    name: 'Name',
    text: 'Prompt',
    namePlaceholder: 'Add tests',
    textPlaceholder: 'Write tests for the code you just changed.',
    add: 'Add a prompt',
    remove: 'Remove this prompt'
  },

  trash: {
    title: 'Trash',
    hint: 'Uncommitted changes of deleted agents are kept for 7 days.',
    empty: 'Nothing kept.',
    restore: 'Restore',
    discard: 'Delete for good',
    files: (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`,
    restored: 'Restored as a new agent. Its conversation is not kept.'
  },

  pr: {
    create: 'Create PR',
    createHint: 'Open a pull request for this branch',
    open: 'Open the pull request',
    title: 'Create a pull request',
    hint: 'The branch is pushed first if needed.',
    titleLabel: 'Title',
    bodyLabel: 'Description',
    into: (base: string) => `Into ${base}`,
    drafting: 'Claude is writing the pull request…',
    redraft: 'Write again',
    draftFailed: 'Could not write the pull request.',
    creating: 'Creating…',
    submit: 'Create pull request',
    missing: 'The GitHub CLI (gh) is not installed.',
    signedOut: 'Sign in with “gh auth login” first.'
  },

  handoff: {
    title: (title: string) => `${title} (continued)`,
    prompt: (title: string, summary: string) =>
      `You are taking over the work of another agent on “${title}”. Its branch and uncommitted changes are in your worktree. Here is its brief:\n\n${summary}\n\nCheck the state of the repository, then carry on.`,
    dialogTitle: 'Continue in a new agent',
    hint: 'A new agent starts on a branch cut from this one, with the changes not yet committed and the summary below as its first message. This agent keeps its own worktree.',
    name: 'Name of the new agent',
    summary: 'Summary for the new agent',
    drafting: 'Claude is summing up the work…',
    draftFailed: 'Could not write a summary.',
    redraft: 'Write again',
    creating: 'Creating…',
    create: 'Create the agent',
    heavy: 'This conversation is heavy: a new agent costs less than another “Continue”.',
    button: 'New agent with a summary'
  }
}

export type Dict = typeof en

const fr: Dict = {
  status: {
    idle: 'Inactif',
    working: 'En cours',
    waiting: 'Attend une réponse',
    done: 'Terminé',
    error: 'Erreur',
    limited: 'Limite atteinte',
    queued: 'En file'
  },

  attention: {
    waiting: 'Attend ta réponse',
    done: 'A terminé son tour',
    error: 'Arrêté sur une erreur',
    limited: "Limite d'utilisation atteinte"
  },

  common: { cancel: 'Annuler', save: 'Enregistrer', delete: 'Supprimer' },

  topbar: { newProject: 'Nouveau projet', waitingBadge: 'Agents en attente de réponse' },

  sidebar: {
    features: 'Agents',
    newFeature: 'Nouvel agent',
    filterByStatus: 'Filtrer par statut',
    all: 'Tous',
    none: 'Aucun agent.',
    project: 'Projet',
    projectSettings: 'Réglages du projet',
    linkLinear: 'Lier un label Linear',
    launch: 'Lancement',
    launchSettings: 'Configurer les commandes',
    launchAll: 'Tout lancer',
    launchReady: 'prêt',
    launchRunning: 'en cours',
    noCommand: 'Aucune commande.',
    configure: 'Configurer',
    runCommand: (command) => `Lancer « ${command} » dans un nouveau terminal`,
    showCommand: (name) => `Afficher le terminal de « ${name} »`,
    stopCommand: (name) => `Arrêter « ${name} » et fermer son terminal`,
    terminals: 'Terminaux',
    newTerminal: 'Nouveau terminal',
    search: 'Chercher un agent…',
    searchLabel: 'Chercher un agent',
    noMatch: 'Aucun agent ne correspond.',
    sortBy: 'Trier par',
    sort: { status: 'Statut', activity: 'Activité récente', created: 'Date de création', cost: 'Coût', name: 'Nom' },
    archived: (n) => `Archivés · ${n}`,
    queueRank: (n) => `n° ${n} dans la file`,
    prompts: 'Prompts',
    promptsSettings: 'Modifier les prompts',
    qa: 'Tests',
    qaOpen: 'Ouvrir les rapports de tests',
    qaOff: 'Pas de tests automatiques.',
    qaCounts: (passed: number, failed: number, running: number) =>
      [running && `${running} en cours`, failed && `${failed} en échec`, passed && `${passed} réussis`].filter(Boolean).join(' · ') || 'aucun lancement'
  },

  launch: {
    title: 'Commandes de lancement',
    hint: "Un clic lance la commande dans un nouveau terminal, dans le worktree de l'agent affiché.",
    name: 'Nom',
    command: 'Commande',
    namePlaceholder: 'Serveur de dev',
    commandPlaceholder: 'npm run dev',
    add: 'Ajouter une commande',
    remove: 'Retirer cette commande',
    autoTitle: 'Remplir automatiquement',
    autoBody:
      'Claude lit le projet (manifestes, scripts, docker-compose, README…) sans rien modifier et propose les commandes à lancer. Relis-les avant d\'enregistrer.',
    autoFill: 'Remplir automatiquement',
    autoRunning: 'Claude lit le projet…',
    autoStop: 'Arrêter',
    autoFailed: (reason) => `Claude n'a pas pu lire le projet : ${reason}`,
    proposalNotice: 'Proposition de Claude : relis chaque commande en entier. Elles remplacent celles de la liste.',
    proposalEmpty: "Claude n'a trouvé aucune commande à proposer.",
    ignore: 'Ignorer',
    replace: 'Remplacer les commandes'
  },

  qa: {
    title: 'Tests automatiques',
    hint: 'Quand un agent de ce projet a fini, ses tests tournent dans son worktree et Claude en résume le résultat ici.',
    enabled: 'Lancer les tests quand un agent a fini',
    command: 'Commande de test',
    commandPlaceholder: 'npm test',
    reports: 'Rapports',
    none: 'Aucun test lancé.',
    run: 'Lancer maintenant',
    running: 'en cours…',
    passed: 'réussis',
    failed: 'en échec',
    error: 'non terminé',
    recapPending: 'Claude rédige le résumé…',
    output: 'Sortie',
    exit: (code: number | null) => (code === null ? 'arrêté' : `code ${code}`),
    needCommand: "Renseigne d'abord une commande de test.",
    sendToAgent: "Renvoyer l'échec à l'agent",
    sent: "Envoyé à l'agent",
    agentPrompt: (command: string, recap: string, output: string) =>
      `Les tests automatiques ont échoué (\`${command}\`). Corrige le code pour qu'ils passent, puis relance-les.\n\n${recap ? `Résumé :\n${recap}\n\n` : ''}Sortie :\n${output}`
  },

  statusbar: {
    working: (n) => `${n} en cours`,
    waiting: (n) => `${n} en attente`,
    done: (n) => `${n} ${n > 1 ? 'terminés' : 'terminé'}`,
    stopped: (n) => `${n} ${n > 1 ? 'arrêtés' : 'arrêté'}`,
    queued: (n) => `${n} en file`,
    maxRunning: 'En parallèle',
    maxRunningHint: "Agents autorisés à tourner en même temps ; les autres attendent leur tour. ∞ pour aucune limite.",
    usageNear: (time, used, type) =>
      `Limite ${limitWindow(type) === 'weekly' ? 'hebdo ' : limitWindow(type) === 'daily' ? 'journalière ' : ''}bientôt atteinte${used !== undefined ? ` (${Math.round(used * 100)} %)` : ''}${time ? ` · reset à ${time}` : ''}`,
    total: 'Total',
    creditLeft: (kind, left, time) =>
      `Crédit ${kind === 'weekly' ? 'hebdo' : kind === 'daily' ? 'journalier (5 h)' : 'd’usage'} : ${left} % restant${time ? ` · reset à ${time}` : ''}`,
    connectLinear: 'Connecter Linear',
    linearConnected: 'connecté',
    language: 'Langue',
    theme: 'Thème',
    nextWaiting: (n) => `Prochain en attente (${n})`,
    usage: 'Usage'
  },

  empty: {
    noFeatureTitle: 'Aucun agent',
    noFeatureBody: (project) => `Chaque agent travaille de son côté dans ${project}.`,
    firstProjectTitle: 'Ajoute ton premier projet',
    firstProjectBody: 'Un projet est un dossier, de préférence un dépôt git. Ses agents peuvent chacun travailler dans leur propre worktree.'
  },

  feature: {
    stop: 'Arrêter',
    stopHint: 'Annuler le message en cours (Échap / Ctrl+C)',
    contextSize: "Taille de la conversation. Chaque requête de l'agent la renvoie en entier : au-delà de 100k, un nouvel agent coûte moins cher.",
    openFolder: 'Ouvrir le dossier',
    linkIssue: 'Lier à une issue',
    editor: 'Éditeur',
    terminal: 'Terminal',
    toggleTerminalHint: 'Afficher ou masquer le panneau du terminal (⌃`)',
    sendFirst: "Envoie un premier message pour lancer l'agent.",
    working: 'En cours…',
    queuePlaceholder: "Mettre un message en file pour l'agent…",
    messagePlaceholder: "Écrire à l'agent…",
    send: 'Envoyer',
    attach: 'Joindre des fichiers',
    attachHint: 'Joindre des images ou des documents — ils peuvent aussi être collés ou déposés ici',
    removeAttachment: 'Retirer',
    attachRejected: (names) => `Impossible de joindre : ${names}`,
    attachmentMissing: 'image plus disponible',
    plan: 'Plan',
    running: 'en cours',
    failed: 'échec',
    noResult: 'sans résultat',
    noOutput: '(aucune sortie)',
    stopped: 'Arrêté',
    turnFailed: 'Tour en échec',
    turnFinished: 'Tour terminé',
    backgroundRunning: (n) => `${n} ${n > 1 ? 'tâches' : 'tâche'} encore en cours en arrière-plan`,
    approveHint: 'Autoriser la première demande en attente',
    templates: 'Prompts'
  },

  editor: {
    files: 'Fichiers',
    pickFile: 'Choisis un fichier pour le modifier.',
    loading: 'Chargement…',
    binary: 'Ce fichier est binaire et ne peut pas être modifié ici.',
    tooLarge: (megabytes) => `Ce fichier est trop volumineux pour être modifié ici (${megabytes} Mo).`,
    unreadable: "Ce fichier n'a pas pu être lu.",
    unsaved: 'Modifications non enregistrées',
    save: 'Enregistrer',
    close: 'Fermer',
    changedOnDisk: 'Ce fichier a changé sur le disque pendant que tu le modifiais.',
    reload: 'Recharger depuis le disque'
  },

  git: {
    changes: 'Changements',
    history: 'Historique',
    uncommitted: (n) => `${n} ${n > 1 ? 'fichiers non commités' : 'fichier non commité'}`,
    filterCommits: 'Filtrer commits, auteurs, branches…',
    noMatch: 'Aucun commit correspondant.',
    loadMore: 'Charger les commits plus anciens',
    byAgent: 'Agent',
    byAgentHint: (cost) => `Fait pendant un tour de l'agent (${cost})`,
    unpushedHint: 'Pas encore poussé',
    incomingHint: 'Sur le remote, pas encore tiré',
    mergeClean: (base) => `Se merge sans conflit dans ${base}`,
    mergeConflicts: (n, base) => `${n} ${n > 1 ? 'conflits' : 'conflit'} en mergeant dans ${base}`,
    commitFiles: (n) => `${n} ${n > 1 ? 'fichiers modifiés' : 'fichier modifié'}`,
    noCommitFiles: 'Aucun fichier modifié.',
    comparing: (hash) => `${hash} ↔ commit courant`,
    branchName: 'Nom de la nouvelle branche',
    createBranch: 'Créer la branche',
    branchCreated: (name) => `Branche ${name} créée`,
    closeDetail: 'Fermer',
    actionDone: 'Fait',
    noHistory: 'Aucun commit pour le moment.',
    commit: 'Commit',
    commitTitle: 'Commiter les changements',
    commitHint: 'Seuls les fichiers cochés entrent dans le commit.',
    commitMessage: 'Message de commit',
    selectAll: 'Tout sélectionner',
    selected: (n, total) => `${n}/${total} sélectionnés`,
    committing: 'Commit en cours…',
    drafting: 'Claude rédige le message…',
    draft: 'Rédiger avec Claude',
    redraft: 'Réécrire',
    draftFailed: 'Impossible de rédiger un message.',
    pull: 'Pull',
    pulling: 'Pull en cours…',
    push: 'Push',
    pushing: 'Push en cours…',
    pullHint: (upstream) => `Fast-forward depuis ${upstream}`,
    pushHint: 'Pousser les commits vers le remote',
    publishHint: 'Publier cette branche sur origin',
    checking: 'Recherche de conflits…',
    conflictTitle: 'Conflits avant le push',
    conflictIntro: (target, n) =>
      `Fusionner ${target} provoquerait des conflits dans ${n} ${n === 1 ? 'fichier' : 'fichiers'}. Claude les résout ; rien n'est commité ni poussé avant ton accord.`,
    resolving: 'Claude résout les conflits…',
    recapIntro: (target) => `Récap de la fusion de ${target}. Modifie les fichiers à ta guise, puis accepte pour commiter la fusion et pousser.`,
    needsYou: 'Toujours en conflit : termine ce fichier à la main.',
    editFile: 'Modifier',
    hideFile: 'Masquer',
    resetFile: 'Revenir à la version de Claude',
    acceptPush: 'Accepter, commiter et pousser',
    abortMerge: 'Annuler la fusion',
    abortHint: 'Remet la branche comme avant',
    markersLeft: 'Des marqueurs de conflit restent dans un fichier.',
    resolveFailed: "Les conflits n'ont pas pu être résolus.",
    noChanges: 'Aucun changement depuis le dernier commit.',
    before: 'Dernier commit',
    after: 'Version actuelle',
    changed: (n) => `${n} ${n > 1 ? 'fichiers modifiés' : 'fichier modifié'}`,
    switchBranch: 'Changer de branche',
    filterBranches: 'Filtrer les branches…',
    noBranch: 'Aucune branche correspondante.',
    loading: 'Chargement des branches…',
    remote: 'distante',
    heldBy: (owner) => `dans ${owner}`,
    heldByHint: (owner) => `Déjà ouverte dans ${owner} : une branche ne vit que dans un worktree à la fois.`,
    sinceCommit: 'Depuis le dernier commit',
    lastTurn: 'Dernier tour',
    lastTurnHint: "Ce que l'agent a modifié depuis ton dernier message",
    noTurnChanges: "Rien n'a changé pendant le dernier tour.",
    noTurnSnapshot: "Pas encore d'instantané du dernier tour : envoie d'abord un message.",
    beforeTurn: 'Avant le tour',
    detached: (head) => `détaché sur ${head}`,
    ahead: (n, upstream) => `${n} ${n > 1 ? 'commits' : 'commit'} à pousser vers ${upstream}`,
    behind: (n, upstream) => `${n} ${n > 1 ? 'commits' : 'commit'} à récupérer depuis ${upstream}`,
    kind: {
      modified: 'Modifié',
      added: 'Ajouté',
      deleted: 'Supprimé',
      renamed: 'Renommé',
      untracked: 'Non suivi',
      conflicted: 'Conflit'
    }
  },

  terminal: {
    newInProject: (project) => `Nouveau terminal dans ${project}`,
    newInWorktree: 'Nouveau terminal dans le worktree de cet agent',
    worktree: 'Worktree',
    close: 'Fermer le terminal',
    hide: 'Masquer le panneau',
    failed: (reason) => `Le terminal n'a pas pu démarrer : ${reason}`
  },

  permission: {
    allowBefore: 'Autoriser ',
    allowAfter: ' ?',
    allow: 'Autoriser',
    always: 'Toujours autoriser',
    deny: 'Refuser',
    question: 'Question',
    answered: 'répondue',
    allowed: 'autorisé',
    denied: 'refusé',
    other: 'Autre réponse…',
    sendAnswer: 'Envoyer la réponse',
    dismiss: 'Ignorer'
  },

  notice: {
    appClosed: "L'app a été fermée pendant ce tour. Envoie un message pour reprendre.",
    linearMoved: (identifier, state) => `Linear : ${identifier} passée en ${state}.`,
    linearFailed: (identifier, reason) => `Linear : impossible de mettre à jour ${identifier} (${reason}).`,
    limitReached: (time, type) =>
      `Limite ${limitWindow(type) === 'weekly' ? 'hebdomadaire' : limitWindow(type) === 'daily' ? 'journalière (5 h)' : "d'utilisation"} atteinte.${time ? ` Réinitialisation à ${time}.` : ''}`,
    limitNear: (time, type) =>
      `Limite ${limitWindow(type) === 'weekly' ? 'hebdomadaire' : limitWindow(type) === 'daily' ? 'journalière (5 h)' : "d'utilisation"} bientôt atteinte.${time ? ` Réinitialisation à ${time}.` : ''}`,
    contextCompacted: (pre, post) =>
      `Reprise après une longue pause : conversation résumée (${kTokens(pre)}${post ? ` → ${kTokens(post)}` : ''} tokens) au lieu d'être repayée en entier.`,
    queued: (max) => `En file : ${max} ${max > 1 ? 'agents tournent' : 'agent tourne'} déjà. Démarre dès qu'un a fini.`
  },

  newFeature: {
    title: 'Nouvel agent',
    inProject: (project) => `dans ${project}`,
    issueOf: (label) => `Issue Linear · ${label}`,
    linearIssue: 'Issue Linear',
    unlink: 'Délier',
    loadingIssues: 'Chargement des issues…',
    filterIssues: 'Filtrer les issues…',
    noIssueIn: (label) => `Aucune issue ouverte correspondante dans ${label}.`,
    newIssue: "Ou créer une nouvelle issue à partir du titre et du message ci-dessous",
    newIssueProject: 'Projet Linear',
    newIssueTeam: 'Équipe',
    newIssueNoTeam: "Ce projet Linear n'a aucune équipe où créer une issue.",
    newIssueCreate: 'Créer une issue Linear',
    newIssueCreating: "Création de l'issue…",
    titleLabel: 'Titre',
    titlePlaceholder: 'Bouton mode sombre',
    promptLabel: "Que doit faire l'agent ?",
    promptPlaceholder: 'Laisse vide pour créer le worktree et écrire le premier message plus tard.',
    permissions: 'Permissions',
    model: 'Modèle',
    creating: 'Création…',
    create: "Créer l'agent"
  },

  linkIssue: {
    title: 'Lier à une issue Linear',
    hint: "L'issue passe à l'état démarré dès que l'agent travaille. Sa description est placée dans la zone de message, à toi de l'envoyer."
  },

  modes: {
    default: { label: 'Demander', hint: 'Demande avant chaque modification et commande' },
    acceptEdits: { label: 'Edits auto', hint: 'Modifie les fichiers librement, demande pour les commandes' },
    plan: { label: 'Plan', hint: "Explore et propose un plan d'abord" },
    bypassPermissions: { label: 'Sans demande', hint: "Ne demande jamais. Lance n'importe quelle commande sans surveillance" }
  },

  models: {
    sonnet: { label: 'Sonnet', hint: "Suffit pour la plupart des tâches, et fait durer la limite d'utilisation plusieurs fois plus longtemps" },
    opus: { label: 'Opus', hint: 'Pour les tâches les plus dures. Consomme la limite plusieurs fois plus vite' }
  },

  project: {
    newTitle: 'Nouveau projet',
    settingsTitle: 'Réglages du projet',
    folder: 'Dossier',
    folderPlaceholder: 'Choisis un dossier…',
    browse: 'Parcourir…',
    gitDetected: (branch, changed) =>
      `Dépôt git détecté${branch ? ` · branche ${branch}` : ''} · ${changed} ${changed > 1 ? 'fichiers modifiés' : 'fichier modifié'}`,
    notGit: "Ce n'est pas un dépôt git. Les agents travailleront directement dans ce dossier.",
    useWorktrees: 'Un worktree par agent',
    useWorktreesHint: "Chaque agent travaille sur sa propre branche, dans une copie du dépôt. Désactivé, tous les agents modifient directement le dossier du projet.",
    name: 'Nom',
    tabPreview: "Aperçu de l'onglet",
    fallbackName: 'Projet',
    color: 'Couleur',
    linearLabel: 'Label de projet Linear (facultatif)',
    linearNone: 'Aucun',
    loading: 'Chargement…',
    linearHint: 'Les issues des projets Linear portant ce label lancent leurs agents dans ce dépôt.',
    create: 'Créer le projet'
  },

  linear: {
    connectedAs: (name) => `Connecté${name ? ` en tant que ${name}` : ''}.`,
    connectedBody:
      "Les agents lancés depuis une issue reprennent son nom de branche ; tout agent peut être lié à une issue plus tard. L'issue passe à l'état démarré quand l'agent commence.",
    disconnect: 'Déconnecter',
    done: 'OK',
    keyLabel: 'Clé API personnelle',
    keyHint:
      'Crée-la dans Linear : Settings → Security & access → Personal API keys. Elle est stockée chiffrée dans le trousseau système.',
    checking: 'Vérification…',
    connect: 'Connecter'
  },

  menu: {
    copyHash: 'Copier le hash du commit',
    copySubject: 'Copier le message du commit',
    compareHead: 'Comparer avec le commit courant',
    branchHere: 'Nouvelle branche ici…',
    cherryPick: 'Cherry-pick sur cette branche',
    revert: 'Annuler (revert) sur cette branche',
    openTerminal: 'Ouvrir dans le Terminal',
    openIssue: (identifier) => `Ouvrir ${identifier} dans Linear`,
    linkIssue: 'Lier à une issue Linear…',
    unlinkIssue: (identifier) => `Délier de ${identifier}`,
    copyBranch: 'Copier le nom de la branche',
    copyIdentifier: "Copier l'identifiant",
    copyPath: 'Copier le chemin',
    rename: 'Renommer…',
    delete: 'Supprimer…',
    pin: 'Épingler en haut',
    unpin: 'Désépingler',
    archive: 'Archiver',
    unarchive: "Sortir de l'archive",
    moveFirst: 'Passer en tête de la file',
    continueNew: 'Continuer dans un nouvel agent…',
    settings: 'Réglages du projet…',
    removeProject: 'Retirer le projet…',
    cut: 'Couper',
    copy: 'Copier',
    paste: 'Coller',
    selectAll: 'Tout sélectionner',
    openLink: 'Ouvrir le lien',
    copyLink: 'Copier le lien',
    copyEntry: { message: 'Copier le message', input: "Copier l'entrée", output: 'Copier la sortie' }
  },

  linearView: {
    tab: 'Linear',
    myIssues: 'Mes issues',
    projects: 'Projets',
    notConnectedTitle: "Linear n'est pas connecté",
    notConnectedBody: 'Connecte ton compte pour parcourir projets et issues, et lancer des agents depuis celles-ci.',
    repository: 'Dépôt',
    needRepository: "Aucun dépôt n'est lié à un label de ce projet Linear : tu en choisis un à chaque agent lancé.",
    needProject: "Ajoute d'abord un projet : un agent a besoin d'un dépôt git.",
    startFeature: 'Lancer un agent',
    selectAll: 'Tout sélectionner',
    selected: (n) => `${n} ${n > 1 ? 'sélectionnées' : 'sélectionnée'}`,
    startMany: (n) => `Lancer ${n} ${n > 1 ? 'agents' : 'agent'}`,
    startingMany: 'Lancement…',
    openFeature: "Ouvrir l'agent",
    allIssues: 'Toutes',
    unassigned: 'Non assignée',
    refresh: 'Actualiser',
    noIssues: 'Aucune issue ouverte correspondante.',
    issues: (n) => `${n} ${n > 1 ? 'issues ouvertes' : 'issue ouverte'}`,
    list: 'Liste',
    board: 'Tableau',
    groupByStatus: 'Statut',
    groupByPriority: 'Priorité',
    noStateInTeam: (name) => `L'équipe de cette issue n'a pas de statut « ${name} ».`,
    priorities: { 0: 'Sans priorité', 1: 'Urgente', 2: 'Haute', 3: 'Moyenne', 4: 'Basse' }
  },

  update: {
    available: (version) => `Mettre à jour vers ${version}`,
    settings: 'Paramètres',
    settingsOpen: 'Paramètres',
    checkNow: 'Rechercher une mise à jour',
    checking: 'Recherche…',
    upToDate: (version) => `Tu es à jour (${version}).`,
    checkFailed: 'Aucune version plus récente, ou GitHub est injoignable.',
    close: 'Fermer',
    title: (version) => `La version ${version} est disponible`,
    current: (version) => `Tu as la ${version}.`,
    notes: 'Notes de version',
    install: 'Mettre à jour et relancer',
    installHint:
      "Homebrew télécharge la mise à jour ici, puis met l'app à jour et la rouvre. Les agents en cours sont arrêtés ; leurs conversations reprennent au prochain message.",
    manualHint: 'Mets-la à jour depuis un terminal :',
    copy: 'Copier la commande',
    later: 'Plus tard',
    starting: 'Mise à jour…',
    downloading: (percent) => (percent === undefined ? 'Téléchargement…' : `Téléchargement… ${percent} %`),
    installing: "Installation, l'app redémarre…",
    failed: (reason) => `Échec de la mise à jour : ${reason}`,
    retry: 'Réessayer',
    installHintMac:
      "La nouvelle version est téléchargée et remplace l'app, qui se rouvre ensuite. Les agents en cours sont arrêtés ; leurs conversations reprennent au prochain message.",
    installHintLinuxPkg:
      "Le nouveau paquet est téléchargé et installé (le système demande ton mot de passe), puis l'app se rouvre. Les agents en cours sont arrêtés ; leurs conversations reprennent au prochain message.",
    installHintLinuxUser:
      "La nouvelle version est téléchargée et dépaquetée par-dessus celle-ci, puis l'app se rouvre. Les agents en cours sont arrêtés ; leurs conversations reprennent au prochain message."
  },

  native: {
    pickTitle: 'Nouveau projet',
    pickMessage: 'Choisis le dossier du projet',
    deleteQuestion: (title) => `Supprimer « ${title} » ?`,
    deleteDetail: (branch) =>
      `Le worktree sera supprimé. Les modifications non commitées sont gardées 7 jours dans Réglages › Corbeille. La branche ${branch} est conservée.`,
    deleteInPlaceDetail: "Seul l'agent est supprimé. Ton dossier de projet n'est pas touché.",
    mergedRemoved: (branch) => `Mergé : son worktree a été supprimé. La branche ${branch} est conservée.`,
    strayRemoved: (branch) => `Un worktree laissé par un agent a été supprimé. La branche ${branch} est conservée.`,
    removeProjectQuestion: (name) => `Retirer « ${name} » de l'app ?`,
    removeProjectDetail: 'Son dossier et ses branches ne sont pas touchés.',
    remove: 'Retirer',
    overwriteQuestion: (name) => `Écraser « ${name} » ?`,
    overwriteDetail: "Le fichier a changé sur le disque depuis son ouverture. L'enregistrer remplace ces changements par les tiens.",
    overwrite: 'Écraser',
    discardQuestion: (name) => `Fermer « ${name} » sans enregistrer ?`,
    discardDetail: 'Tes modifications non enregistrées seront perdues.',
    discard: 'Abandonner les modifications'
  },

  errors: {
    unknownProject: 'Projet inconnu.',
    unknownFeature: 'Agent inconnu.',
    unknownCommand: "Cette commande n'existe plus.",
    needTitle: "Un agent a besoin d'un titre.",
    folderTaken: 'Ce dossier est déjà un projet.',
    projectHasFeatures: "Supprime d'abord les agents de ce projet.",
    agentBusy: "Arrête l'agent avant de changer de branche.",
    agentBusyPull: "Arrête l'agent avant de faire un pull.",
    linearNotConnected: "Linear n'est pas connecté.",
    linearHttp: (status) => `Linear a répondu avec HTTP ${status}.`,
    linearCreateFailed: "Linear n'a pas créé l'issue.",
    trashGone: "Cette sauvegarde n'existe plus.",
    detachedHead: "Le worktree n'est pas sur une branche."
  },

  shortcuts: {
    title: 'Raccourcis clavier',
    actions: {
      newFeature: 'Nouvel agent',
      nextWaiting: "Prochain agent qui m'attend",
      prevFeature: 'Agent précédent',
      nextFeature: 'Agent suivant',
      project: 'Aller au projet',
      toggleEditor: "Afficher ou masquer l'éditeur",
      approve: 'Autoriser la première demande en attente',
      searchSidebar: 'Chercher un agent',
      searchConversation: 'Chercher dans la conversation'
    }
  },

  search: {
    placeholder: 'Chercher dans la conversation',
    count: (at, total) => (total ? `${at}/${total}` : 'Aucun résultat'),
    next: 'Suivant',
    previous: 'Précédent',
    close: 'Fermer'
  },

  notifications: {
    title: 'Notifications',
    events: { waiting: 'Attend une réponse', done: 'A terminé son tour', error: 'Erreur', limited: "Limite d'utilisation" },
    sound: 'Son',
    whenFocused: 'Aussi quand la fenêtre est au premier plan',
    whenFocusedHint: "Notifie pour les agents que tu ne regardes pas, même quand l'app est au premier plan."
  },

  usage: {
    title: 'Usage',
    lastDays: (n) => `${n} derniers jours`,
    total: 'Total',
    byDay: 'Par jour',
    byProject: 'Par projet',
    byAgent: 'Par agent',
    none: 'Aucun coût enregistré sur cette période.',
    note: "Additionne les tours gardés dans l'historique des agents qui existent encore."
  },

  templates: {
    title: 'Prompts',
    hint: "Des prompts tout prêts pour ce projet : un clic en met un dans la zone de message.",
    name: 'Nom',
    text: 'Prompt',
    namePlaceholder: 'Ajouter des tests',
    textPlaceholder: 'Écris des tests pour le code que tu viens de modifier.',
    add: 'Ajouter un prompt',
    remove: 'Retirer ce prompt'
  },

  trash: {
    title: 'Corbeille',
    hint: 'Les modifications non commitées des agents supprimés sont gardées 7 jours.',
    empty: 'Rien de gardé.',
    restore: 'Restaurer',
    discard: 'Supprimer définitivement',
    files: (n) => `${n} ${n > 1 ? 'fichiers' : 'fichier'}`,
    restored: "Restauré en nouvel agent. Sa conversation n'est pas conservée."
  },

  pr: {
    create: 'Créer la PR',
    createHint: 'Ouvrir une pull request pour cette branche',
    open: 'Ouvrir la pull request',
    title: 'Créer une pull request',
    hint: "La branche est d'abord poussée si besoin.",
    titleLabel: 'Titre',
    bodyLabel: 'Description',
    into: (base) => `Vers ${base}`,
    drafting: 'Claude rédige la pull request…',
    redraft: 'Réécrire',
    draftFailed: 'Impossible de rédiger la pull request.',
    creating: 'Création…',
    submit: 'Créer la pull request',
    missing: "La CLI GitHub (gh) n'est pas installée.",
    signedOut: "Connecte-toi d'abord avec « gh auth login »."
  },

  handoff: {
    title: (title) => `${title} (suite)`,
    prompt: (title, summary) =>
      `Tu reprends le travail d'un autre agent sur « ${title} ». Sa branche et ses modifications non commitées sont dans ton worktree. Voici son brief :\n\n${summary}\n\nVérifie l'état du dépôt, puis continue.`,
    dialogTitle: 'Continuer dans un nouvel agent',
    hint: "Un nouvel agent démarre sur une branche issue de celle-ci, avec les modifications non commitées et le résumé ci-dessous comme premier message. Cet agent garde son propre worktree.",
    name: 'Nom du nouvel agent',
    summary: 'Résumé pour le nouvel agent',
    drafting: 'Claude résume le travail…',
    draftFailed: 'Impossible de rédiger un résumé.',
    redraft: 'Réécrire',
    creating: 'Création…',
    create: "Créer l'agent",
    heavy: "Cette conversation est lourde : un nouvel agent coûte moins cher qu'un autre « Continuer ».",
    button: 'Nouvel agent avec un résumé'
  }
}

export const DICTS: Record<Lang, Dict> = { en, fr }
