# Independent Controller Task packs

These directories own reviewed, independently installable Controller Tasks. They are **not**
WebFlow applications, not generic sandbox Sidebar Tools, and not executable fixed Host modules.

- `<task-family>/src/`: reviewed Task script sources (historical revisions are retained).
- `<task-family>/releases/`: exact immutable `.opendesk-task.json` packages, including restore-only versions.
- `<task-family>/tests/`: Task-family-owned contract and action tests where applicable.
- `<task-family>/contracts/`: only shared, fixed-compiled **data validators** when needed; not web page script execution, privileged Host operations, or WebFlow-specific A delivery.

## Runtime ownership

`src/platform/tasks/{builtin-releases,service,contract}.js` and the existing Authority,
Controller, RunHost, and Durable Run/Result remain the single implementation. Pack files
are audited data. **Never** execute a dynamically installed package in a trusted Host.

The source path is *not* the installed Task ID or the runtime resource path. Migration
preserves the original immutable package bytes, embedded `sourceUtf8`, taskId, version,
manifestHash, sourceHash, site permissions and installation records. The build still emits
`tasks/builtin/<taskId>/<version>.json` through the existing packaging service.

Current frozen families:
- `baidu.search` owns `baidu.search.top3@1.1.5` (limit must remain exactly 3);
- `google.search` owns `google.search.top3@1.0.3` (limit must remain exactly 3);
- `chatgpt.conversation.create` retains 0.1.0, 0.2.0, 0.2.1, 0.2.2, 0.3.0
  as separate reviewed bytes (not a silent upgrade path).

See `docs/architecture/installed-controller-tasks-and-workflow-consumers.zh-CN.md`
for default-install policy, consumer/authority rules and no-replay acceptance.
