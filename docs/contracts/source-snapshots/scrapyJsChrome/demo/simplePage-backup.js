// simplePage 备份 - 从 background-sw.js 移除
// 如需测试 simplePage，可以将此代码复制到 background-sw.js
// 并在初始化时调用 initializePageShim()

function initializePageShim() {
  const PAGE_SHIM_VERSION = 3.1;
  console.log(`[PageShim] Initializing version ${PAGE_SHIM_VERSION}...`);
  
  if (globalThis.page____ChromePage____Object?.__version === PAGE_SHIM_VERSION) {
    console.log("[PageShim] Already initialized with same version, skipping");
    return;
  }
  console.log("[PageShim] Installing new page shim...");
  
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  async function findInjectableTab() {
    const isInjectable = (tab) => {
      if (!tab?.url) {
        return false;
      }
      try {
        const { protocol } = new URL(tab.url);
        return protocol === "http:" || protocol === "https:" || protocol === "file:";
      } catch {
        return false;
      }
    };

    const queryTabs = (queryInfo) =>
      new Promise((resolve, reject) => {
        try {
          chrome.tabs.query(queryInfo, (tabs) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(Array.isArray(tabs) ? tabs : []);
          });
        } catch (error) {
          reject(error);
        }
      });

    const getTabById = (tabId) =>
      new Promise((resolve, reject) => {
        try {
          chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(tab ?? null);
          });
        } catch (error) {
          reject(error);
        }
      });

    const getAllNormalWindowsWithTabs = () =>
      new Promise((resolve, reject) => {
        try {
          chrome.windows.getAll({ populate: true, windowTypes: ["normal"] }, (windows) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(Array.isArray(windows) ? windows : []);
          });
        } catch (error) {
          reject(error);
        }
      });

    const resolveCachedTab = async () => {
      const cached = globalThis.__lastChromePageTab;
      if (!cached?.id) {
        return null;
      }
      try {
        const tab = await getTabById(cached.id);
        return tab && tab.active && isInjectable(tab) ? tab : null;
      } catch {
        return null;
      }
    };

    const cachedTab = await resolveCachedTab();
    if (cachedTab) {
      return cachedTab;
    }

    const sortByRecent = (tabs) =>
      tabs.slice().sort((a, b) => {
        const aTime = typeof a.lastAccessed === "number" ? a.lastAccessed : 0;
        const bTime = typeof b.lastAccessed === "number" ? b.lastAccessed : 0;
        return bTime - aTime;
      });

    try {
      const windows = await getAllNormalWindowsWithTabs();
      const focusedWindow = windows.find((win) => win.focused && Array.isArray(win.tabs));
      if (focusedWindow) {
        const focusedActive = focusedWindow.tabs.find((tab) => tab.active && isInjectable(tab));
        if (focusedActive) {
          return focusedActive;
        }
        const focusedRecent = sortByRecent(focusedWindow.tabs.filter(isInjectable))[0];
        if (focusedRecent) {
          return focusedRecent;
        }
      }

      const allTabs = windows.flatMap((win) => (Array.isArray(win.tabs) ? win.tabs : [])).filter(isInjectable);
      if (allTabs.length === 0) {
        return null;
      }

      const activeTabs = allTabs.filter((tab) => tab.active);
      if (activeTabs.length) {
        return sortByRecent(activeTabs)[0];
      }

      return sortByRecent(allTabs)[0] ?? null;
    } catch {
      // ignore errors and fall through to query-based fallback
    }

    const searchQueries = [
      { active: true, lastFocusedWindow: true },
      { active: true, windowType: "normal" },
      { windowType: "normal" }
    ];

    for (const queryInfo of searchQueries) {
      const tabs = await queryTabs(queryInfo);
      const match = tabs.find(isInjectable);
      if (match) {
        return match;
      }
    }

    return null;
  }

  async function getActiveTabId() {
    const tab = await findInjectableTab();
    if (tab?.id != null) {
      globalThis.__lastChromePageTab = { id: tab.id, url: tab.url, windowId: tab.windowId };
      return tab.id;
    }
    throw new Error("No injectable tab available.");
  }

  async function runInPage(func, args = [], options = {}) {
    const tabId = options.tabId ?? await getActiveTabId();
    return new Promise((resolve, reject) => {
      try {
        chrome.scripting.executeScript(
          {
            target: { tabId },
            world: options.world ?? "MAIN",
            args,
            func
          },
          (results) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(Array.isArray(results) && results.length ? results[0].result : undefined);
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  const simplePage = {
    async eval(code, options = {}) {
      if (typeof code !== "string") {
        throw new TypeError("page.eval expected a string.");
      }
      console.log("[simplePage.eval v3.1] Received code:", code.substring(0, 100));
      
      return await runInPage(async (source) => {
        const sanitize = (value) => typeof value === "string" ? value.trim() : "";
        const normalized = sanitize(source);
        let wrappedSource = normalized;
        const hasReturn = /return\s+/i.test(normalized);
        const hasAwait = /await\s+/i.test(normalized);
        
        console.log("[simplePage.eval] Code analysis:", { 
          hasReturn, 
          hasAwait, 
          willWrap: !hasReturn && !hasAwait,
          normalized: normalized.substring(0, 80)
        });
        
        if (normalized && !hasReturn && !hasAwait) {
          // Auto-return the expression result instead of just executing it
          wrappedSource = `
            return (async () => {
              console.log("[Page Context] Executing with auto-return:", "${normalized.replace(/"/g, '\\"')}");
              const __result = ${normalized};
              console.log("[Page Context] Result type:", typeof __result, "isNull:", __result === null, "value:", __result);
              return __result;
            })();
          `;
          console.log("[simplePage.eval] Wrapped code for auto-return");
        } else {
          console.log("[simplePage.eval] Using code as-is (has return or await)");
        }
        
        const runner = new AsyncFunction(`
          const __chromeEvalInner = async () => {
            ${wrappedSource}
          };
          const __chromeEvalResult = await __chromeEvalInner();
          if (__chromeEvalResult && typeof __chromeEvalResult.then === "function") {
            return await __chromeEvalResult;
          }
          return __chromeEvalResult;
        `);
        const finalResult = await runner();
        console.log("[simplePage.eval] Final result:", typeof finalResult, finalResult);
        return finalResult;
      }, [code], options);
    },
    async evaluate(fnOrString, ...args) {
      if (typeof fnOrString === "function") {
        const source = fnOrString.toString();
        return await runInPage(
          async (fnSource, fnArgs) => {
            const runner = new AsyncFunction(`return (${fnSource})(...arguments);`);
            return await runner(...fnArgs);
          },
          [source, args]
        );
      }
      if (typeof fnOrString === "string") {
        return await this.eval(fnOrString, ...args);
      }
      throw new TypeError("page.evaluate expects a function or string.");
    },
    async addScriptTag(options = {}) {
      const { url, content, type, onload } = options;
      if (!url && !content) {
        throw new Error("addScriptTag requires url or content.");
      }
      return await runInPage(
        ({ url: scriptUrl, content: scriptContent, type: scriptType, onload: onloadCode }) => {
          const script = document.createElement("script");
          if (scriptType) {
            script.type = scriptType;
          }
          if (scriptUrl) {
            script.src = scriptUrl;
          }
          if (scriptContent) {
            script.textContent = scriptContent;
          }
          if (onloadCode) {
            script.onload = () => {
              try {
                const runner = new Function(onloadCode);
                runner();
              } catch (error) {
                console.error("addScriptTag onload error:", error);
              }
            };
          }
          document.head.appendChild(script);
          return true;
        },
        [{ url, content, type, onload }]
      );
    },
    async url() {
      return await runInPage(() => window.location.href);
    },
    async title() {
      return await runInPage(() => document.title);
    },
    async content() {
      return await runInPage(() => document.documentElement?.outerHTML ?? "");
    }
  };

  simplePage.__version = PAGE_SHIM_VERSION;
  globalThis.page____ChromePage____Object = simplePage;
  globalThis.page = simplePage;
  globalThis.ChromePage = function () {
    return simplePage;
  };
  
  console.log(`[PageShim] Installation complete. Version ${PAGE_SHIM_VERSION} is now active.`);
  console.log("[PageShim] Test with: await page.eval('document.title')");
}

// 使用方法：
// 在 background-sw.js 中调用：
// ensureStoreShim();
// initializePageShim();  // <-- 取消注释此行

