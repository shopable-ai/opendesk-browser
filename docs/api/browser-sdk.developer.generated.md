# OpenDesk Browser SDK — generated API reference

> Generated from the existing approved matrix, compiled Binding catalog and live SDK Registry.
> A method name in this document never grants permission to an installed tool.

## OpenDeskSDK.browser.bookmarks.create

- Signature: `(input: { readonly index?: number; readonly parentId?: string; readonly sourcePage?: { readonly documentRef: string; readonly tabRef: string; readonly url: string; }; readonly title: string; readonly url?: string; }) => Promise<{ readonly dateAdded?: number; readonly dateGroupModified?: number; readonly folderType?: string; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly syncing?: boolean; readonly title: string; readonly unmodifiable?: string; readonly url?: string; }>`
- Mode: SCOPED; native: `chrome.bookmarks.create`
- Capabilities: `browser.bookmarks.full`; Chrome permissions: `bookmarks`
- Scope: all-bookmarks; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.bookmarks.createOwned

- Signature: `(input: { readonly parentRef?: string; readonly title?: string; readonly url: string; }) => Promise<{ readonly bookmarkRef: string; }>`
- Mode: SCOPED; native: `chrome.bookmarks.create`
- Capabilities: `browser.bookmarks`; Chrome permissions: `bookmarks`
- Scope: exact selected URL; trusted confirmation; tool-owned bookmark mapping; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.bookmarks.get

- Signature: `(input: { readonly id: string; }) => Promise<Array<{ readonly dateAdded?: number; readonly dateGroupModified?: number; readonly folderType?: string; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly syncing?: boolean; readonly title: string; readonly unmodifiable?: string; readonly url?: string; }>>`
- Mode: SCOPED; native: `chrome.bookmarks.get`
- Capabilities: `browser.bookmarks.full`; Chrome permissions: `bookmarks`
- Scope: all-bookmarks; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.bookmarks.getTree

- Signature: `(input?: { readonly cursor?: string; readonly limit?: number; }) => Promise<{ readonly nextCursor?: string; readonly nodes: Array<{ readonly dateAdded?: number; readonly dateGroupModified?: number; readonly folderType?: string; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly syncing?: boolean; readonly title: string; readonly unmodifiable?: string; readonly url?: string; }>; readonly snapshotRef: string; }>`
- Mode: SCOPED; native: `chrome.bookmarks.getTree`
- Capabilities: `browser.bookmarks.full`; Chrome permissions: `bookmarks`
- Scope: all-bookmarks; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.bookmarks.move

- Signature: `(input: { readonly destination: { readonly index?: number; readonly parentId: string; }; readonly expected: { readonly folderType: string | null; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly title: string; readonly unmodifiable: string | null; readonly url: string | null; }; readonly id: string; }) => Promise<{ readonly dateAdded?: number; readonly dateGroupModified?: number; readonly folderType?: string; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly syncing?: boolean; readonly title: string; readonly unmodifiable?: string; readonly url?: string; }>`
- Mode: SCOPED; native: `chrome.bookmarks.move`
- Capabilities: `browser.bookmarks.full`; Chrome permissions: `bookmarks`
- Scope: all-bookmarks; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.bookmarks.observe.read

- Signature: `(input: { readonly cursor?: string; readonly limit?: number; readonly sessionRef: string; }) => Promise<{ readonly droppedCount: number; readonly events: Array<{ readonly details?: { readonly [key: string]: unknown; }; readonly id?: string; readonly kind: "created" | "removed" | "changed" | "moved" | "childrenReordered" | "importBegan" | "importEnded"; readonly seq: number; readonly timestamp: number; }>; readonly expiresAt: number; readonly gapCount: number; readonly nextCursor: string; }>`
- Mode: SCOPED; native: existing trusted service
- Capabilities: `browser.bookmarks.full`; Chrome permissions: `bookmarks`
- Scope: all-bookmarks; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.bookmarks.observe.start

- Signature: `(input?: { readonly durationMs?: number; readonly maxEvents?: number; }) => Promise<{ readonly cursor: string; readonly expiresAt: number; readonly sessionRef: string; }>`
- Mode: SCOPED; native: `chrome.bookmarks.onCreated`, `chrome.bookmarks.onRemoved`, `chrome.bookmarks.onChanged`, `chrome.bookmarks.onMoved`, `chrome.bookmarks.onChildrenReordered`, `chrome.bookmarks.onImportBegan`, `chrome.bookmarks.onImportEnded`
- Capabilities: `browser.bookmarks.full`; Chrome permissions: `bookmarks`
- Scope: all-bookmarks; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.bookmarks.observe.stop

