"use strict";

const BACKGROUND_SCRIPTS = [
  "assets/js/libs/axios.min.js",
  "assets/js/libs/moment.min.js",
  "assets/js/libs/lodash.min.js",
  "assets/js/libs/query-string.min.js",
  "assets/js/libs/fingerprintjs@3.js",
  "assets/js/libs/cheerio.1.0.0.min.js",
  "assets/js/core/common.js",
  "assets/js/core/bridge.js",
  "assets/js/core/tb-bridge.js",
  "assets/js/core/utils.js",
  "assets/js/core/webRequestBg.js",
  "assets/js/core/serverUtils.js",
  "assets/js/plugins/TraceTimeUtil.js",
  "assets/js/plugins/ChromePage.js",
  "assets/js/plugins/scrapyJs.js",
  "assets/app_script/crawl_zhuanlan_pay.js",
  "assets/js/ai/selector-contract.js",
  "assets/js/ai/service-client.js",
  "background.js"
];

const LOCAL_STORAGE_PREFIX = "__mv3_localStorage__";
const ORIGINAL_OBJECT_URL_SUPPORT = (() => {
  const urlCtor = globalThis.URL || globalThis.webkitURL || null;
  const createObjectURL = urlCtor?.createObjectURL ? urlCtor.createObjectURL.bind(urlCtor) : null;
  const revokeObjectURL = urlCtor?.revokeObjectURL ? urlCtor.revokeObjectURL.bind(urlCtor) : null;
  return { createObjectURL, revokeObjectURL };
})();
globalThis.__EXT_ORIGINAL_OBJECT_URL_SUPPORT__ = ORIGINAL_OBJECT_URL_SUPPORT;

function ensureLocalStorageStub() {
  if (typeof globalThis.localStorage !== "undefined") {
    return;
  }
  const store = {};
  const stub = {
    __isStub: true,
    __store: store,
    get length() {
      return Object.keys(store).length;
    },
    key(index) {
      const keys = Object.keys(store);
      return keys[index] ?? null;
    },
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = value == null ? "" : String(value);
    },
    removeItem(key) {
      if (Object.prototype.hasOwnProperty.call(store, key)) {
        delete store[key];
      }
    },
    clear() {
      Object.keys(store).forEach((key) => {
        delete store[key];
      });
    }
  };
  globalThis.localStorage = stub;
}

ensureLocalStorageStub();
ensureStoreShim();
// initializePageShim(); // Removed - now using ChromePage.js instead
                         // Backup available in demo/simplePage-backup.js

bootstrapWorkerGlobals();
setupChromeCompat();

const scriptUrls = BACKGROUND_SCRIPTS.map((path) => chrome?.runtime?.getURL ? chrome.runtime.getURL(path) : path);
console.log("Bootstrap background scripts", {
  hasChrome: typeof chrome !== "undefined",
  hasRuntime: !!chrome?.runtime,
  hasGetURL: !!chrome?.runtime?.getURL,
  scriptCount: scriptUrls.length
});
importScripts(...scriptUrls);
console.log("Background scripts loaded synchronously");
void setupLocalStoragePolyfill().catch((error) => console.warn("LocalStorage polyfill init error", error));

function bootstrapWorkerGlobals() {
  if (typeof globalThis.window === "undefined") {
    globalThis.window = globalThis;
  }
  if (typeof window.self === "undefined") {
    window.self = window;
  }
  if (typeof window.chrome === "undefined" && typeof chrome !== "undefined") {
    window.chrome = chrome;
  }
}

// initializePageShim() function removed - now using ChromePage.js
// Backup available in demo/simplePage-backup.js if needed for testing

function ensureStoreShim() {
  if (globalThis.store) {
    return;
  }
  const safeJSONParse = (value) => {
    if (value == null) {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  };
  const safeJSONStringify = (value) => {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return value == null ? value : String(value);
    }
  };
  globalThis.store = {
    get(key) {
      try {
        const stored = globalThis.localStorage?.getItem ? globalThis.localStorage.getItem(key) : undefined;
        return safeJSONParse(stored);
      } catch (error) {
        console.warn("store shim get error:", error);
        return null;
      }
    },
    set(key, value) {
      try {
        const normalized = safeJSONStringify(value);
        globalThis.localStorage?.setItem?.(key, normalized);
      } catch (error) {
        console.warn("store shim set error:", error);
      }
    },
    remove(key) {
      try {
        globalThis.localStorage?.removeItem?.(key);
      } catch (error) {
        console.warn("store shim remove error:", error);
      }
    },
    clear() {
      try {
        globalThis.localStorage?.clear?.();
      } catch (error) {
        console.warn("store shim clear error:", error);
      }
    }
  };
}

