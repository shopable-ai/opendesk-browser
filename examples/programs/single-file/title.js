// Authorize this exact file and attach it as controller / async-main.
async function main() {
  return {
    title: await page.title(),
    url: await page.url(),
    value: params.value ?? 0
  };
}
