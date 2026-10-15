// GENERATED for developer use; never import into the MV3 runtime.
// Authority: docs/api/browser-sdk-interface-matrix.json + browser-contract.js
export interface OpenDeskBrowserSdk {
  readonly apiVersion: string;
  readonly bookmarks: {
    readonly create: (input: { readonly index?: number; readonly parentId?: string; readonly sourcePage?: { readonly documentRef: string; readonly tabRef: string; readonly url: string; }; readonly title: string; readonly url?: string; }) => Promise<{ readonly dateAdded?: number; readonly dateGroupModified?: number; readonly folderType?: string; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly syncing?: boolean; readonly title: string; readonly unmodifiable?: string; readonly url?: string; }>;
    readonly createOwned: (input: { readonly parentRef?: string; readonly title?: string; readonly url: string; }) => Promise<{ readonly bookmarkRef: string; }>;
    readonly get: (input: { readonly id: string; }) => Promise<Array<{ readonly dateAdded?: number; readonly dateGroupModified?: number; readonly folderType?: string; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly syncing?: boolean; readonly title: string; readonly unmodifiable?: string; readonly url?: string; }>>;
    readonly getTree: (input?: { readonly cursor?: string; readonly limit?: number; }) => Promise<{ readonly nextCursor?: string; readonly nodes: Array<{ readonly dateAdded?: number; readonly dateGroupModified?: number; readonly folderType?: string; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly syncing?: boolean; readonly title: string; readonly unmodifiable?: string; readonly url?: string; }>; readonly snapshotRef: string; }>;
    readonly move: (input: { readonly destination: { readonly index?: number; readonly parentId: string; }; readonly expected: { readonly folderType: string | null; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly title: string; readonly unmodifiable: string | null; readonly url: string | null; }; readonly id: string; }) => Promise<{ readonly dateAdded?: number; readonly dateGroupModified?: number; readonly folderType?: string; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly syncing?: boolean; readonly title: string; readonly unmodifiable?: string; readonly url?: string; }>;
    readonly observe: {
      readonly read: (input: { readonly cursor?: string; readonly limit?: number; readonly sessionRef: string; }) => Promise<{ readonly droppedCount: number; readonly events: Array<{ readonly details?: { readonly [key: string]: unknown; }; readonly id?: string; readonly kind: "created" | "removed" | "changed" | "moved" | "childrenReordered" | "importBegan" | "importEnded"; readonly seq: number; readonly timestamp: number; }>; readonly expiresAt: number; readonly gapCount: number; readonly nextCursor: string; }>;
      readonly start: (input?: { readonly durationMs?: number; readonly maxEvents?: number; }) => Promise<{ readonly cursor: string; readonly expiresAt: number; readonly sessionRef: string; }>;
      readonly stop: (input: { readonly sessionRef: string; }) => Promise<{ readonly stopped: boolean; }>;
    };
    readonly prepareRemoveTree: (input: { readonly descendantCount: number; readonly expected: { readonly folderType: string | null; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly title: string; readonly unmodifiable: string | null; readonly url: string | null; }; readonly id: string; readonly snapshotRef: string; }) => Promise<{ readonly descendantCount: number; readonly expiresAt: number; readonly targetId: string; readonly ticket: string; }>;
    readonly remove: (input: { readonly expected: { readonly folderType: string | null; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly title: string; readonly unmodifiable: string | null; readonly url: string | null; }; readonly id: string; }) => Promise<{ readonly removed: boolean; }>;
    readonly removeOwned: (input: { readonly bookmarkRef: string; }) => Promise<{ readonly removed: boolean; }>;
    readonly removeTree: (input: { readonly id: string; readonly ticket: string; }) => Promise<{ readonly removed: boolean; }>;
    readonly search: (input?: { readonly cursor?: string; readonly limit?: number; readonly query?: string | { readonly query?: string; readonly title?: string; readonly url?: string; }; }) => Promise<{ readonly nextCursor?: string; readonly nodes: Array<{ readonly dateAdded?: number; readonly dateGroupModified?: number; readonly folderType?: string; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly syncing?: boolean; readonly title: string; readonly unmodifiable?: string; readonly url?: string; }>; readonly snapshotRef: string; }>;
    readonly update: (input: { readonly changes: { readonly title?: string; readonly url?: string; }; readonly expected: { readonly folderType: string | null; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly title: string; readonly unmodifiable: string | null; readonly url: string | null; }; readonly id: string; }) => Promise<{ readonly dateAdded?: number; readonly dateGroupModified?: number; readonly folderType?: string; readonly id: string; readonly index: number | null; readonly parentId: string | null; readonly syncing?: boolean; readonly title: string; readonly unmodifiable?: string; readonly url?: string; }>;
  };
  readonly capabilities: {
    readonly getStatus: (input: { readonly operation: string; readonly url?: string; }) => Promise<{ readonly apiVersion?: string; readonly authorization?: { readonly browser: string; readonly site: string; readonly tool: string; }; readonly callableNow: boolean; readonly exposure?: string; readonly implementation?: string; readonly nextAction?: string | null; readonly operation: string; readonly platform?: string; readonly reasonCode: string | null; readonly requiresUserGesture?: boolean; }>;
    readonly list: (input?: {  }) => Promise<Array<{ readonly implementation: string; readonly operation: string; readonly requiredCapabilities: Array<string>; readonly requiredChromePermissions: Array<string>; readonly riskLevel: string; readonly status: { readonly callableNow: boolean; readonly exposure: string; readonly reasonCode: string | null; }; }>>;
  };
  readonly clipboard: {
    readonly writeText: (text: string) => Promise<{ readonly copied: boolean; }>;
  };
  readonly contextMenu: {
    readonly getStatus: (input?: {  }) => Promise<{ readonly activeActions: Array<string>; readonly approvedOrigins: Array<string>; readonly browserPermission: boolean; readonly enabled: boolean; }>;
    readonly register: (input: { readonly actionIds: Array<string>; }) => Promise<{ readonly actionIds: Array<string>; readonly registered: boolean; }>;
    readonly unregister: (input?: {  }) => Promise<{ readonly actionIds: Array<string>; readonly registered: boolean; }>;
  };
  readonly cookies: {
    readonly clearSite: (input: { readonly expectedCount?: number; readonly maxCookies?: number; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly preview?: boolean; readonly previewRef?: string; readonly storeId?: string; readonly url: string; }) => Promise<{ readonly matched: number; readonly preview: boolean; readonly previewRef?: string; readonly remaining: number; readonly removed: number; readonly scope: string; }>;
    readonly get: (input: { readonly domain?: string; readonly includeValues?: boolean; readonly name: string; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly path?: string; readonly storeId?: string; readonly url: string; }) => Promise<{ readonly cookie: { readonly domain: string; readonly expirationDate?: number; readonly hostOnly?: boolean; readonly httpOnly?: boolean; readonly name: string; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly path: string; readonly sameSite?: "unspecified" | "lax" | "strict" | "no_restriction"; readonly secure?: boolean; readonly session?: boolean; readonly storeId?: string; readonly value?: string; readonly valueRedacted: boolean; } | null; readonly scope: string; }>;
    readonly getAll: (input: { readonly includeValues?: boolean; readonly name?: string; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly storeId?: string; readonly url: string; }) => Promise<Array<{ readonly domain: string; readonly expirationDate?: number; readonly hostOnly?: boolean; readonly httpOnly?: boolean; readonly name: string; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly path: string; readonly sameSite?: "unspecified" | "lax" | "strict" | "no_restriction"; readonly secure?: boolean; readonly session?: boolean; readonly storeId?: string; readonly value?: string; readonly valueRedacted: boolean; }>>;
    readonly getCurrentStore: (input: { readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly storeId?: string; readonly url: string; }) => Promise<{ readonly storeId: string; }>;
    readonly getPartitionKey: (input: { readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly storeId?: string; readonly url: string; }) => Promise<{ readonly partitionKey: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; }>;
    readonly observe: {
      readonly getStatus: (input: { readonly sessionRef: string; readonly url: string; }) => Promise<{ readonly bufferedCount: number; readonly droppedCount: number; readonly expiresAt: number; readonly sessionRef: string; readonly status: string; }>;
      readonly read: (input: { readonly cursor?: string; readonly limit?: number; readonly sessionRef: string; readonly url: string; }) => Promise<{ readonly droppedCount: number; readonly events: Array<{ readonly at: number; readonly cause: string; readonly domain: string; readonly name: string; readonly path: string; readonly removed: boolean; readonly seq: number; }>; readonly expiresAt: number; readonly gapCount: number; readonly nextCursor: string; readonly sessionRef: string; }>;
      readonly start: (input: { readonly durationMs?: number; readonly maxEvents?: number; readonly url: string; }) => Promise<{ readonly expiresAt: number; readonly sessionRef: string; readonly status: string; }>;
      readonly stop: (input: { readonly sessionRef: string; readonly url: string; }) => Promise<{ readonly stopped: boolean; }>;
    };
    readonly remove: (input: { readonly domain: string; readonly name: string; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly path: string; readonly storeId?: string; readonly url: string; }) => Promise<{ readonly removed: boolean; readonly verified: boolean; }>;
    readonly set: (input: { readonly domain?: string; readonly expirationDate?: number; readonly httpOnly?: boolean; readonly name: string; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly path?: string; readonly sameSite?: string; readonly secure?: boolean; readonly storeId?: string; readonly url: string; readonly value: string; }) => Promise<{ readonly cookie?: { readonly domain: string; readonly expirationDate?: number; readonly hostOnly?: boolean; readonly httpOnly?: boolean; readonly name: string; readonly partitionKey?: { readonly hasCrossSiteAncestor?: boolean; readonly topLevelSite: string; }; readonly path: string; readonly sameSite?: "unspecified" | "lax" | "strict" | "no_restriction"; readonly secure?: boolean; readonly session?: boolean; readonly storeId?: string; readonly value?: string; readonly valueRedacted: boolean; }; readonly saved: boolean; readonly verified: boolean; }>;
  };
  readonly downloads: {
    readonly cancelOwned: (input: { readonly downloadRef: string; }) => Promise<{ readonly cancelled: boolean; }>;
    readonly download: (input: { readonly filename?: string; readonly saveAs?: boolean; readonly url: string; }) => Promise<{ readonly downloadRef: string; readonly status: "started"; }>;
    readonly getOwned: (input: { readonly downloadRef: string; }) => Promise<{ readonly bytesReceived: number; readonly downloadRef: string; readonly state: "in_progress" | "complete" | "interrupted"; readonly totalBytes?: number; }>;
    readonly listOwned: (input?: { readonly cursor?: string; readonly limit?: number; }) => Promise<{ readonly items: Array<{ readonly downloadRef: string; readonly state: "in_progress" | "complete" | "interrupted"; }>; readonly nextCursor?: string; }>;
    readonly text: (input: { readonly filename: string; readonly text: string; }) => Promise<{ readonly started: boolean; }>;
  };
  readonly events: {
    readonly close: (input: { readonly sessionRef: string; }) => Promise<{ readonly closed: boolean; }>;
    readonly read: (input: { readonly cursor?: string; readonly limit?: number; readonly sessionRef: string; }) => Promise<{ readonly droppedCount: number; readonly events: Array<{ readonly error?: string; readonly kind: "request" | "completed" | "failed"; readonly method: string; readonly origin: string; readonly resourceType: string; readonly seq: number; readonly statusCode?: number; readonly timestamp: number; }>; readonly gapCount: number; readonly nextCursor?: string | null; }>;
  };
  readonly i18n: {
    readonly detectLanguage: (input: { readonly text: string; }) => Promise<{ readonly isReliable: boolean; readonly languages: Array<{ readonly language: string; readonly percentage: number; }>; }>;
    readonly getAcceptLanguages: (input?: {  }) => Promise<Array<string>>;
  };
  readonly launch: {
    readonly consume: (input?: {  }) => Promise<{ readonly actionId: string; readonly expiresAt: number; readonly linkUrl?: string | null; readonly selection: string; readonly source: {  }; readonly ticketId: string; readonly toolId: string; }>;
  };
  readonly network: {
    readonly observe: {
      readonly export: (input: { readonly format: "json"; readonly observationId: string; }) => Promise<{ readonly bytes: number; readonly status: "started"; readonly truncated: boolean; }>;
      readonly getStatus: (input: { readonly observationId: string; }) => Promise<{ readonly droppedCount: number; readonly expiresAt: number; readonly gapCount: number; readonly observedCount: number; readonly state: string; }>;
      readonly start: (input: { readonly durationMs?: number; readonly maxBufferedBytes?: number; readonly maxEvents?: number; readonly origins: Array<string>; readonly tabRef: string; }) => Promise<{ readonly expiresAt: number; readonly observationId: string; readonly operationId: string; readonly status: string; }>;
      readonly stop: (input: { readonly observationId: string; }) => Promise<{ readonly state: string; readonly stoppedAt: number; }>;
    };
    readonly request: (input: { readonly config?: { readonly responseType?: "json" | "text"; readonly timeout?: number; }; readonly data?: unknown; readonly method: "GET" | "POST" | "PUT" | "DELETE"; readonly url: string; }) => Promise<{ readonly data?: unknown; readonly status: number; }>;
  };
  readonly operations: {
    readonly cancel: (input: { readonly operationId: string; }) => Promise<{ readonly cancelRequested?: boolean; readonly state: "running" | "completed" | "failed" | "cancelled" | "unknown"; }>;
    readonly getStatus: (input: { readonly operationId: string; }) => Promise<{ readonly state: "running" | "completed" | "failed" | "cancelled" | "unknown"; }>;
  };
  readonly page: {
    readonly getContext: (input?: {  }) => Promise<{ readonly documentRef?: string; readonly message?: string; readonly status: "available" | "unavailable"; readonly tabRef?: string; readonly title?: string; readonly url?: string; }>;
    readonly getSelection: (input?: {  }) => Promise<{ readonly selection: string; readonly ticketId: string; }>;
  };
  readonly runtime: {
    readonly getPlatformInfo: (input?: {  }) => Promise<{ readonly arch: string; readonly "nacl_arch"?: string; readonly os: string; }>;
  };
  readonly scheduler: {
    readonly cancelOwn: (input: { readonly scheduleRef: string; }) => Promise<{ readonly cancelled: boolean; }>;
    readonly create: (input: { readonly revision: string; readonly schedule: { readonly expression: string; readonly kind: string; }; readonly taskId: string; }) => Promise<{ readonly scheduleRef: string; readonly status: "active" | "pending"; }>;
    readonly listOwn: (input?: {  }) => Promise<{ readonly schedules: Array<{ readonly scheduleRef: string; readonly status: string; readonly taskId: string; }>; }>;
  };
  readonly screenshot: {
    readonly captureVisible: (input: { readonly tabRef: string; }) => Promise<{ readonly bytes: number; readonly height: number; readonly status: "started"; readonly width: number; }>;
  };
  readonly sidePanel: {
    readonly openSelf: (input?: {  }) => Promise<{ readonly opened: boolean; }>;
  };
  readonly storage: {
    readonly local: {
      readonly clear: (input: { readonly confirm: true; }) => Promise<{ readonly removed: number; }>;
      readonly get: (input?: { readonly keys?: Array<string>; }) => Promise<{ readonly items: { readonly [key: string]: unknown; }; }>;
      readonly getQuota: (input?: {  }) => Promise<{ readonly keyCount: number; readonly maxBytes: number; readonly maxItemBytes: number; readonly maxKeys: number; readonly usedBytes: number; }>;
      readonly keys: (input?: {  }) => Promise<{ readonly keys: Array<string>; }>;
      readonly remove: (input: { readonly keys: Array<string>; }) => Promise<{ readonly removed: number; }>;
      readonly set: (input: { readonly items: { readonly [key: string]: unknown; }; }) => Promise<{ readonly written: number; }>;
    };
  };
  readonly tabs: {
    readonly activateOwned: (input: { readonly tabRef: string; }) => Promise<{ readonly focused: boolean; }>;
    readonly create: (input: { readonly url: string; }) => Promise<{ readonly tabRef: string; }>;
    readonly getOwned: (input: { readonly tabRef: string; }) => Promise<{ readonly expiresAt: number; readonly origin: string; readonly tabRef: string; readonly url: string; }>;
    readonly listOwned: (input?: {  }) => Promise<{ readonly tabs: Array<{ readonly origin: string; readonly tabRef: string; }>; }>;
    readonly navigateOwned: (input: { readonly tabRef: string; readonly url: string; }) => Promise<{ readonly navigationRequested: boolean; readonly tabRefRevoked: boolean; }>;
    readonly pinOwned: (input: { readonly pinned: boolean; readonly tabRef: string; }) => Promise<{ readonly pinned: boolean; }>;
    readonly reloadOwned: (input: { readonly tabRef: string; }) => Promise<{ readonly reloadRequested: boolean; readonly tabRefRevoked: boolean; }>;
    readonly removeOwned: (input: { readonly tabRef: string; }) => Promise<{ readonly closed: boolean; }>;
  };
}
export interface OpenDeskDeveloperSdk {
  readonly browser: OpenDeskBrowserSdk;
}
// Available only inside an installed Sidebar tool; not the Page SDK.
declare global {
  const OpenDeskSDK: OpenDeskDeveloperSdk;
}
