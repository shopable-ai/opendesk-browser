// Built-in, reviewed package identity. This exact SHA-256 is over the
// canonical UTF-8 .opendesk-tool.json bytes, not the package's claimed ID.
// Release promotion must update this pin and pass the official builder test.
export const MARKET_PROVENANCE_STORE='opendesk.market.provenance.v1';
export const READING_TOC_CHROME_ACCESS_PROTOCOL='opendesk.reading-toc.chrome-access.v1';
export const OFFICIAL_READING_TOC_RELEASE=Object.freeze({
  id:'reading-toc',marketId:'opendesk/reading-toc',version:'1.0.14',
  sha256:'b8167831c996c1c7f68f9c5b5e9ff00d54eca145a0d5034c54d3c544f626a96f'
});
// Preserve previously reviewed canonical releases, including 1.0.10 from
// cb1643a66f8a7d588b301cd38e2fd2c5ce6d5cb2 (35,044 UTF-8 bytes).
// The current pin above still owns builder promotion.
export const OFFICIAL_READING_TOC_RELEASES=Object.freeze([
  OFFICIAL_READING_TOC_RELEASE,
  Object.freeze({
    id:'reading-toc',marketId:'opendesk/reading-toc',version:'1.0.13',
    sha256:'25990193f052831035d8f1f4383a2ce1ddb86a1e07f0906db1aa31deec245f34'
  }),
  Object.freeze({
    id:'reading-toc',marketId:'opendesk/reading-toc',version:'1.0.12',
    sha256:'8f1f3ec7fda6417f3c971bea30cf11493492c528f476c584ef755e600f2df84a'
  }),
  Object.freeze({
    id:'reading-toc',marketId:'opendesk/reading-toc',version:'1.0.11',
    sha256:'dcf2bafe89556b4ab4c39733519037e5f7437669a869d0f0c7d6cf60daba2ed4'
  }),
  Object.freeze({
    id:'reading-toc',marketId:'opendesk/reading-toc',version:'1.0.10',
    sha256:'8d6bf170c92f3093de34f1401f49897d9734f740a0deef87076666a548cc39f0'
  })
]);
export function matchesOfficialReadingToc(tool,provenance,hash){
  return OFFICIAL_READING_TOC_RELEASES.some(pin=>{
    const source=provenance?.[pin.id];
    return Boolean(tool?.id===pin.id&&tool.version===pin.version&&
      tool.capabilities?.includes('page.toc')&&hash===pin.sha256&&
      source&&typeof source==='object'&&!Array.isArray(source)&&
      Object.keys(source).length===3&&source.marketId===pin.marketId&&
      source.version===pin.version&&source.sha256===pin.sha256);
  });
}