- Signature: `(input: { readonly sessionRef: string; }) => Promise<{ readonly stopped: boolean; }>`
- Mode: SCOPED; native: existing trusted service
- Capabilities: `browser.bookmarks.full`; Chrome permissions: `bookmarks`
- Scope: all-bookmarks; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.bookmarks.prepareRemoveTree

- Signature: `(input: { readonly descendantCount: number; readonly expected: { readonly folderType: string | null; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly title: string; readonly unmodifiable: string | null; readonly url: string | null; }; readonly id: string; readonly snapshotRef: string; }) => Promise<{ readonly descendantCount: number; readonly expiresAt: number; readonly targetId: string; readonly ticket: string; }>`
- Mode: SCOPED; native: `chrome.bookmarks.getSubTree`, `chrome.bookmarks.getTree`
- Capabilities: `browser.bookmarks.full`; Chrome permissions: `bookmarks`
- Scope: all-bookmarks; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.bookmarks.remove

- Signature: `(input: { readonly expected: { readonly folderType: string | null; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly title: string; readonly unmodifiable: string | null; readonly url: string | null; }; readonly id: string; }) => Promise<{ readonly removed: boolean; }>`
- Mode: SCOPED; native: `chrome.bookmarks.remove`
- Capabilities: `browser.bookmarks.full`; Chrome permissions: `bookmarks`
- Scope: all-bookmarks; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.bookmarks.removeOwned

- Signature: `(input: { readonly bookmarkRef: string; }) => Promise<{ readonly removed: boolean; }>`
- Mode: SCOPED; native: `chrome.bookmarks.remove`
- Capabilities: `browser.bookmarks`; Chrome permissions: `bookmarks`
- Scope: tool-created bookmark only, no global delete tree; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.bookmarks.removeTree

- Signature: `(input: { readonly id: string; readonly ticket: string; }) => Promise<{ readonly removed: boolean; }>`
- Mode: SCOPED; native: `chrome.bookmarks.removeTree`, `chrome.bookmarks.getSubTree`, `chrome.bookmarks.getTree`
- Capabilities: `browser.bookmarks.full`; Chrome permissions: `bookmarks`
- Scope: all-bookmarks; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.bookmarks.search

- Signature: `(input?: { readonly cursor?: string; readonly limit?: number; readonly query?: string | { readonly query?: string; readonly title?: string; readonly url?: string; }; }) => Promise<{ readonly nextCursor?: string; readonly nodes: Array<{ readonly dateAdded?: number; readonly dateGroupModified?: number; readonly folderType?: string; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly syncing?: boolean; readonly title: string; readonly unmodifiable?: string; readonly url?: string; }>; readonly snapshotRef: string; }>`
- Mode: SCOPED; native: `chrome.bookmarks.search`
- Capabilities: `browser.bookmarks.full`; Chrome permissions: `bookmarks`
- Scope: all-bookmarks; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.bookmarks.update

- Signature: `(input: { readonly changes: { readonly title?: string; readonly url?: string; }; readonly expected: { readonly folderType: string | null; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly title: string; readonly unmodifiable: string | null; readonly url: string | null; }; readonly id: string; }) => Promise<{ readonly dateAdded?: number; readonly dateGroupModified?: number; readonly folderType?: string; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly syncing?: boolean; readonly title: string; readonly unmodifiable?: string; readonly url?: string; }>`
- Mode: SCOPED; native: `chrome.bookmarks.update`
- Capabilities: `browser.bookmarks.full`; Chrome permissions: `bookmarks`
- Scope: all-bookmarks; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.capabilities.getStatus

- Signature: `(input: { readonly operation: string; readonly url?: string; }) => Promise<{ readonly apiVersion?: string; readonly authorization?: { readonly browser: string; readonly site: string; readonly tool: string; }; readonly callableNow: boolean; readonly exposure?: string; readonly implementation?: string; readonly nextAction?: string | null; readonly operation: string; readonly platform?: string; readonly reasonCode: string | null; readonly requiresUserGesture?: boolean; }>`
- Mode: EXISTING_SERVICE; native: existing trusted service
- Capabilities: none; Chrome permissions: none
- Scope: none; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.capabilities.list

