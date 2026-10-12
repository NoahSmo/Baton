import type { FeatureStatus, PermissionMode } from './types'

export type Lang = 'en' | 'fr'

export const LANGS: Lang[] = ['en', 'fr']

/** Picks the app language matching a system locale such as "fr-FR". */
export function langFromLocale(locale: string | undefined): Lang {
  return locale?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

const en = {
  status: {
    idle: 'Idle',
    working: 'Working',
    waiting: 'Needs answer',
    done: 'Done',
    error: 'Error',
    limited: 'Usage limit'
  } as Record<FeatureStatus, string>,

  /** Notification body when a feature moves to a status worth looking at. */
  attention: {
    waiting: 'Needs your answer',
    done: 'Finished its turn',
    error: 'Stopped on an error',
    limited: 'Usage limit reached'
  } as Partial<Record<FeatureStatus, string>>,

  common: { cancel: 'Cancel', save: 'Save', delete: 'Delete' },

  topbar: { newProject: 'New project', waitingBadge: 'Features waiting for an answer' },

  sidebar: {
    features: 'Features',
    newFeature: 'New feature',
    filterByStatus: 'Filter by status',
    all: 'All',
    none: 'No feature yet.',
    project: 'Project',
    projectSettings: 'Project settings',
    linkLinear: 'Link a Linear project'
  },

  statusbar: {
    working: (n: number) => `${n} working`,
    waiting: (n: number) => `${n} waiting`,
    done: (n: number) => `${n} done`,
    stopped: (n: number) => `${n} stopped`,
    total: 'Total',
    connectLinear: 'Connect Linear',
    linearConnected: 'connected',
    language: 'Language'
  },

  empty: {
    noFeatureTitle: 'No feature yet',
    noFeatureBody: (project: string) => `Each feature gets its own agent, branch and worktree in ${project}.`,
    firstProjectTitle: 'Add your first project',
    firstProjectBody: 'A project is a git repository. Its features each run an agent in their own worktree.'
  },

  feature: {
    stop: 'Stop',
    openFolder: 'Open folder',
    sendFirst: 'Send a first message to start the agent.',
    working: 'Working…',
    queuePlaceholder: 'Queue a message for the agent…',
    messagePlaceholder: 'Message the agent…',
    send: 'Send',
    plan: 'Plan',
    running: 'running',
    failed: 'failed',
    noResult: 'no result',
    noOutput: '(no output)',
    stopped: 'Stopped',
    turnFailed: 'Turn failed',
    turnFinished: 'Turn finished'
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
    limitNear: (time?: string) => `Approaching the usage limit.${time ? ` Resets at ${time}.` : ''}`
  },

  newFeature: {
    title: 'New feature',
    inProject: (project: string) => `in ${project}`,
    issueOf: (linearProject: string) => `Linear issue · ${linearProject}`,
    issueMine: 'Linear issue · assigned to me',
    unlink: 'Unlink',
    loadingIssues: 'Loading issues…',
    filterIssues: 'Filter issues…',
    noIssueIn: (linearProject: string) => `No matching open issue in ${linearProject}.`,
    noIssueMine: 'No matching open issue assigned to you.',
    titleLabel: 'Title',
    titlePlaceholder: 'Dark mode toggle',
    promptLabel: 'What should the agent do?',
    promptPlaceholder: 'Leave empty to create the worktree and write the first message later.',
    permissions: 'Permissions',
    creating: 'Creating…',
    create: 'Create feature'
  },

  modes: {
    default: { label: 'Ask', hint: 'Asks before edits and commands' },
    acceptEdits: { label: 'Accept edits', hint: 'Edits files freely, asks for commands' },
    plan: { label: 'Plan', hint: 'Explores and proposes a plan first' },
    bypassPermissions: { label: 'Bypass', hint: 'Never asks. Runs any command unattended' }
  } as Record<PermissionMode, { label: string; hint: string }>,

  project: {
    newTitle: 'New project',
    settingsTitle: 'Project settings',
    folder: 'Folder',
    folderPlaceholder: 'Choose a git repository…',
    browse: 'Browse…',
    gitDetected: (branch: string | null, changed: number) =>
      `Git repository detected${branch ? ` · branch ${branch}` : ''} · ${changed} changed ${changed === 1 ? 'file' : 'files'}`,
    notGit: 'Not a git repository. Features need one for their worktrees.',
    name: 'Name',
    tabPreview: 'Tab preview',
    fallbackName: 'Project',
    color: 'Color',
    linearProject: 'Linear project',
    linearNotConnected: 'Connect Linear from the status bar to link this repository to a Linear project.',
    linearNone: 'None: offer my assigned issues',
    loading: 'Loading…',
    linearHint: 'When linked, new features can only pick issues from this Linear project.',
    create: 'Create project'
  },

  linear: {
    connectedAs: (name?: string) => `Connected${name ? ` as ${name}` : ''}.`,
    connectedBody:
      'Features created from an issue use its branch name, and the issue moves to its started state when the agent begins.',
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
    notConnectedBody: 'Connect your account to browse projects and issues, and start features from them.',
    repository: 'Repository',
    noRepository: 'None',
    needRepository: 'Link a repository to this Linear project to start features from its issues.',
    startFeature: 'Start feature',
    openFeature: 'Open feature',
    unassigned: 'Unassigned',
    refresh: 'Refresh',
    noIssues: 'No matching open issue.',
    issues: (n: number) => `${n} open ${n === 1 ? 'issue' : 'issues'}`
  },

  /** Native dialogs opened by the main process. */
  native: {
    pickTitle: 'New project',
    pickMessage: 'Choose the root folder of a git repository',
    deleteQuestion: (title: string) => `Delete “${title}”?`,
    deleteDetail: (branch: string) =>
      `The worktree and any uncommitted change in it will be deleted. The branch ${branch} is kept.`,
    removeProjectQuestion: (name: string) => `Remove “${name}” from the app?`,
    removeProjectDetail: 'Its folder and branches are left untouched.',
    remove: 'Remove'
  },

  errors: {
    unknownProject: 'Unknown project.',
    unknownFeature: 'Unknown feature.',
    needTitle: 'A feature needs a title.',
    folderTaken: 'This folder is already a project.',
    notGit: (path: string) => `${path} is not a git repository.`,
    projectHasFeatures: 'Delete the features of this project first.',
    linearNotConnected: 'Linear is not connected.',
    linearHttp: (status: number) => `Linear answered with HTTP ${status}.`
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
    limited: 'Limite atteinte'
  },

  attention: {
    waiting: 'Attend ta réponse',
    done: 'A terminé son tour',
    error: 'Arrêté sur une erreur',
    limited: "Limite d'utilisation atteinte"
  },

  common: { cancel: 'Annuler', save: 'Enregistrer', delete: 'Supprimer' },

  topbar: { newProject: 'Nouveau projet', waitingBadge: 'Features en attente de réponse' },

  sidebar: {
    features: 'Features',
    newFeature: 'Nouvelle feature',
    filterByStatus: 'Filtrer par statut',
    all: 'Toutes',
    none: 'Aucune feature.',
    project: 'Projet',
    projectSettings: 'Réglages du projet',
    linkLinear: 'Lier un projet Linear'
  },

  statusbar: {
    working: (n) => `${n} en cours`,
    waiting: (n) => `${n} en attente`,
    done: (n) => `${n} ${n > 1 ? 'terminées' : 'terminée'}`,
    stopped: (n) => `${n} ${n > 1 ? 'arrêtées' : 'arrêtée'}`,
    total: 'Total',
    connectLinear: 'Connecter Linear',
    linearConnected: 'connecté',
    language: 'Langue'
  },

  empty: {
    noFeatureTitle: 'Aucune feature',
    noFeatureBody: (project) => `Chaque feature a son agent, sa branche et son worktree dans ${project}.`,
    firstProjectTitle: 'Ajoute ton premier projet',
    firstProjectBody: 'Un projet est un dépôt git. Chacune de ses features lance un agent dans son propre worktree.'
  },

  feature: {
    stop: 'Arrêter',
    openFolder: 'Ouvrir le dossier',
    sendFirst: "Envoie un premier message pour lancer l'agent.",
    working: 'En cours…',
    queuePlaceholder: "Mettre un message en file pour l'agent…",
    messagePlaceholder: "Écrire à l'agent…",
    send: 'Envoyer',
    plan: 'Plan',
    running: 'en cours',
    failed: 'échec',
    noResult: 'sans résultat',
    noOutput: '(aucune sortie)',
    stopped: 'Arrêté',
    turnFailed: 'Tour en échec',
    turnFinished: 'Tour terminé'
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
    limitNear: (time) => `Limite d'utilisation bientôt atteinte.${time ? ` Réinitialisation à ${time}.` : ''}`
  },

  newFeature: {
    title: 'Nouvelle feature',
    inProject: (project) => `dans ${project}`,
    issueOf: (linearProject) => `Issue Linear · ${linearProject}`,
    issueMine: 'Issue Linear · assignées à moi',
    unlink: 'Délier',
    loadingIssues: 'Chargement des issues…',
    filterIssues: 'Filtrer les issues…',
    noIssueIn: (linearProject) => `Aucune issue ouverte correspondante dans ${linearProject}.`,
    noIssueMine: "Aucune issue ouverte correspondante ne t'est assignée.",
    titleLabel: 'Titre',
    titlePlaceholder: 'Bouton mode sombre',
    promptLabel: "Que doit faire l'agent ?",
    promptPlaceholder: 'Laisse vide pour créer le worktree et écrire le premier message plus tard.',
    permissions: 'Permissions',
    creating: 'Création…',
    create: 'Créer la feature'
  },

  modes: {
    default: { label: 'Demander', hint: 'Demande avant chaque modification et commande' },
    acceptEdits: { label: 'Edits auto', hint: 'Modifie les fichiers librement, demande pour les commandes' },
    plan: { label: 'Plan', hint: "Explore et propose un plan d'abord" },
    bypassPermissions: { label: 'Sans demande', hint: "Ne demande jamais. Lance n'importe quelle commande sans surveillance" }
  },

  project: {
    newTitle: 'Nouveau projet',
    settingsTitle: 'Réglages du projet',
    folder: 'Dossier',
    folderPlaceholder: 'Choisis un dépôt git…',
    browse: 'Parcourir…',
    gitDetected: (branch, changed) =>
      `Dépôt git détecté${branch ? ` · branche ${branch}` : ''} · ${changed} ${changed > 1 ? 'fichiers modifiés' : 'fichier modifié'}`,
    notGit: "Ce n'est pas un dépôt git. Les features en ont besoin pour leurs worktrees.",
    name: 'Nom',
    tabPreview: "Aperçu de l'onglet",
    fallbackName: 'Projet',
    color: 'Couleur',
    linearProject: 'Projet Linear',
    linearNotConnected: "Connecte Linear depuis la barre d'état pour lier ce dépôt à un projet Linear.",
    linearNone: 'Aucun : proposer mes issues assignées',
    loading: 'Chargement…',
    linearHint: 'Une fois lié, les nouvelles features ne proposent que les issues de ce projet Linear.',
    create: 'Créer le projet'
  },

  linear: {
    connectedAs: (name) => `Connecté${name ? ` en tant que ${name}` : ''}.`,
    connectedBody:
      "Les features créées depuis une issue reprennent son nom de branche, et l'issue passe à l'état démarré quand l'agent commence.",
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
    notConnectedBody: 'Connecte ton compte pour parcourir projets et issues, et lancer des features depuis celles-ci.',
    repository: 'Dépôt',
    noRepository: 'Aucun',
    needRepository: 'Lie un dépôt à ce projet Linear pour lancer des features depuis ses issues.',
    startFeature: 'Lancer une feature',
    openFeature: 'Ouvrir la feature',
    unassigned: 'Non assignée',
    refresh: 'Actualiser',
    noIssues: 'Aucune issue ouverte correspondante.',
    issues: (n) => `${n} ${n > 1 ? 'issues ouvertes' : 'issue ouverte'}`
  },

  native: {
    pickTitle: 'Nouveau projet',
    pickMessage: "Choisis le dossier racine d'un dépôt git",
    deleteQuestion: (title) => `Supprimer « ${title} » ?`,
    deleteDetail: (branch) =>
      `Le worktree et toutes ses modifications non commitées seront supprimés. La branche ${branch} est conservée.`,
    removeProjectQuestion: (name) => `Retirer « ${name} » de l'app ?`,
    removeProjectDetail: 'Son dossier et ses branches ne sont pas touchés.',
    remove: 'Retirer'
  },

  errors: {
    unknownProject: 'Projet inconnu.',
    unknownFeature: 'Feature inconnue.',
    needTitle: 'Une feature a besoin d\'un titre.',
    folderTaken: 'Ce dossier est déjà un projet.',
    notGit: (path) => `${path} n'est pas un dépôt git.`,
    projectHasFeatures: "Supprime d'abord les features de ce projet.",
    linearNotConnected: "Linear n'est pas connecté.",
    linearHttp: (status) => `Linear a répondu avec HTTP ${status}.`
  }
}

export const DICTS: Record<Lang, Dict> = { en, fr }
