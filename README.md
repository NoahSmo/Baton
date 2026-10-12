# OrchestraClaude

Feature-first orchestrator for Claude Code agents. You manage features; each one gets its own agent, branch and git worktree.

Independent project, not affiliated with Anthropic.

## Install

```sh
brew install --cask noahsmo/tap/orchestraclaude
```

Apple Silicon Macs only. The build is not notarized; the cask clears the quarantine flag so macOS lets it open.

You need Git, and Claude Code installed and logged in: the app reuses that login.

## Development

Requirements:

- Node 22+
- Git
- Claude Code installed and logged in (the app reuses that login)

Commands:

```sh
npm install
npm run dev        # app with hot reload
npm run build      # production bundle in out/
npm start          # run the production bundle
npm test
npm run typecheck
npm run dist       # OrchestraClaude-<version>.zip in dist/ (macOS arm64)
```

## Data

Everything lives in `~/.orchestra-claude/` (override with `ORCHESTRA_DATA_DIR`):

- `state.db`: projects, features and the event journal (SQLite)
- `worktrees/<repo>-<project id>/<feature>/`: one git worktree per feature, on branch `feat/<slug>` or the Linear branch name

Deleting a feature removes its worktree, uncommitted changes included, and keeps the branch.

## Linear

Connect from the status bar with a personal API key (stored encrypted in `linear.key` through the system keychain). Each project (one tab, one git repository) can be linked to a Linear project in its settings: the new-feature dialog then offers only the open issues of that Linear project. Without a link it offers your open assigned issues. A feature created from an issue:

- uses the branch name Linear suggests, so Linear links the pull request to the issue;
- starts with the issue title, description and link as its first prompt;
- moves the issue to its team's first started state when the agent begins.

The Linear tab lists the workspace's projects and their open issues (or your assigned issues). From there you can link a Linear project to a repository, filter issues by state, change an issue's state, and start a feature from an issue.

## Interface

- English and French, switched from the status bar. Defaults to the system language; the choice is kept in `settings.json`.
- Right-click features, project tabs, issues, messages and tool calls for their actions. Double-click a feature to rename it.

## Layout

- `src/shared/i18n.ts`: every user-facing string, in both languages
- `src/main/menus.ts`: native context menus

- `src/main/linear.ts`: Linear GraphQL client
- `src/main/agent.ts`: one Claude Code process per feature, through the Claude Agent SDK
- `src/main/manager.ts`: features, journal, status projection
- `src/main/worktree.ts`: git worktree lifecycle
- `src/shared/status.ts`: feature status as a pure function of the event stream
- `src/renderer/`: React UI

The app name is defined once in `src/shared/types.ts` (`APP_NAME`, `APP_SLUG`).

## License

[MIT](LICENSE)
