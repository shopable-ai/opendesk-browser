// This is OpenDesk's controlled Page API, not a Node browser driver.
export async function readSummary(page) {
  return {version:1,title:await page.title()};
}
