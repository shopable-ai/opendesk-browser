// Receipt structure and Native transport bounds. Package/source byte size is
// not a product limit; these bounds do not grant authority.
export const SIDEBAR_TOOL_LIMITS=Object.freeze({
  buildSourceFiles:64,
  nativeChunkBytes:24000 // Base64 <= 32,000 bytes, below Native files.read's 32 KiB cap.
});