async function setupLocalStoragePolyfill() {
  const isStub = globalThis.localStorage?.__isStub;
  if (typeof globalThis.localStorage !== "undefined" && !isStub) {
    return;
  }
  const stubStore = isStub ? { ...(globalThis.localStorage?.__store || {}) } : {};
  const initialStore = await loadPersistedLocalStorage();
  const storage = new ExtensionLocalStorage({ ...stubStore, ...initialStore });
  subscribeToStorageChanges(storage);
  const proxy = new Proxy(storage, {
    get(target, prop, receiver) {
      if (prop in target) {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      if (typeof prop === "string" && Object.prototype.hasOwnProperty.call(target.store, prop)) {
        return target.store[prop];
      }
      return undefined;
    },
    set(target, prop, value) {
      if (typeof prop === "string") {
        target.setItem(prop, value);
        return true;
      }
      return Reflect.set(target, prop, value);
    },
    deleteProperty(target, prop) {
      if (typeof prop === "string") {
        target.removeItem(prop);
        return true;
      }
      return Reflect.deleteProperty(target, prop);
    },
    ownKeys(target) {
      return Reflect.ownKeys(target.store);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop in target) {
        return Object.getOwnPropertyDescriptor(target, prop);
      }
      if (typeof prop === "string" && Object.prototype.hasOwnProperty.call(target.store, prop)) {
        return {
          configurable: true,
          enumerable: true,
          value: target.store[prop]
        };
      }
      return undefined;
    }
  });

  Object.defineProperty(globalThis, "localStorage", {
    value: proxy,
    configurable: false,
    enumerable: false,
    writable: false
  });
  Reflect.deleteProperty(globalThis.localStorage, "__isStub");
}

function loadPersistedLocalStorage() {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) {
      resolve({});
      return;
    }
    chrome.storage.local.get(null, (items) => {
      if (chrome.runtime.lastError) {
        console.warn("localStorage polyfill hydration error:", chrome.runtime.lastError);
        resolve({});
        return;
      }
      const store = {};
      Object.entries(items || {}).forEach(([key, value]) => {
        if (key.startsWith(LOCAL_STORAGE_PREFIX)) {
          const actualKey = key.slice(LOCAL_STORAGE_PREFIX.length);
          store[actualKey] = value == null ? "" : String(value);
        }
      });
      resolve(store);
    });
  });
}

class ExtensionLocalStorage {
  constructor(initialStore) {
    this.store = { ...initialStore };
  }

  get length() {
    return Object.keys(this.store).length;
  }

  key(index) {
    const keys = Object.keys(this.store);
    return keys[index] ?? null;
  }

  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }

  setItem(key, value) {
    const normalized = value == null ? "" : String(value);
    this.store[key] = normalized;
    chrome.storage.local.set({ [LOCAL_STORAGE_PREFIX + key]: normalized });
  }

  removeItem(key) {
    if (Object.prototype.hasOwnProperty.call(this.store, key)) {
      delete this.store[key];
      chrome.storage.local.remove(LOCAL_STORAGE_PREFIX + key);
    }
  }

  clear() {
    const keys = Object.keys(this.store);
    this.store = {};
    if (keys.length) {
      const storageKeys = keys.map((key) => LOCAL_STORAGE_PREFIX + key);
      chrome.storage.local.remove(storageKeys);
    }
  }
}

function setupChromeCompat() {
  if (!chrome?.browserAction) {
    if (chrome?.action) {
      const action = chrome.action;
      const browserActionShim = {};
      const eventProps = ["onClicked"];
      eventProps.forEach((prop) => {
        if (action[prop]) {
          browserActionShim[prop] = action[prop];
        }
      });
      const methodProps = [
        "setBadgeText",
        "setBadgeBackgroundColor",
        "setTitle",
        "setIcon",
        "enable",
        "disable",
        "openPopup",
        "getPopup"
      ];
      methodProps.forEach((prop) => {
        if (typeof action[prop] === "function") {
          browserActionShim[prop] = action[prop].bind(action);
        }
      });
      chrome.browserAction = browserActionShim;
    } else {
      const listeners = new Set();
      chrome.browserAction = {
        onClicked: {
          addListener(listener) {
            listeners.add(listener);
          },
          removeListener(listener) {
            listeners.delete(listener);
          },
          hasListener(listener) {
            return listeners.has(listener);
          }
        },
        _emitClicked(tab) {
          listeners.forEach((listener) => {
            try {
              listener(tab);
            } catch (error) {
              console.warn("browserAction shim listener error:", error);
            }
          });
        }
      };
    }
  }
  if (!chrome.extension) {
    chrome.extension = {};
  }
  if (!chrome.extension.getURL && chrome.runtime?.getURL) {
    chrome.extension.getURL = chrome.runtime.getURL.bind(chrome.runtime);
  }
  if (!chrome.extension.getBackgroundPage) {
    chrome.extension.getBackgroundPage = () => ({ console });
  }
  setupExecuteScriptPolyfill();
}

