# Static ScrapyJS migration fixtures

Mount this directory read-only at `http://127.0.0.1:43111/scrapyjs-fixtures/` using the existing authorized server. Start at `/scrapyjs-fixtures/list-1.html`; next is `list-2.html`. This directory does not install a service, alter `examples/tasks`, or grant an origin. Mapping and real browser validation belong to the main agent.

## Consumer contract

The two list pages contain **two independent datasets**. Select only one container at a time:

- GitHub: `[data-listview-component="items-list"]` direct `li` children. Page 1 has cache/tools/empty; page 2 repeats tools/empty. Five raw rows, three unique URLs in first-seen order. Preserve missing optional fields as empty strings, `12k` as text, and both h3/h4 link variants. The nested advertisement is not a record. Extraction returns relative href attributes; URL normalization is a separate step.
- Catalog: `.catalog` direct `article` children. Page 1 has A/Alpha and B/Beta; page 2 has identical A/Alpha followed by C/Gamma. Four raw rows, three unique IDs, with exactly one distinct detail URL per ID. `detail-A.html`, `detail-B.html`, `detail-C.html` preserve source IDs/authors/prices. Join by the resolved URL and verify the returned detail ID, never by response completion order. Run the original strict decimal price Pipeline to obtain numeric 19.9/25/30.
- Page 1's sole next link satisfies both the GitHub next selector and `a.next`. Page 2 has `.end`, no matching next href, and a disabled non-link control. Traverse to natural termination with a safety budget greater than two to distinguish natural end from a page-limit stop. Detail pages also have `.ready`/`.end`.
- `detail-fixture-{cache,tools,empty}.html` are local repository-link targets with `.repository-detail` and `.name/.description/.language/.stars`; they are separate from the source catalog detail schema.

The independent, checked-in oracle is `../examples/expected.json` (schemaVersion 1). Top-level keys: `schemaVersion`, `origin`, `mountPath`, `listUrls`, `github`, `listDetail`, `pagination`. `github.pages[].records` and `listDetail.pages[].records` are **raw extraction** arrays. `github.resolvedUniqueRecords` and `listDetail.uniqueRecords` contain absolute URLs. `listDetail.details[]` binds each URL to its raw detail records; `mergedBeforePipeline` retains string prices; `afterPipeline` contains numeric prices. Record-array order is first-seen list order; concurrent consumers should associate by URL/ID and sort accordingly before comparison. No runtime-generated engine result is used as a golden.

`listDetail.associationErrors` and `pipeline.invalidPriceError` document source rejection codes only: this positive static dataset does not claim negative-case execution, fault injection, or checkpoint recovery validation. Pipeline functions are packaged code owned by the controller agent, not executable strings from this JSON.

## Provenance and deliberate differences

Read-only upstream sources were observed on 2026-10-29. GitHub selector strings, field requirements, three row values, optional empties, h3/h4 variants and nested distractor come from `scrapyJsChrome/examples/github-repositories/{task.json,fixture.html,expected.json}`; `crawl.js` establishes separate relative-to-absolute URL validation. The live task goal (two pages / minimum 50 rows) is intentionally not reused for a three-record fixture.

Catalog selectors, ready/end states, ID/URL ownership checks, merge rule and strict price Pipeline come from `scrapyJs/examples/list-detail/{common,callbacks,declarative,two-phase}.cjs`. Their README points to `test/helpers/list-detail-fixture.cjs`, which supplies the exact Alpha/Beta/Gamma, Ada/Ben/Cara and 19.90/25.00/30.00 dataset. The static second catalog page enables that helper's `duplicate` variant (identical A overlap). Callback/two-phase logic skips identical overlaps; declarative `duplicatePolicy: error` may reject them, so use the callback deduplication contract for this overlap scenario rather than claiming all source modes accept it.

Differences: both datasets share these local static list documents; source GitHub hrefs `/microsoft/fixture-*` become `/scrapyjs-fixtures/detail-fixture-*.html`; source catalog `/catalog?page=N` and `/book/ID` become `list-N.html` and `detail-ID.html`. Local repository detail documents are added solely as safe link targets, not copied upstream pages. GitHub page 2 repeats existing rows without inventing repository data. The terminal marker and disabled control are explicit additions; source GitHub's `#2` placeholder is replaced by real pagination. Catalog path scope must be `/scrapyjs-fixtures/` on the **same** origin; upstream CLI seed `/catalog` validation and `/catalog`/`/book` path scope cannot be used unchanged. No live GitHub access, remote assets, script execution, artificial delay, HTTP failure injection, or dynamic server behavior is included.

### SHA-256 of upstream inputs

| Read-only source | SHA-256 |
| --- | --- |
| `/Users/shopme/Documents/workspace/scrapyJsChrome/examples/github-repositories/task.json` | `4f41d7da10cd072d64177a4d8824e6e88e228b96dcc59c6e39d02f3e72152e34` |
| `/Users/shopme/Documents/workspace/scrapyJsChrome/examples/github-repositories/crawl.js` | `e8760cce9ac467d67540cb530c785df53207a8c5df2328484ea08ece5824364a` |
| `/Users/shopme/Documents/workspace/scrapyJsChrome/examples/github-repositories/fixture.html` | `4b178224bf954c4a36a5d4156304499246e5af4a9e8f5e032785d1beadb174d9` |
| `/Users/shopme/Documents/workspace/scrapyJsChrome/examples/github-repositories/expected.json` | `8879a8e736751eb25743670483e9a2460b0d58d88a7e450fa5536f469f5d2e39` |
| `/Users/shopme/Documents/workspace/scrapyJs/examples/list-detail/callbacks.cjs` | `898907718fc54be56b133799a50c2db00c9ffc61810062d1e141697e522720b0` |
| `/Users/shopme/Documents/workspace/scrapyJs/examples/list-detail/checkpoint-lock.cjs` | `4be604e2bde73fd0e6a1ff5ad8ff0fc72c6dc5a6043606243ce2ee04b91e913f` |
| `/Users/shopme/Documents/workspace/scrapyJs/examples/list-detail/common.cjs` | `e8f8a188b536d49477053216176587b62c034f841a4ce292bfcfc6befaabaa59` |
| `/Users/shopme/Documents/workspace/scrapyJs/examples/list-detail/declarative.cjs` | `663b6390079c5e3fca63394d174e1e697c2f9ad53abbf1e70e7ced7db8cd5e0f` |
| `/Users/shopme/Documents/workspace/scrapyJs/examples/list-detail/two-phase.cjs` | `e019b2cc078e52ad0b0cab7b37190575bc039538f9c6f33b75177ad44872d2e1` |
| `/Users/shopme/Documents/workspace/scrapyJs/test/helpers/list-detail-fixture.cjs` | `43214252a9941ca6a01f9756a913b10e530dbc108010dc2dcf471527905b12f9` |
