# R4.1 evidence consolidation and safe branch pruning

Date: 2026-10-08
Base main: f89b279a97e8d9dbcfae60553a702dde5b24ab3f
Observed legacy R4.1 branch: agent/sidebar-r41-sync-20261008-x8ttm7ta@a3bb8a9a82e043d165107f239c0e2e1ba8f826ec
Original R4.1 merged PR #10: 37f84193cb7024af6de9ded16db5b70a999f6c61
Imported draft dependency review follow-up merged PR #14: 28389f5edc6210a3774698600c518be37867ad7b

The legacy branch was repushed from an existing parallel local worktree after PR #14,
updating its test/build handoff record. Preserve that latest workstream JSON exactly;
do not rewrite historical receipts. Its production changes are already present in
main through #10, #12 (site access) and #14 (importDraft dependency refresh).
No new runner/authority/permission code is introduced by this cleanup.

The Actions cleanup workflow is pinned to a3bb8a9a82e043d165107f239c0e2e1ba8f826ec for this branch. Delete only when
its PR #10 is actually merged and its remote ref still equals the observed SHA.
Do not delete any active Native Agent PR #11 work or any changed ref.
Parallel local Codex agents must stop pushing obsolete branch names to keep only main.

NATIVE_CHROME / F3 / ZIP: NOT_TESTED by this evidence-only update.