- Signature: `(input?: {  }) => Promise<Array<{ readonly implementation: string; readonly operation: string; readonly requiredCapabilities: Array<string>; readonly requiredChromePermissions: Array<string>; readonly riskLevel: string; readonly status: { readonly callableNow: boolean; readonly exposure: string; readonly reasonCode: string | null; }; }>>`
- Mode: EXISTING_SERVICE; native: existing trusted service
- Capabilities: none; Chrome permissions: none
- Scope: none; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.clipboard.writeText

- Signature: `(text: string) => Promise<{ readonly copied: boolean; }>`
- Mode: EXISTING_SERVICE; native: existing trusted service
- Capabilities: `user.export`; Chrome permissions: none
- Scope: none; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.contextMenu.getStatus

- Signature: `(input?: {  }) => Promise<{ readonly activeActions: Array<string>; readonly approvedOrigins: Array<string>; readonly browserPermission: boolean; readonly enabled: boolean; }>`
- Mode: SCOPED; native: `chrome.contextMenus.onClicked`
- Capabilities: `browser.contextMenu`; Chrome permissions: `contextMenus`
- Scope: approved-origin; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.contextMenu.register

- Signature: `(input: { readonly actionIds: Array<string>; }) => Promise<{ readonly actionIds: Array<string>; readonly registered: boolean; }>`
- Mode: SCOPED; native: `chrome.contextMenus.create`, `chrome.contextMenus.update`
- Capabilities: `browser.contextMenu`; Chrome permissions: `contextMenus`
- Scope: approved-origin; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.contextMenu.unregister

- Signature: `(input?: {  }) => Promise<{ readonly actionIds: Array<string>; readonly registered: boolean; }>`
- Mode: SCOPED; native: `chrome.contextMenus.remove`
- Capabilities: `browser.contextMenu`; Chrome permissions: none
- Scope: approved-origin; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.cookies.clearSite

- Signature: `(input: { readonly expectedCount?: number; readonly maxCookies?: number; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly preview?: boolean; readonly previewRef?: string; readonly storeId?: string; readonly url: string; }) => Promise<{ readonly matched: number; readonly preview: boolean; readonly previewRef?: string; readonly remaining: number; readonly removed: number; readonly scope: string; }>`
- Mode: SCOPED; native: `chrome.cookies.getAll`, `chrome.cookies.remove`
- Capabilities: `browser.cookies.clear`; Chrome permissions: `cookies`
- Scope: explicit approved HTTP(S) Origin + one non-incognito Chrome store + approved partition, no active tab required for repeat reads; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.cookies.get

- Signature: `(input: { readonly domain?: string; readonly includeValues?: boolean; readonly name: string; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly path?: string; readonly storeId?: string; readonly url: string; }) => Promise<{ readonly cookie: { readonly domain: string; readonly expirationDate?: number; readonly hostOnly?: boolean; readonly httpOnly?: boolean; readonly name: string; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly path: string; readonly sameSite?: "unspecified" | "lax" | "strict" | "no_restriction"; readonly secure?: boolean; readonly session?: boolean; readonly storeId?: string; readonly value?: string; readonly valueRedacted: boolean; } | null; readonly scope: string; }>`
- Mode: SCOPED; native: `chrome.cookies.getAll`
- Capabilities: `browser.cookies.read`; Chrome permissions: `cookies`
- Scope: explicit approved HTTP(S) Origin + one non-incognito Chrome store + approved partition, no active tab required for repeat reads; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.cookies.getAll

- Signature: `(input: { readonly includeValues?: boolean; readonly name?: string; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly storeId?: string; readonly url: string; }) => Promise<Array<{ readonly domain: string; readonly expirationDate?: number; readonly hostOnly?: boolean; readonly httpOnly?: boolean; readonly name: string; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly path: string; readonly sameSite?: "unspecified" | "lax" | "strict" | "no_restriction"; readonly secure?: boolean; readonly session?: boolean; readonly storeId?: string; readonly value?: string; readonly valueRedacted: boolean; }>>`
- Mode: SCOPED; native: `chrome.cookies.getAll`
- Capabilities: `browser.cookies.read`; Chrome permissions: `cookies`
- Scope: explicit approved HTTP(S) Origin + one non-incognito Chrome store + approved partition, no active tab required for repeat reads; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.cookies.getCurrentStore

