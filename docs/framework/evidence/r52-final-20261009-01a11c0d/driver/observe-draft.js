async function main() {
  const full = await page.observe({root:'#search-form',maxDepth:5,maxNodes:80,maxChars:8000});
  const small = await page.observe({maxNodes:1,maxChars:256});
  return {full,small};
}
