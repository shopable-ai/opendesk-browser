Exclusive shared codec sidecar

Write scope: src/platform/page-port/codec.js, src/framework/control/value.js,
src/scripting/user-scripts/page-evaluator.js, new tests/framework/k2-shared-codec.test.mjs,
and this evidence directory. SDK/relay, authority, broker, packaging, UI and ledgers
are frozen to this sidecar. No dependencies, second extension or controller.

1. Preserve original tests/assertions and save the original three sources/hashes.
2. Add semantic regressions before changing source; keep the original red run.
3. Define self-contained createValueCodec once. Explicit foundation type/value and
   control t/v profiles preserve wire layouts, negative zero, undefined/null/missing,
   depth 12, UTF-8 budgets and error codes. Control consumes this factory; generated
   userScripts source embeds the factory itself, never module-closure wrappers.
4. Compare observable results with literal expectations through real control worker
   runtime, generated code, host APIs and a fresh realm factory. Reject accessors
   without reading them, Symbols, unpaired surrogates, cycles and unsupported values.
5. Capture fresh source hashes around targeted tests, full unit globs and syntax;
   record F1/factory-freeze differences and current package requalification limits.
6. Freeze only this scope. Main owns same-source product builds and native package
   retests. Native component proof is not package or F3/original603 acceptance.

Requested model: gpt-6.1-sol; requested effort: xhigh. Resolved model/effort: unknown
(not exposed by this session). F3=false; original603=false.
