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

## Owner → Adapter → Snapshot → Subscription → Dispose

| Tab | React-owned surface | Legacy business adapter (authority) | Read-only / delegated snapshot | Subscription | Dispose / remaining |
| --- | --- | --- | --- | --- | --- |
| 我的 | Installed count, cards, enabled text, trusted selected details | TaskWorkbench.connectReactMyTasks; TaskWorkbench remains DB / params / draft / RunHost owner | Installed task IDs, title, description, enabled, selected ID, canonical detail | Existing refresh/search/filter/selection calls only | Shared React root unmount; move original live form out before teardown. Schedule, params editing, Run/Stop/result/history still legacy. |
| 扩展 | React toolbar/list/detail/empty/status | Original ExtensionCenter, Tool shell, install authority | Catalog/installed list/status projections | Original ExtensionCenter event and refresh paths | Root disposal plus legacy controller; iframe Sandbox / review / installation remain authoritative. |
| 工作流 | Header, transcript, settings sheet, result projection | Original WorkflowView / workflow runtime | Original conversation and result projections | Workflow runtime's existing update paths | Root disposal and WorkflowView cleanup; compose/planning/steps/RunHost state not fully migrated or Native-tested. Approved history UI unchanged. |
| 开发 | Framework/actions/current-page/status/result React projections | Original ScriptEditor and RunHost | Existing editor state, target and result | Existing ScriptEditor update callbacks | Root disposal plus ScriptEditor cleanup; code editor, IME, local project and params remain legacy; 360px manual acceptance pending. |
| 云控 | Eight text-only fields: myState, summary, provider, connection, host, slot, tasks, requests | Original CloudHosting / authorization / broker / RunHost | projected Cloud status only (no capability to claim, dispatch or revoke) | Original CloudHosting refresh/poll | Root disposal and original CloudHosting dispose; pairing/grants/requests/actions still legacy. |
| 调试 | Read-only React diagnostic text | Original DebugWorkbench and sanitization | Detached redacted diagnostics only | Existing debug refresh paths | Root/debug disposer; production Tab hidden, no execution or permission action. |

## CI receipts (exact candidate commits, never promoted to future HEAD)

- Baseline R33.3.7 source 54d0e12 is historical only.
- R33.3.8 preview and package gates on 35b3e4d367ecb5e7ec3daa27eb58eef7efb3e616: https://github.com/shopable-ai/opendesk-browser/actions/runs/39023494604 — two jobs success; source-bound preview guard + 11/11; Node business tests 149/149; real Linux Chromium six screenshots and UI component interaction; npm check, production build, development build, verify, build:size PASS.
- This candidate's hard-size checks pass with 682002 B sw.js and 821258 B ui/tool-shell.js; both above soft review thresholds; do NOT increase budgets.
- Original React/Vue TSX Node test fix validated by https://github.com/shopable-ai/opendesk-browser/actions/runs/39023395838 at 757f78d9.
- Extra independent, manually scripted offline Linux Chromium (inline document content from exact 35b preview artifact): six tabs × eight scenarios × three widths = 144 UI permutations, no JS page exceptions or outer horizontal overflow. It is NOT the installed extension.
- Real Chrome URL import CFT later entered HTTPS download and fixed approval, exposing a further worker prewarm/foreground compile race. Follow-up commits 441d584, 8f9b43, b6e013a address this; mark the CFT result PASS only when GitHub confirms matching post-fix run https://github.com/shopable-ai/opendesk-browser/actions/runs/39024565214, otherwise FAIL/NOT_TESTED.
- Other CI failures involving emitted Manifest branding and pinned source hashes were observed in parallel unrelated work. Do not claim all repository CI green, overwrite those owners or silently rewrite hash assertions.
- time-review.css currently appears as build-time CSS (11538 B); source-bound preview generator deliberately omits its implicit dependency. This remains a visual parity audit item, not an invented source.
- INSTALLED_EXTENSION_NATIVE_CHROME=NOT_TESTED; all delivered screenshot evidence is UI_PREVIEW_ONLY, not Mac installed extension.
