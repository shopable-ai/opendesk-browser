// Run as a read-only draft through the existing Sidebar/RunHost or optional Native Agent.
// This is NOT a Task verification or an Agent E2E receipt.
async function main() {
  const observed = await page.observe({
    root:'#search-form',maxDepth:5,maxNodes:32,maxChars:4200
  });
  return {kind:observed.kind,document:observed.document,
    truncated:observed.truncated,budget:observed.budget,nodes:observed.nodes};
}