- Signature: `(input: { readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly storeId?: string; readonly url: string; }) => Promise<{ readonly storeId: string; }>`
- Mode: SCOPED; native: `chrome.cookies.getAllCookieStores`
- Capabilities: `browser.cookies.read`; Chrome permissions: `cookies`
- Scope: explicit approved HTTP(S) Origin + one non-incognito Chrome store + approved partition, no active tab required for repeat reads; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.cookies.getPartitionKey

- Signature: `(input: { readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly storeId?: string; readonly url: string; }) => Promise<{ readonly partitionKey: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; }>`
- Mode: SCOPED; native: `chrome.cookies.getPartitionKey`
- Capabilities: `browser.cookies.read`; Chrome permissions: `cookies`
- Scope: explicit approved HTTP(S) Origin + one non-incognito Chrome store + approved partition, no active tab required for repeat reads; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.cookies.observe.getStatus

- Signature: `(input: { readonly sessionRef: string; readonly url: string; }) => Promise<{ readonly bufferedCount: number; readonly droppedCount: number; readonly expiresAt: number; readonly sessionRef: string; readonly status: string; }>`
- Mode: SCOPED; native: `chrome.cookies.onChanged`
- Capabilities: `browser.cookies.observe`; Chrome permissions: `cookies`
- Scope: explicit approved HTTP(S) Origin + one non-incognito Chrome store + approved partition, no active tab required for repeat reads; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.cookies.observe.read

- Signature: `(input: { readonly cursor?: string; readonly limit?: number; readonly sessionRef: string; readonly url: string; }) => Promise<{ readonly droppedCount: number; readonly events: Array<{ readonly at: number; readonly cause: string; readonly domain: string; readonly name: string; readonly path: string; readonly removed: boolean; readonly seq: number; }>; readonly expiresAt: number; readonly gapCount: number; readonly nextCursor: string; readonly sessionRef: string; }>`
- Mode: SCOPED; native: `chrome.cookies.onChanged`
- Capabilities: `browser.cookies.observe`; Chrome permissions: `cookies`
- Scope: explicit approved HTTP(S) Origin + one non-incognito Chrome store + approved partition, no active tab required for repeat reads; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.cookies.observe.start

- Signature: `(input: { readonly durationMs?: number; readonly maxEvents?: number; readonly url: string; }) => Promise<{ readonly expiresAt: number; readonly sessionRef: string; readonly status: string; }>`
- Mode: SCOPED; native: `chrome.cookies.onChanged`, `chrome.cookies.getPartitionKey`
- Capabilities: `browser.cookies.observe`; Chrome permissions: `cookies`
- Scope: explicit approved HTTP(S) Origin + one non-incognito Chrome store + approved partition, no active tab required for repeat reads; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.cookies.observe.stop

- Signature: `(input: { readonly sessionRef: string; readonly url: string; }) => Promise<{ readonly stopped: boolean; }>`
- Mode: SCOPED; native: `chrome.cookies.onChanged`
- Capabilities: `browser.cookies.observe`; Chrome permissions: `cookies`
- Scope: explicit approved HTTP(S) Origin + one non-incognito Chrome store + approved partition, no active tab required for repeat reads; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.cookies.remove

- Signature: `(input: { readonly domain: string; readonly name: string; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly path: string; readonly storeId?: string; readonly url: string; }) => Promise<{ readonly removed: boolean; readonly verified: boolean; }>`
- Mode: SCOPED; native: `chrome.cookies.getAll`, `chrome.cookies.remove`
- Capabilities: `browser.cookies.write`; Chrome permissions: `cookies`
- Scope: explicit approved HTTP(S) Origin + one non-incognito Chrome store + approved partition, no active tab required for repeat reads; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.cookies.set

- Signature: `(input: { readonly domain?: string; readonly expirationDate?: number; readonly httpOnly?: boolean; readonly name: string; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly path?: string; readonly sameSite?: string; readonly secure?: boolean; readonly storeId?: string; readonly url: string; readonly value: string; }) => Promise<{ readonly cookie?: { readonly domain: string; readonly expirationDate?: number; readonly hostOnly?: boolean; readonly httpOnly?: boolean; readonly name: string; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly path: string; readonly sameSite?: "unspecified" | "lax" | "strict" | "no_restriction"; readonly secure?: boolean; readonly session?: boolean; readonly storeId?: string; readonly value?: string; readonly valueRedacted: boolean; }; readonly saved: boolean; readonly verified: boolean; }>`
- Mode: SCOPED; native: `chrome.cookies.set`
- Capabilities: `browser.cookies.write`; Chrome permissions: `cookies`
- Scope: explicit approved HTTP(S) Origin + one non-incognito Chrome store + approved partition, no active tab required for repeat reads; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.downloads.cancelOwned

