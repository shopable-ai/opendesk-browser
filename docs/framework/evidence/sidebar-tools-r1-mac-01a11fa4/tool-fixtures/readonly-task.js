async function main() {
  await new Promise(resolve=>setTimeout(resolve,10000));
  return {title:await page.title(),url:await page.url()};
}
