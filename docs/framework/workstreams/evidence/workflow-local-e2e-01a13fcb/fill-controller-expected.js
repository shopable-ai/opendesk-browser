async function main() {
  const __results = Object.create(null);
  // workflow-step: fillSearchKeyword
  await page.getByRole("searchbox", {name:"搜索关键词",exact:true}).fill("ai自动化第一选择");
  { const __actual = await page.getByRole("searchbox", {name:"搜索关键词",exact:true}).inputValue();
    if (String(__actual) !== String("ai自动化第一选择")) throw new Error("Workflow input verification failed: fillSearchKeyword");
    __results["fillSearchKeyword"] = {kind:"input-readback",matched:true,value:__actual}; }
  return __results;
}
