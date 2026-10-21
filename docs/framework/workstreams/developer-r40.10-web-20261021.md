# Developer R40.10 Web ownership note (2026-10-21)

- Owner: Developer R40.10-web, GitHub-only, `main` only. No branch/worktree/PR.
- Write scope: `src/ui/script-editor.js`, `tests/environment/script-editor.test.mjs`, this evidence note. Shared RunHost, Authority, SDK, installations and build configuration are read-only.
- Source baseline blob: `eb300db7ab31db9f17dce338a46d7d606dac57ac`; test baseline blob: `8c55b0b21b499f8c1af7f576976975cd1e2626e3`. Main parent for this write: `d30ce1bf7dadb7e3f3ff4f26698757acb1acb566`.
- Product gap: status-only `update()` repeatedly patched static environment presentation; `sourceInput()` duplicated owner notifications and invalidated Controller on component-only edits; generic Stop cancellation called the component compiler twice or when unrelated Classic/Revision preparation was active.
- Change: memoize **presentation only** by execution intent; preserve live Run/Stop gate on every state change; only active source owners notify on source edits (explicit fallback for Local/imported draft); cancel the shared component compiler through its existing component owner and preserve the original run/preview generation fences.
- Regression assertions added: static mode fields retain projection identity during Controller Run/Result but change on Page selection; a cancelled component Candidate compile calls its compiler's cancel once and dispatches neither Controller nor Page Run.
- Evidence level: GitHub source review. Node tests, CI for this new commit, Chrome, Native and real provider are **NOT_TESTED** at commit creation. Previous unrelated workflow failures do not count as proof of this change. Follow-up must inspect exact commit checks before any release claim.
- Security: no changed RunHost/Authority, permission gesture, previewId, sourceHash, documentId, bindingId, Side Panel host, or installation contract. Failed/unknown effects never replayed.