- Signature: `(input: { readonly downloadRef: string; }) => Promise<{ readonly cancelled: boolean; }>`
- Mode: SCOPED; native: `chrome.downloads.cancel`
- Capabilities: `user.export`; Chrome permissions: `downloads`
- Scope: own in-progress download only; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.downloads.download

- Signature: `(input: { readonly filename?: string; readonly saveAs?: boolean; readonly url: string; }) => Promise<{ readonly downloadRef: string; readonly status: "started"; }>`
- Mode: SCOPED; native: `chrome.downloads.download`
- Capabilities: `user.export`; Chrome permissions: `downloads`
- Scope: explicit approved-origin URL; tool owns generated downloadRef; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.downloads.getOwned

- Signature: `(input: { readonly downloadRef: string; }) => Promise<{ readonly bytesReceived: number; readonly downloadRef: string; readonly state: "in_progress" | "complete" | "interrupted"; readonly totalBytes?: number; }>`
- Mode: SCOPED; native: `chrome.downloads.search`
- Capabilities: `user.export`; Chrome permissions: `downloads`
- Scope: own download only; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.downloads.listOwned

- Signature: `(input?: { readonly cursor?: string; readonly limit?: number; }) => Promise<{ readonly items: Array<{ readonly downloadRef: string; readonly state: "in_progress" | "complete" | "interrupted"; }>; readonly nextCursor?: string; }>`
- Mode: SCOPED; native: `chrome.downloads.search`
- Capabilities: `user.export`; Chrome permissions: `downloads`
- Scope: own downloads only; no global download history; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.downloads.text

- Signature: `(input: { readonly filename: string; readonly text: string; }) => Promise<{ readonly started: boolean; }>`
- Mode: SCOPED; native: `chrome.downloads.download`
- Capabilities: `user.export`; Chrome permissions: `downloads`
- Scope: none; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.events.close

- Signature: `(input: { readonly sessionRef: string; }) => Promise<{ readonly closed: boolean; }>`
- Mode: EXISTING_SERVICE; native: existing trusted service
- Capabilities: `browser.events`; Chrome permissions: none
- Scope: owned-session; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.events.read

- Signature: `(input: { readonly cursor?: string; readonly limit?: number; readonly sessionRef: string; }) => Promise<{ readonly droppedCount: number; readonly events: Array<{ readonly error?: string; readonly kind: "request" | "completed" | "failed"; readonly method: string; readonly origin: string; readonly resourceType: string; readonly seq: number; readonly statusCode?: number; readonly timestamp: number; }>; readonly gapCount: number; readonly nextCursor?: string | null; }>`
- Mode: EXISTING_SERVICE; native: existing trusted service
- Capabilities: `browser.events`; Chrome permissions: none
- Scope: owned-session; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.i18n.detectLanguage

- Signature: `(input: { readonly text: string; }) => Promise<{ readonly isReliable: boolean; readonly languages: Array<{ readonly language: string; readonly percentage: number; }>; }>`
- Mode: DIRECT; native: `chrome.i18n.detectLanguage`
- Capabilities: `browser.i18n`; Chrome permissions: none
- Scope: none; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.i18n.getAcceptLanguages

- Signature: `(input?: {  }) => Promise<Array<string>>`
- Mode: DIRECT; native: `chrome.i18n.getAcceptLanguages`
- Capabilities: `browser.i18n`; Chrome permissions: none
- Scope: none; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.launch.consume

- Signature: `(input?: {  }) => Promise<{ readonly actionId: string; readonly expiresAt: number; readonly linkUrl?: string | null; readonly selection: string; readonly source: {  }; readonly ticketId: string; readonly toolId: string; }>`
- Mode: EXISTING_SERVICE; native: `chrome.contextMenus.onClicked`, `chrome.webNavigation.getFrame`
- Capabilities: `browser.contextMenu`; Chrome permissions: none
- Scope: clicked-document; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.network.observe.export

- Signature: `(input: { readonly format: "json"; readonly observationId: string; }) => Promise<{ readonly bytes: number; readonly status: "started"; readonly truncated: boolean; }>`
- Mode: COMPOSED; native: `chrome.downloads.download`
- Capabilities: `browser.network.observe`; Chrome permissions: `webRequest`, `downloads`
- Scope: approved-tab; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.network.observe.getStatus

