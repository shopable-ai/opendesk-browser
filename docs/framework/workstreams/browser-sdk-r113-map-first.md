# Browser SDK R11.3 implementation

Owner: SDK map-first session 2026-10-15, main only. State: IN_PROGRESS.
Baseline: 8dc346e0432e11115862b39614b2d46a04f5cebb.
Scope: existing binding generator, compiled DIRECT descriptors, common schema validator,
package capability admission, related tests and existing matrix/ledgers.
Shared Host and sidebar-tools.js: read-only unless a demonstrated generic defect requires a change.
Bookmark UI, legacy removal and current-page reference implementation already exist; reuse them.
Resources: this checkout only; no Mac, Chrome profile, watcher or other dist writer.
Baseline Node: R11, R112 Full Bookmarks and R124 current-page suites 37/37 PASS.
First batch: platform metadata and language detection/preferences; bounded read-only
Promise APIs, explicit installed-tool capabilities, no new Chrome manifest permissions.
Native: NOT_TESTED. Existing Node/build evidence must not be elevated to native.

## Implemented

- First production DIRECT batch: browser.runtime.getPlatformInfo,
  browser.i18n.getAcceptLanguages, browser.i18n.detectLanguage. Explicit capabilities
  browser.runtime/browser.i18n; no new Chrome permissions. Chrome Promise minimum 99;
  supported product minimum remains 138. Sources: pinned Chromium matrix rows and
  https://developer.chrome.com/docs/extensions/reference/api/runtime and
  https://developer.chrome.com/docs/extensions/reference/api/i18n.
- Generator bootstraps new approved runtime rows before count validation; requires
  explicit read effect. Same generated descriptor feeds Registry, Schema, facade
  and original installed-tool Host. No per-method Host branch or wrapper added.
- Dispatcher enforces declared output Schema after byte budget and authorization
  recheck; input validator reused. Missing Chrome API rejects, no fallback RPC.
- Capability discovery and existing acceptance tool now admit valid namespace digits
  (i18n); acceptance package 11.3.0 explicitly requests its new capabilities.
- 70 approved contracts: 68 public, 2 trusted Host-only. Public mapping:
  DIRECT 3 / SCOPED 49 / EXISTING_SERVICE 11 / COMPOSED 5.
- Historical 114 candidates: 23 promoted by exact name, 91 pending names classified
  in the existing matrix and projected to the existing four-layer ledger.
  39 service / 24 scoped / 3 composed / 1 direct candidate / 20 Host-only / 4 denied.
  13 names have an existing canonical target with explicitly restricted semantics.
  159 current/historical names are not 159 new native methods or a completion rate.

## Bookmark handoff

Latest parallel change a2be6815ad1f58907b10da1dc31df738b1bcacce was fast-forwarded
without overlapping our files. Bookmark package is now 0.3.1. Reused the other
owner's refresh/ticket/write-fence changes; did not recreate UI or legacy business.

Full methods getTree/get/search/create/update/move/remove/prepareRemoveTree/removeTree/
observe.start/observe.read/observe.stop remain source wired. Full capability is
browser.bookmarks.full; owned createOwned/removeOwned retain browser.bookmarks.
Current page is the existing page.getContext() -> {status,title,url,tabRef,documentRef};
create({title,url,parentId?,sourcePage:{url,tabRef,documentRef}}) revalidates the
opaque current-document references in Host. They never grant Owned Tab rights.
Existing probe() gates tree reading on getTree authorization, not write intent.
No consumer contract change is required from this SDK batch. Other owner retains
Bookmark UI/installation/native product acceptance. Legacy src/bookmark-manager is
already deleted in baseline; no duplicate business was restored.

## Verification in this checkout

Before parallel integration: 425/425 SDK/consumer/Host tests; targeted CI subset
124/124; native driver prepare 1/1 (preparation only, not native).
After a2be681 integration: 437/437 SDK/consumer/Host tests. Source and builds are
being rechecked against the integrated input. All native APIs use fixtures in Node.
Production/development source input hashes, raw logs, failures and package hashes
will be retained in the evidence directory; status promotion requires that evidence.
One integrated production attempt was blocked by this checkout's completed build
PID lock; no active owner existed. Saved stale lock before removing it, then normal
output-guard acquisition/build succeeded. No other checkout or watcher was stopped.

Mac Chrome, real installed sender/gesture, permission UX, all-method native proof,
product score and independent expert scores: NOT_TESTED / NOT_SCORED.
Remaining SDK batches follow each matrix candidate's explicit nextStep; Bookmark
product release and Issue #75 remain open pending real Chrome evidence.
