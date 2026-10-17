# React Side Panel R33.3.8 — My / Cloud incremental ownership (2026-10-17)

Owner: R33.3.8 connector implementation. Branch: main. Baseline is the GitHub ref checked at the write transaction. No Mac worktree access.

Write scope: src/ui/react/main.tsx, tabs/tasks.tsx, tabs/cloud.tsx, react/preview/sidebar-six-preview.tsx, src/ui/task-workbench.js, cloud-hosting.js, tool-shell.js, source-bound preview builder, targeted tests and CI.

Business contract: TaskWorkbench owns installed catalog, selection, filtering, params, RunHost, Revision, Result; React owns count/cards/trusted detail text. Params form is relocated as the identical DOM node without cloning. CloudHosting remains the only Cloud Provider/claim/dispatch/grant/revoke owner; React owns eight text-only overview fields. Scheduled tasks and Cloud mutations retain legacy DOM owners.

Snapshot adapters: renderMyTaskCount / renderMyTaskRows / renderMyTaskDetail / renderCloudOverview. Subscription is the existing TaskWorkbench and CloudHosting refresh/selection paths, not a second business database. Dispose through single React root; legacy fallbacks retained.

Preview: prototypes/sidebar/react-preview/index.html is an uncommitted generated artifact. The committed builder imports actual DOM, CSS and React sources and adds UI_PREVIEW_ONLY data with no Host, Provider, storage or permissions.

Historical CI blockers fixed separately in 7e1bcab: Node context test imports pure JS, and React authoring CFT uses Developer Edition instead of Standard Edition.

Statuses at code handoff: SOURCE_WRITTEN. Current Node, Chromium, Build, Verify and Size remain NOT_TESTED unless a matching post-commit CI run supplies evidence. INSTALLED_EXTENSION_NATIVE_CHROME=NOT_TESTED.

Unfinished: task status/draft/edit/run/scheduled manager React ownership; Cloud pairing/grants/requests, result and stop controls; Workflow/Develop business closure and 360px editor overflow; true Mac Native two-turn and authority verification.

Parallel state: no local dist, watcher, profile, port or Git index claimed. GitHub fast-forward head lease only for this atomic commit. R33.3.7 evidence applies solely to 54d0e12.
