# Scheduled Task UI R1.2 · Draft-safe manager detour (2026-10-14)

Only authorized branch: `main`. Scoped extension UI follow-up after `b1409dd6` native manager-focus improvement. The actual manager created a new plan by calling `reset()` even when launched from a dirty create/edit form, silently erasing the original draft. Returning to a long editor reset scroll. New-script handoff through that manager also misclassified its origin.

## Source change
- `src/ui/scheduled-task-workbench.js`: block the new-plan shortcut in editor-origin management; preserve form scroll, maintain the existing `leaveManager()` focus behavior, keep Task enable/disable/uninstall available, and preserve editor origin on new-script installation.
- `tests/framework/scheduled-tasks-r1-native-mac.test.mjs`: reuse real installed Chrome FORM_MATRIX to click the actual manager; assert the unsafe shortcut is absent and the saved draft untouched; use semantic selectors for the native Task identity lifecycle test.
- `tests/environment/scheduled-task-manager-draft-r12.test.mjs`: unit-test the actual guard plus source/native bindings, not a mock browser acceptance.
- `.github/workflows/scheduled-tasks-r3-detail-native.yml`: reuse the existing macOS WXT build+native runner, adding the new Node case.
- This workstream note.

No change to shared CSS, other six-Tab runtime, SDK, alarm services, background Host, Task Registry, permission policy, Chrome profiles or local Mac dist. Existing R3 [38550074558](https://github.com/shopable-ai/opendesk-browser/actions/runs/38550074558) is historical, not a receipt for a new package. Record fresh workflow results separately, and leave full physical width/zoom and ten 95+ expert scores NOT_TESTED/NOT_SCORED without evidence.
