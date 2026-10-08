# Branch consolidation report — 2026-10-08

Repository: shopable-ai/opendesk-browser. Official integration branch: main.
No second GitHub repository was created. Short-lived agent/* branches are
deleted only after a merged PR and a checked, unchanged HEAD.

Merged:
- PR #8 R4 UI, PR #9 R5 compact Sidebar, PR #10 R4.1 catalog source-only draft handoff.
- PR #12 browser all-site permission opt-in, preserving latest R5/R4.1/D1 UI.
- PR #7 superseded and closed; source functionality retained via PR #12.
- This integration finishes R4.1's previously missing importDraft -> dependencyPanel.refresh()
  and its original test, plus the R4.1 branch's subsequent evidence notes.

Validated merging CI:
- PR #10: Sidebar and D1 checks green (reference 37778042640, 37778042585).
- PR #12: site access, Sidebar and D1 package all green (37779174730, 37779174638, 37779174715).
- This consolidation candidate must pass the updated script-editor and D1 checks before main merge.

Cleanup:
- Automation .github/workflows/cleanup-merged-agent-branches.yml verifies merged PR status and
  unchanged exact branch HEAD before deletion; it never deletes active unmerged branches.
- Native Agent Bridge PR #11 is still SOURCE_PARTIAL. Its native-agent/native-host.mjs is
  missing, and its current CI is not green. It requires local Codex implementation and
  real macOS Native Messaging acceptance; it is deliberately not merged or deleted.
- No formal native Chrome/F3 acceptance is implied by Node or headless HTML evidence.
