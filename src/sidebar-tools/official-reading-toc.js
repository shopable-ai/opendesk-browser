// Built-in, reviewed package identity. This exact SHA-256 is over the
// canonical UTF-8 .opendesk-tool.json bytes, not the package's claimed ID.
// Release promotion must update this pin and pass the official builder test.
export const MARKET_PROVENANCE_STORE='opendesk.market.provenance.v1';
export const READING_TOC_CHROME_ACCESS_PROTOCOL='opendesk.reading-toc.chrome-access.v1';
export const OFFICIAL_READING_TOC_RELEASE=Object.freeze({
  id:'reading-toc',marketId:'opendesk/reading-toc',version:'1.0.9',
  sha256:'56890b9feeb6908c5967eb16aed19a1e811f8d376dd270c01e78c0c93b052071'
});
export function matchesOfficialReadingToc(tool,provenance,hash){
  const pin=OFFICIAL_READING_TOC_RELEASE;
  const source=provenance?.[pin.id];
  return Boolean(tool?.id===pin.id&&tool.version===pin.version&&
    tool.capabilities?.includes('page.toc')&&hash===pin.sha256&&
    source&&typeof source==='object'&&!Array.isArray(source)&&
    Object.keys(source).length===3&&source.marketId===pin.marketId&&
    source.version===pin.version&&source.sha256===pin.sha256);
}
