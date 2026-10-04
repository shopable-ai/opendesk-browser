// 快速测试脚本 - 在 Service Worker 控制台中运行
// 用法: 复制整个文件内容到 Service Worker 控制台并回车

(async function quickTest() {
  console.clear();
  console.log("%c╔═══════════════════════════════════════════════════════════════════╗", "color: #00ff00; font-weight: bold");
  console.log("%c║           🚀 Quick Fix Verification Test v3.1                    ║", "color: #00ff00; font-weight: bold");
  console.log("%c╚═══════════════════════════════════════════════════════════════════╝", "color: #00ff00; font-weight: bold");
  
  let passed = 0;
  let failed = 0;
  
  function logTest(name, success, details = "") {
    if (success) {
      console.log(`%c✅ PASS%c ${name}`, "color: #00ff00; font-weight: bold", "color: inherit", details);
      passed++;
    } else {
      console.error(`%c❌ FAIL%c ${name}`, "color: #ff0000; font-weight: bold", "color: inherit", details);
      failed++;
    }
  }
  
  // Test 0: Check version
  console.log("\n%c[Test 0] Checking Page implementation version...", "color: #ffaa00; font-weight: bold");
  const version = globalThis.page?.__version;
  const implementation = globalThis.page?.__implementation || "unknown";
  console.log(`  Implementation: ${implementation}`);
  logTest("Version Check", version === 3.1, `- Version: ${version} (expected: 3.1)`);
  
  if (version !== 3.1) {
    console.error("%c⚠️  WARNING: Extension not updated to v3.1!", "color: #ff6600; font-weight: bold; font-size: 14px");
    console.error(`   Current: ${implementation} v${version || 'unknown'}`);
    console.error("   Expected: ChromePage v3.1");
    console.error("\n   📍 Steps to fix:");
    console.error("   1. Go to chrome://extensions/");
    console.error("   2. Click the REFRESH button ⟳ on your extension");
    console.error("   3. Wait 3-5 seconds");
    console.error("   4. Refresh this page");
    console.error("   5. Run this test again");
    console.error("\n   You should see: 'ChromePage.js loaded - Version 3.1' in console");
    return;
  }
  
  try {
    // Test 1: Simple expression auto-return
    console.log("\n%c[Test 1] Testing auto-return with simple expression...", "color: #ffaa00; font-weight: bold");
    const simpleResult = await page.eval('2 + 2');
    logTest("Simple Math Expression", simpleResult === 4, `- Result: ${simpleResult}`);
    
    // Test 2: Property access auto-return
    console.log("\n%c[Test 2] Testing auto-return with property access...", "color: #ffaa00; font-weight: bold");
    const titleResult = await page.eval('document.title');
    logTest("Document Title", typeof titleResult === 'string' && titleResult.length > 0, `- Title: "${titleResult}"`);
    
    // Test 3: Explicit return (backward compatibility)
    console.log("\n%c[Test 3] Testing explicit return statement...", "color: #ffaa00; font-weight: bold");
    const explicitResult = await page.eval('return document.title');
    logTest("Explicit Return", explicitResult === titleResult, `- Match: ${explicitResult === titleResult}`);
    
    // Test 4: Array return
    console.log("\n%c[Test 4] Testing array return...", "color: #ffaa00; font-weight: bold");
    const arrayResult = await page.eval('return [1, 2, 3]');
    logTest("Array Return", Array.isArray(arrayResult) && arrayResult.length === 3, `- Array: [${arrayResult}]`);
    
    // Test 5: Object return
    console.log("\n%c[Test 5] Testing object return...", "color: #ffaa00; font-weight: bold");
    const objResult = await page.eval('({a: 1, b: 2})');
    logTest("Object Return", typeof objResult === 'object' && objResult.a === 1, `- Object: ${JSON.stringify(objResult)}`);
    
    // Test 6: Function call auto-return
    console.log("\n%c[Test 6] Testing function call auto-return...", "color: #ffaa00; font-weight: bold");
    const funcResult = await page.eval('document.querySelector("body").tagName');
    logTest("Function Call", funcResult === 'BODY', `- TagName: ${funcResult}`);
    
    // Test 7: selector.next() - THE MAIN TEST
    console.log("\n%c[Test 7] Testing selector.next() - THE MAIN FIX!", "color: #ff00ff; font-weight: bold; font-size: 14px");
    
    // First check if selector exists
    const selectorExists = await page.eval('typeof selector !== "undefined" && typeof selector.next === "function"');
    
    if (!selectorExists) {
      console.warn("%c⚠️  SKIP: window.selector not available on this page", "color: #ffaa00");
      console.log("   To test selector.next():");
      console.log("   1. Navigate to a page with list content");
      console.log("   2. Open the extension popup to initialize selector");
      console.log("   3. Run this test again");
    } else {
      const selectorResult = await page.eval('selector.next()');
      const isNull = selectorResult === null || selectorResult === undefined;
      
      if (isNull) {
        console.warn("%c⚠️  selector.next() returned null", "color: #ffaa00");
        console.log("   This could mean:");
        console.log("   - No lists detected on the page (expected on some pages)");
        console.log("   - Try: await page.eval('selector.detectLists()')");
        
        // Try to detect lists first
        console.log("\n   Attempting to detect lists...");
        await page.eval('if (typeof selector !== "undefined" && selector.detectLists) selector.detectLists()');
        const retryResult = await page.eval('selector.next()');
        logTest("selector.next() (after detection)", retryResult !== null && retryResult !== undefined, 
                `- Has data: ${retryResult !== null}`);
        
        if (retryResult) {
          console.log(`   Result: {selector: "${retryResult.selector}", itemCount: ${retryResult.itemCount}}`);
        }
      } else {
        logTest("selector.next() (auto-return)", true, 
                `- Selector: "${selectorResult.selector}", Items: ${selectorResult.itemCount}`);
        console.log("   %cFull result:", "font-weight: bold", selectorResult);
      }
    }
    
  } catch (error) {
    console.error("\n%c❌ ERROR during test execution:", "color: #ff0000; font-weight: bold", error);
    failed++;
  }
  
  // Summary
  console.log("\n%c╔═══════════════════════════════════════════════════════════════════╗", "color: #00ff00; font-weight: bold");
  console.log(`%c║                        Test Summary                                ║`, "color: #00ff00; font-weight: bold");
  console.log("%c╠═══════════════════════════════════════════════════════════════════╣", "color: #00ff00; font-weight: bold");
  
  const totalTests = passed + failed;
  const passRate = totalTests > 0 ? Math.round((passed / totalTests) * 100) : 0;
  
  console.log(`%c║   Total Tests: ${totalTests}                                                  ║`, "color: #00ff00; font-weight: bold");
  console.log(`%c║   Passed: ${passed}                                                      ║`, "color: #00ff00; font-weight: bold");
  console.log(`%c║   Failed: ${failed}                                                      ║`, "color: #00ff00; font-weight: bold");
  console.log(`%c║   Pass Rate: ${passRate}%                                                  ║`, "color: #00ff00; font-weight: bold");
  console.log("%c╚═══════════════════════════════════════════════════════════════════╝", "color: #00ff00; font-weight: bold");
  
  if (failed === 0) {
    console.log("\n%c🎉 ALL TESTS PASSED! The fix is working correctly! 🎉", 
                "color: #00ff00; font-weight: bold; font-size: 16px; background: #003300; padding: 10px");
  } else {
    console.log("\n%c⚠️  Some tests failed. Please check the DEBUG_GUIDE.md for troubleshooting.", 
                "color: #ff6600; font-weight: bold; font-size: 14px");
  }
  
  console.log("\n%cFor detailed debugging, see: demo/DEBUG_GUIDE.md", "color: #aaaaaa");
  
})().catch(err => {
  console.error("%c💥 Test script failed:", "color: #ff0000; font-weight: bold; font-size: 16px", err);
});