- Signature: `(input: { readonly observationId: string; }) => Promise<{ readonly droppedCount: number; readonly expiresAt: number; readonly gapCount: number; readonly observedCount: number; readonly state: string; }>`
- Mode: COMPOSED; native: `chrome.webRequest.onBeforeRequest`
- Capabilities: `browser.network.observe`; Chrome permissions: `webRequest`
- Scope: approved-tab; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.network.observe.start

- Signature: `(input: { readonly durationMs?: number; readonly maxBufferedBytes?: number; readonly maxEvents?: number; readonly origins: Array<string>; readonly tabRef: string; }) => Promise<{ readonly expiresAt: number; readonly observationId: string; readonly operationId: string; readonly status: string; }>`
- Mode: COMPOSED; native: `chrome.webRequest.onBeforeRequest`, `chrome.webRequest.onCompleted`, `chrome.webRequest.onErrorOccurred`
- Capabilities: `browser.network.observe`; Chrome permissions: `tabs`, `webNavigation`, `webRequest`
- Scope: approved-tab; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.network.observe.stop

- Signature: `(input: { readonly observationId: string; }) => Promise<{ readonly state: string; readonly stoppedAt: number; }>`
- Mode: COMPOSED; native: `chrome.webRequest.onBeforeRequest`
- Capabilities: `browser.network.observe`; Chrome permissions: `webRequest`
- Scope: approved-tab; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.network.request

- Signature: `(input: { readonly config?: { readonly responseType?: "json" | "text"; readonly timeout?: number; }; readonly data?: unknown; readonly method: "GET" | "POST" | "PUT" | "DELETE"; readonly url: string; }) => Promise<{ readonly data?: unknown; readonly status: number; }>`
- Mode: COMPOSED; native: existing trusted service
- Capabilities: `network`; Chrome permissions: none
- Scope: target-origin; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.operations.cancel

- Signature: `(input: { readonly operationId: string; }) => Promise<{ readonly cancelRequested?: boolean; readonly state: "running" | "completed" | "failed" | "cancelled" | "unknown"; }>`
- Mode: SCOPED; native: existing trusted service
- Capabilities: `browser.operations`; Chrome permissions: none
- Scope: owned-operation; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.operations.getStatus

- Signature: `(input: { readonly operationId: string; }) => Promise<{ readonly state: "running" | "completed" | "failed" | "cancelled" | "unknown"; }>`
- Mode: SCOPED; native: existing trusted service
- Capabilities: `browser.operations`; Chrome permissions: none
- Scope: owned-operation; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.page.getContext

- Signature: `(input?: {  }) => Promise<{ readonly documentRef?: string; readonly message?: string; readonly status: "available" | "unavailable"; readonly tabRef?: string; readonly title?: string; readonly url?: string; }>`
- Mode: EXISTING_SERVICE; native: existing trusted service
- Capabilities: `currentPage.read`; Chrome permissions: none
- Scope: current-page; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.page.getSelection

- Signature: `(input?: {  }) => Promise<{ readonly selection: string; readonly ticketId: string; }>`
- Mode: EXISTING_SERVICE; native: `chrome.contextMenus.onClicked`
- Capabilities: `browser.contextMenu`; Chrome permissions: none
- Scope: clicked-document; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.proxy.managed.getStatus

- Signature: `(input?: {  }) => Promise<{ readonly canStop: boolean; readonly control: "not_controllable" | "controlled_by_other_extensions" | "controllable_by_this_extension" | "controlled_by_this_extension" | "unknown"; readonly permission: boolean; readonly reason: string | null; readonly state: "enabled" | "disabled" | "unavailable" | "conflict"; }>`
- Mode: SCOPED; native: `chrome.proxy.settings`
- Capabilities: `browser.proxy.managed`; Chrome permissions: `proxy`
- Scope: browser-wide-exclusive; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.proxy.managed.requestDisable

- Signature: `(input?: {  }) => Promise<{ readonly canStop: boolean; readonly control: "not_controllable" | "controlled_by_other_extensions" | "controllable_by_this_extension" | "controlled_by_this_extension" | "unknown"; readonly permission: boolean; readonly reason: string | null; readonly state: "enabled" | "disabled" | "unavailable" | "conflict"; }>`
- Mode: SCOPED; native: `chrome.proxy.settings`
- Capabilities: `browser.proxy.managed`; Chrome permissions: `proxy`
- Scope: browser-wide-exclusive; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.proxy.managed.requestEnable

