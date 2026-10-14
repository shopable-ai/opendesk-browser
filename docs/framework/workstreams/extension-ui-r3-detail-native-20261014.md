# R3 detail native acceptance follow-up

Owner: current GitHub connector conversation, 2026-10-14; initial main `8f5be8fc328390aca3a10aece46443b1795feb47`.
Writable files: existing `tests/framework/scheduled-tasks-r1-native-mac.test.mjs`,
new `.github/workflows/scheduled-tasks-r3-detail-native.yml`, and this unique workstream note.

The existing `FORM_MATRIX` native scenario was already implemented but had no
dedicated CI job. A new workflow enables the same real installed WXT runner on
macOS. It preserves the preceding actual Alarm → RunHost → webpage effect,
then exercises original plan editing across daily/weekly/interval triggers,
immutable Task identity, historical Fire/Run/Result retention, nested plan
detail, returning focus to the list item, creating a second paused plan and
cancelling/confirming deletion without touching the first plan.

No new scheduler/SDK/Authority/browser permission or design system was added.
Until this exact SHA's workflow returns a real receipt, native detail is
`NOT_TESTED`; physical widths, 20-list geometry, themes, and all 95+ scores
remain separately `NOT_TESTED/NOT_SCORED`. The current connection has no
visibility into the user's Mac checkout, watcher, profile or local diff.
