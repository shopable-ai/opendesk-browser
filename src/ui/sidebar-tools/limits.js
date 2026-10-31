// Bounded product budgets shared by package, transport and sandbox consumers.
// Source bytes are UTF-8; field lengths are UTF-16 code units. Neither grants authority.
export const SIDEBAR_TOOL_LIMITS=Object.freeze({
  packageBytes:2*1024*1024,
  js:1024*1024,
  buildSourceFiles:64,
  html:64000,
  css:120000,
  nativeChunkBytes:24000 // Base64 <= 32,000 bytes, below Native files.read's 32 KiB cap.
});
