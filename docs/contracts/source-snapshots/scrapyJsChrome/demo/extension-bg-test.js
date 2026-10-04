console.log("=".repeat(80));
console.log("🧪 Extension Background Test - Starting...");
console.log("📍 Extension version check: page.__version =", globalThis.page?.__version);
console.log("=".repeat(80));

// Test 1: Simple title test
console.log("\n[Test 1] Testing page.eval with return statement...");
const result = await page._evalWithScripting(`
    console.log("[_evalWithScripting] current title:", document.title);
    return document.title;
  `);
console.log("✓ Returned:", result);

// Test 2: Test eval with explicit return
console.log("\n[Test 2] Testing page.eval with explicit return...");
const title = await page.eval(`
    console.log("[page.eval] href:", window.location.href);
    return document.title;
  `);
console.log("✓ Returned:", title);

// Test 3: Test array return
console.log("\n[Test 3] Testing array return with explicit return...");
const logs = await page.eval(`
    const lines = [];
    console.log(123);
    lines.push("[page.eval] ready");
    document.body.dataset.evalTest = "alive";
    lines.push("[page.eval] data attribute set.");
    return lines;
  `);
console.log("✓ Returned:", logs);

// Test 4: Test expression WITHOUT return (auto-return feature)
console.log("\n[Test 4] Testing expression WITHOUT return (auto-return)...");
const autoReturnTitle = await page.eval('document.title');
console.log("✓ Auto-returned title:", autoReturnTitle);
console.log("Match:", autoReturnTitle === result ? "✅" : "❌");

// Test 5: Test selector.next() - the main fix
console.log("\n" + "=".repeat(80));
console.log("[Test 5] Testing selector.next() - THE MAIN FIX");
console.log("=".repeat(80));

// First check if selector exists
const selectorExists = await page.eval(`
  typeof window.selector !== 'undefined' && typeof window.selector.next === 'function'
`);
console.log("📌 Selector exists:", selectorExists);

if (selectorExists) {
  console.log("\n🔍 Testing selector.next() WITHOUT explicit return...");
  const resultWithoutReturn = await page.eval('selector.next()');
  console.log("Result:", resultWithoutReturn);
  
  if (resultWithoutReturn === null || resultWithoutReturn === undefined) {
    console.error("❌ FAILED: Still returning null/undefined!");
    console.error("⚠️  The fix is NOT working. Check:");
    console.error("   1. Did you reload the extension? (chrome://extensions)");
    console.error("   2. Check console for [PageShim] version logs");
    console.error("   3. Check console for [simplePage.eval] logs");
  } else {
    console.log("✅ SUCCESS! Result contains:");
    console.log({
      selector: resultWithoutReturn?.selector,
      tableId: resultWithoutReturn?.tableId,
      itemCount: resultWithoutReturn?.itemCount,
      dataLength: resultWithoutReturn?.data?.length
    });
  }
  
  console.log("\n🔍 Testing selector.next() WITH explicit return (should also work)...");
  const resultWithReturn = await page.eval('return selector.next()');
  console.log("Result:", resultWithReturn);
  console.log("Match:", JSON.stringify(resultWithoutReturn) === JSON.stringify(resultWithReturn) ? "✅" : "⚠️");
  
} else {
  console.log("⚠️  window.selector not available on this page");
  console.log("💡 To test selector.next():");
  console.log("   1. Navigate to a page with list content (e.g., search results)");
  console.log("   2. Open the extension popup to initialize selector");
  console.log("   3. Then run this test again");
}

console.log("\n" + "=".repeat(80));
console.log("🎯 Test suite completed!");
console.log("=".repeat(80));

  async function testInject() {
    // 找到最近的非扩展页标签
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
      url: ["http://*/*", "https://*/*"]
    });

    if (!tab) {
      console.warn("找不到可用的页面标签");
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: () => {
        console.log("[TestInjection] 通过 chrome.scripting 执行成功");
        if (window.selector) {
          console.log("[TestInjection] selector.next() 返回值：", window.selector.next());
        } else {
          console.log("[TestInjection] 页面上还没有 window.selector");
        }
      },
    });
  }

  // 例如点击扩展图标时触发
  chrome.action.onClicked.addListener(() => {
    testInject().catch(err => console.error("注入测试失败:", err));
  });


