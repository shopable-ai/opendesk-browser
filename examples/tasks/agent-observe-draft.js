// AI / Codex observation-only draft for the existing demo-form.html.
// Use the same real RunHost / Controller through Sidebar or Native Agent.
// No click, fill, navigation, external network, task publication, or credential collection.
async function main() {
  const observation = await page.observe({
    root:'#search-form',
    maxDepth:5,
    maxNodes:32,
    maxChars:4200
  });
  return {
    kind:'opendesk.agent-observation.v1',
    url:await page.url(),
    observation
  };
}