- Signature: `(input: { readonly config: { readonly domains: Array<string>; readonly endpoint: { readonly host: string; readonly port: number; readonly scheme: "https" | "socks5"; }; }; }) => Promise<{ readonly canStop: boolean; readonly control: "not_controllable" | "controlled_by_other_extensions" | "controllable_by_this_extension" | "controlled_by_this_extension" | "unknown"; readonly permission: boolean; readonly reason: string | null; readonly state: "enabled" | "disabled" | "unavailable" | "conflict"; }>`
- Mode: SCOPED; native: `chrome.proxy.settings`
- Capabilities: `browser.proxy.managed`; Chrome permissions: `proxy`
- Scope: browser-wide-exclusive; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.runtime.getPlatformInfo

- Signature: `(input?: {  }) => Promise<{ readonly arch: string; readonly "nacl_arch"?: string; readonly os: string; }>`
- Mode: DIRECT; native: `chrome.runtime.getPlatformInfo`
- Capabilities: `browser.runtime`; Chrome permissions: none
- Scope: none; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.scheduler.cancelOwn

- Signature: `(input: { readonly scheduleRef: string; }) => Promise<{ readonly cancelled: boolean; }>`
- Mode: EXISTING_SERVICE; native: `chrome.alarms.clear`
- Capabilities: `browser.scheduler`; Chrome permissions: `alarms`
- Scope: own schedule only; maintain installed task safe revoke; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.scheduler.create

- Signature: `(input: { readonly revision: string; readonly schedule: { readonly expression: string; readonly kind: string; }; readonly taskId: string; }) => Promise<{ readonly scheduleRef: string; readonly status: "active" | "pending"; }>`
- Mode: EXISTING_SERVICE; native: `chrome.alarms.create`
- Capabilities: `browser.scheduler`; Chrome permissions: `alarms`
- Scope: installed fixed task revision, explicit user grant, existing Scheduler service; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.scheduler.listOwn

- Signature: `(input?: {  }) => Promise<{ readonly schedules: Array<{ readonly scheduleRef: string; readonly status: string; readonly taskId: string; }>; }>`
- Mode: EXISTING_SERVICE; native: `chrome.alarms.getAll`
- Capabilities: `browser.scheduler`; Chrome permissions: `alarms`
- Scope: installed tool + task owner only; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.screenshot.captureVisible

- Signature: `(input: { readonly tabRef: string; }) => Promise<{ readonly bytes: number; readonly height: number; readonly status: "started"; readonly width: number; }>`
- Mode: SCOPED; native: `chrome.tabs.captureVisibleTab`, `chrome.downloads.download`
- Capabilities: `browser.screenshot`; Chrome permissions: `tabs`, `webNavigation`, `activeTab`, `downloads`
- Scope: selected-tab; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.sidePanel.openSelf

- Signature: `(input?: {  }) => Promise<{ readonly opened: boolean; }>`
- Mode: SCOPED; native: `chrome.sidePanel.open`
- Capabilities: `browser.sidePanel`; Chrome permissions: `sidePanel`
- Scope: user-gesture; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.storage.local.clear

- Signature: `(input: { readonly confirm: true; }) => Promise<{ readonly removed: number; }>`
- Mode: SCOPED; native: `chrome.storage.local.remove`
- Capabilities: `browser.storage`; Chrome permissions: `storage`
- Scope: tool-owned namespace clear ONLY (never chrome.storage.local.clear); user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.storage.local.get

- Signature: `(input?: { readonly keys?: Array<string>; }) => Promise<{ readonly items: { readonly [key: string]: unknown; }; }>`
- Mode: SCOPED; native: `chrome.storage.local.get`
- Capabilities: `browser.storage`; Chrome permissions: `storage`
- Scope: owner toolId + packageHash + installEpoch, own namespace only; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.storage.local.getQuota

- Signature: `(input?: {  }) => Promise<{ readonly keyCount: number; readonly maxBytes: number; readonly maxItemBytes: number; readonly maxKeys: number; readonly usedBytes: number; }>`
- Mode: EXISTING_SERVICE; native: `chrome.storage.local.get`
- Capabilities: `browser.storage`; Chrome permissions: `storage`
- Scope: owner toolId + packageHash + installEpoch, own namespace only; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.storage.local.keys