function subscribeToStorageChanges(storage) {
  if (!chrome?.storage?.onChanged) {
    return;
  }
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    Object.entries(changes).forEach(([key, change]) => {
      if (!key.startsWith(LOCAL_STORAGE_PREFIX)) {
        return;
      }
      const actualKey = key.slice(LOCAL_STORAGE_PREFIX.length);
      if (change.newValue === undefined) {
        delete storage.store[actualKey];
      } else {
        storage.store[actualKey] = String(change.newValue ?? "");
      }
    });
  });
}

function setupExecuteScriptPolyfill() {
  if (!chrome?.scripting || !chrome?.tabs) {
    console.warn("chrome.scripting is not available; legacy executeScript polyfill skipped.");
    return;
  }
  if (typeof chrome.tabs.executeScript === "function") {
    return;
  }

  chrome.tabs.executeScript = function legacyExecuteScript(tabIdOrDetails, detailsOrCallback, callback) {
    let targetTabId = null;
    let details = null;
    let cb = callback;

    if (typeof tabIdOrDetails === "number") {
      targetTabId = tabIdOrDetails;
      details = detailsOrCallback || {};
    } else {
      details = tabIdOrDetails || {};
      cb = typeof detailsOrCallback === "function" ? detailsOrCallback : undefined;
    }

    const runInjection = (tabId) => {
      if (typeof tabId !== "number") {
        console.error("legacy executeScript polyfill: missing tabId");
        if (cb)
          cb([]);
        return;
      }
      const injection = buildInjectionOptions(tabId, details);
      chrome.scripting.executeScript(injection, (results) => {
        if (cb) {
          const legacyResults = Array.isArray(results) ? results.map((item) => item?.result) : [];
          cb(legacyResults);
        }
      });
    };

    if (typeof targetTabId === "number") {
      runInjection(targetTabId);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs.find((t) => !t.url?.startsWith?.("chrome://"));
        runInjection(tab ? tab.id : undefined);
      });
    }
  };
}

function buildInjectionOptions(tabId, details) {
  if (!details || (!details.code && !details.file && !details.files)) {
    throw new Error("chrome.tabs.executeScript polyfill requires a 'code' or 'file' option.");
  }

  const target = { tabId };
  if (Number.isInteger(details.frameId)) {
    target.frameIds = [details.frameId];
  } else if (details.allFrames) {
    target.allFrames = true;
  }

  const injection = { target };

  if (details.code) {
    injection.func = (source) => {
      if (!source)
        return;
      const runEvalFallback = () => {
        try {
          return (0, eval)(source);
        } catch (evalError) {
          console.error("executeScript polyfill failed to evaluate code:", evalError);
        }
      };
      const attemptInjection = (retryCount = 0) => {
        const parent = document.head || document.body || document.documentElement;
        if (parent && typeof parent.appendChild === "function") {
          try {
            const script = document.createElement("script");
            script.textContent = source;
            parent.appendChild(script);
            script.remove();
            return true;
          } catch (error) {
            console.warn("executeScript polyfill failed to inject code, retrying:", error);
          }
        }
        if (retryCount < 5) {
          setTimeout(() => attemptInjection(retryCount + 1), 50);
          return false;
        }
        console.warn("executeScript polyfill unable to inject via DOM after retries; falling back to eval.");
        runEvalFallback();
        return false;
      };
      attemptInjection();
    };
    injection.args = [details.code];
  } else if (details.files) {
    injection.files = details.files;
  } else if (details.file) {
    injection.files = [details.file];
  }

  if (details.world) {
    injection.world = details.world;
  }
  if (details.runAt === "document_start") {
    injection.injectImmediately = true;
  }

  return injection;
}
