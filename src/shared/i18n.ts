import type { AgentModel, FeatureStatus, GitChangeKind, PermissionMode } from './types'

export type Lang = 'en' | 'fr'

export const LANGS: Lang[] = ['en', 'fr']

/** Picks the app language matching a system locale such as "fr-FR". */
export function langFromLocale(locale: string | undefined): Lang {
  return locale?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
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
    newTerminal: 'New terminal'
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

  statusbar: {
    working: (n: number) => `${n} working`,
    waiting: (n: number) => `${n} waiting`,
    done: (n: number) => `${n} done`,
    stopped: (n: number) => `${n} stopped`,
    queued: (n: number) => `${n} queued`,
    maxRunning: 'At once',
    maxRunningHint: 'Agents allowed to run at the same time; the others wait in line. ∞ for no limit.',
    usageNear: (time?: string, used?: number) =>
      `Usage limit near${used !== undefined ? ` (${Math.round(used * 100)}%)` : ''}${time ? ` · resets ${time}` : ''}`,
    total: 'Total',
    connectLinear: 'Connect Linear',
    linearConnected: 'connected',
    language: 'Language',
    theme: 'Theme'
  },

  empty: {
    noFeatureTitle: 'No agent yet',
    noFeatureBody: (project: string) => `Each agent gets its own branch and worktree in ${project}.`,
    firstProjectTitle: 'Add your first project',
    firstProjectBody: 'A project is a git repository. Its agents each work in their own worktree.'
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
    turnFinished: 'Turn finished'
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
    commit: 'Commit',
    commitTitle: 'Commit changes',
    commitHint: 'Only the checked files go into the commit.',
    commitMessage: 'Commit message',
    selectAll: 'Select all',
    selected: (n: number, total: number) => `${n}/${total} selected`,
    committing: 'Committing…',
    pull: 'Pull',
    pulling: 'Pulling…',
    push: 'Push',
    pushing: 'Pushing…',
    pullHint: (upstream: string) => `Fast-forward from ${upstream}`,
    pushHint: 'Push the commits to the remote',
    publishHint: 'Publish this branch on origin',
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
    limitReached: (time?: string) => `Usage limit reached.${time ? ` Resets at ${time}.` : ''}`,
    limitNear: (time?: string) => `Approaching the usage limit.${time ? ` Resets at ${time}.` : ''}`,
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
    folderPlaceholder: 'Choose a git repository…',
    browse: 'Browse…',
    gitDetected: (branch: string | null, changed: number) =>
      `Git repository detected${branch ? ` · branch ${branch}` : ''} · ${changed} changed ${changed === 1 ? 'file' : 'files'}`,
    notGit: 'Not a git repository. Agents need one for their worktrees.',
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
    openTerminal: 'Open in Terminal',
    openIssue: (identifier: string) => `Open ${identifier} in Linear`,
    linkIssue: 'Link to a Linear issue…',
    unlinkIssue: (identifier: string) => `Unlink from ${identifier}`,
    copyBranch: 'Copy branch name',
    copyIdentifier: 'Copy identifier',
    copyPath: 'Copy path',
    rename: 'Rename…',
    delete: 'Delete…',
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
    openFeature: 'Open agent',
    allIssues: 'All',
    unassigned: 'Unassigned',
    refresh: 'Refresh',
    noIssues: 'No matching open issue.',
    issues: (n: number) => `${n} open ${n === 1 ? 'issue' : 'issues'}`
  },

  update: {
    available: (version: string) => `Update to ${version}`,
    title: (version: string) => `Version ${version} is available`,
    current: (version: string) => `You are on ${version}.`,
    notes: 'Release notes',
    install: 'Update and restart',
    installHint:
      'Homebrew upgrades the app in the background, then reopens it. Running agents are stopped; their conversations resume when you message them again.',
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
    pickMessage: 'Choose the root folder of a git repository',
    deleteQuestion: (title: string) => `Delete “${title}”?`,
    deleteDetail: (branch: string) =>
      `The worktree and any uncommitted change in it will be deleted. The branch ${branch} is kept.`,
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
    notGit: (path: string) => `${path} is not a git repository.`,
    projectHasFeatures: 'Delete the agents of this project first.',
    agentBusy: 'Stop the agent before switching branch.',
    agentBusyPull: 'Stop the agent before pulling.',
    linearNotConnected: 'Linear is not connected.',
    linearHttp: (status: number) => `Linear answered with HTTP ${status}.`,
    linearCreateFailed: 'Linear did not create the issue.'
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
    newTerminal: 'Nouveau terminal'
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

  statusbar: {
    working: (n) => `${n} en cours`,
    waiting: (n) => `${n} en attente`,
    done: (n) => `${n} ${n > 1 ? 'terminés' : 'terminé'}`,
    stopped: (n) => `${n} ${n > 1 ? 'arrêtés' : 'arrêté'}`,
    queued: (n) => `${n} en file`,
    maxRunning: 'En parallèle',
    maxRunningHint: "Agents autorisés à tourner en même temps ; les autres attendent leur tour. ∞ pour aucune limite.",
    usageNear: (time, used) =>
      `Limite bientôt atteinte${used !== undefined ? ` (${Math.round(used * 100)} %)` : ''}${time ? ` · reset à ${time}` : ''}`,
    total: 'Total',
    connectLinear: 'Connecter Linear',
    linearConnected: 'connecté',
    language: 'Langue',
    theme: 'Thème'
  },

  empty: {
    noFeatureTitle: 'Aucun agent',
    noFeatureBody: (project) => `Chaque agent a sa branche et son worktree dans ${project}.`,
    firstProjectTitle: 'Ajoute ton premier projet',
    firstProjectBody: 'Un projet est un dépôt git. Chacun de ses agents travaille dans son propre worktree.'
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
    turnFinished: 'Tour terminé'
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
    commit: 'Commit',
    commitTitle: 'Commiter les changements',
    commitHint: 'Seuls les fichiers cochés entrent dans le commit.',
    commitMessage: 'Message de commit',
    selectAll: 'Tout sélectionner',
    selected: (n, total) => `${n}/${total} sélectionnés`,
    committing: 'Commit en cours…',
    pull: 'Pull',
    pulling: 'Pull en cours…',
    push: 'Push',
    pushing: 'Push en cours…',
    pullHint: (upstream) => `Fast-forward depuis ${upstream}`,
    pushHint: 'Pousser les commits vers le remote',
    publishHint: 'Publier cette branche sur origin',
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
    limitReached: (time) => `Limite d'utilisation atteinte.${time ? ` Réinitialisation à ${time}.` : ''}`,
    limitNear: (time) => `Limite d'utilisation bientôt atteinte.${time ? ` Réinitialisation à ${time}.` : ''}`,
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
    folderPlaceholder: 'Choisis un dépôt git…',
    browse: 'Parcourir…',
    gitDetected: (branch, changed) =>
      `Dépôt git détecté${branch ? ` · branche ${branch}` : ''} · ${changed} ${changed > 1 ? 'fichiers modifiés' : 'fichier modifié'}`,
    notGit: "Ce n'est pas un dépôt git. Les agents en ont besoin pour leurs worktrees.",
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
    openTerminal: 'Ouvrir dans le Terminal',
    openIssue: (identifier) => `Ouvrir ${identifier} dans Linear`,
    linkIssue: 'Lier à une issue Linear…',
    unlinkIssue: (identifier) => `Délier de ${identifier}`,
    copyBranch: 'Copier le nom de la branche',
    copyIdentifier: "Copier l'identifiant",
    copyPath: 'Copier le chemin',
    rename: 'Renommer…',
    delete: 'Supprimer…',
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
    openFeature: "Ouvrir l'agent",
    allIssues: 'Toutes',
    unassigned: 'Non assignée',
    refresh: 'Actualiser',
    noIssues: 'Aucune issue ouverte correspondante.',
    issues: (n) => `${n} ${n > 1 ? 'issues ouvertes' : 'issue ouverte'}`
  },

  update: {
    available: (version) => `Mettre à jour vers ${version}`,
    title: (version) => `La version ${version} est disponible`,
    current: (version) => `Tu as la ${version}.`,
    notes: 'Notes de version',
    install: 'Mettre à jour et relancer',
    installHint:
      "Homebrew met l'app à jour en arrière-plan, puis la rouvre. Les agents en cours sont arrêtés ; leurs conversations reprennent au prochain message.",
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
    pickMessage: "Choisis le dossier racine d'un dépôt git",
    deleteQuestion: (title) => `Supprimer « ${title} » ?`,
    deleteDetail: (branch) =>
      `Le worktree et toutes ses modifications non commitées seront supprimés. La branche ${branch} est conservée.`,
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
    notGit: (path) => `${path} n'est pas un dépôt git.`,
    projectHasFeatures: "Supprime d'abord les agents de ce projet.",
    agentBusy: "Arrête l'agent avant de changer de branche.",
    agentBusyPull: "Arrête l'agent avant de faire un pull.",
    linearNotConnected: "Linear n'est pas connecté.",
    linearHttp: (status) => `Linear a répondu avec HTTP ${status}.`,
    linearCreateFailed: "Linear n'a pas créé l'issue."
  }
}

export const DICTS: Record<Lang, Dict> = { en, fr }