- Signature: `(input?: {  }) => Promise<{ readonly keys: Array<string>; }>`
- Mode: EXISTING_SERVICE; native: `chrome.storage.local.get`
- Capabilities: `browser.storage`; Chrome permissions: `storage`
- Scope: owned-storage; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.storage.local.remove

- Signature: `(input: { readonly keys: Array<string>; }) => Promise<{ readonly removed: number; }>`
- Mode: SCOPED; native: `chrome.storage.local.remove`
- Capabilities: `browser.storage`; Chrome permissions: `storage`
- Scope: tool-owned keys only; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.storage.local.set

- Signature: `(input: { readonly items: { readonly [key: string]: unknown; }; }) => Promise<{ readonly written: number; }>`
- Mode: SCOPED; native: `chrome.storage.local.set`
- Capabilities: `browser.storage`; Chrome permissions: `storage`
- Scope: per-tool quota and exact ownership; no global keys; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.tabs.activateOwned

- Signature: `(input: { readonly tabRef: string; }) => Promise<{ readonly focused: boolean; }>`
- Mode: SCOPED; native: `chrome.tabs.get`, `chrome.tabs.update`, `chrome.windows.update`
- Capabilities: `browser.tabs`; Chrome permissions: `tabs`, `webNavigation`
- Scope: tab-ref; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.tabs.create

- Signature: `(input: { readonly url: string; }) => Promise<{ readonly tabRef: string; }>`
- Mode: SCOPED; native: `chrome.tabs.create`
- Capabilities: `browser.tabs`; Chrome permissions: none
- Scope: explicit-url; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.tabs.getOwned

- Signature: `(input: { readonly tabRef: string; }) => Promise<{ readonly expiresAt: number; readonly origin: string; readonly tabRef: string; readonly url: string; }>`
- Mode: SCOPED; native: `chrome.tabs.get`, `chrome.webNavigation.getFrame`
- Capabilities: `browser.tabs`; Chrome permissions: `tabs`, `webNavigation`
- Scope: tab-ref; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.tabs.listOwned

- Signature: `(input?: {  }) => Promise<{ readonly tabs: Array<{ readonly origin: string; readonly tabRef: string; }>; }>`
- Mode: SCOPED; native: `chrome.tabs.get`, `chrome.webNavigation.getFrame`
- Capabilities: `browser.tabs`; Chrome permissions: `tabs`, `webNavigation`
- Scope: owned-tabs; user gesture: not required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.tabs.navigateOwned

- Signature: `(input: { readonly tabRef: string; readonly url: string; }) => Promise<{ readonly navigationRequested: boolean; readonly tabRefRevoked: boolean; }>`
- Mode: SCOPED; native: `chrome.tabs.get`, `chrome.tabs.update`, `chrome.webNavigation.getFrame`
- Capabilities: `browser.tabs`; Chrome permissions: `tabs`, `webNavigation`
- Scope: same-Origin own TabRef only; retire old TabRef before chrome.tabs.update({url}); never retry unknown native effect; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.tabs.pinOwned

- Signature: `(input: { readonly pinned: boolean; readonly tabRef: string; }) => Promise<{ readonly pinned: boolean; }>`
- Mode: SCOPED; native: `chrome.tabs.get`, `chrome.tabs.update`, `chrome.webNavigation.getFrame`
- Capabilities: `browser.tabs`; Chrome permissions: `tabs`, `webNavigation`
- Scope: tab-ref; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.tabs.reloadOwned

- Signature: `(input: { readonly tabRef: string; }) => Promise<{ readonly reloadRequested: boolean; readonly tabRefRevoked: boolean; }>`
- Mode: SCOPED; native: `chrome.tabs.reload`, `chrome.webNavigation.getFrame`
- Capabilities: `browser.tabs`; Chrome permissions: `tabs`, `webNavigation`
- Scope: tab-ref; tabRef retired BEFORE native reload and never revived after unknown effect; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

## OpenDeskSDK.browser.tabs.removeOwned

- Signature: `(input: { readonly tabRef: string; }) => Promise<{ readonly closed: boolean; }>`
- Mode: SCOPED; native: `chrome.tabs.get`, `chrome.tabs.remove`, `chrome.webNavigation.getFrame`
- Capabilities: `browser.tabs`; Chrome permissions: `tabs`, `webNavigation`
- Scope: tab-ref; user gesture: required
- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome

