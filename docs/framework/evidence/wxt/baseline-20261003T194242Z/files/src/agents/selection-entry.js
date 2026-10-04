// Fixed classic entry reserved for03. Never claims selection has completed.
Object.defineProperty(globalThis, '__openDeskSelectionSlot', {configurable: true, value: Object.freeze({
  status: 'MODULE_NOT_INSTALLED', scope: 'static-slot-only', selectionImplemented: false
})});
