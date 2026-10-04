
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj2, key, value2) => key in obj2 ? __defProp(obj2, key, { enumerable: true, configurable: true, writable: true, value: value2 }) : obj2[key] = value2;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined")
      return require.apply(this, arguments);
    throw new Error('Dynamic require of "' + x + '" is not supported');
  });
  var __commonJS = (cb, mod) => function __require2() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all3) => {
    for (var name in all3)
      __defProp(target, name, { get: all3[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __publicField = (obj2, key, value2) => {
    __defNormalProp(obj2, typeof key !== "symbol" ? key + "" : key, value2);
    return value2;
  };

  
  // src-bex/ChromePage.ts
  if (!globalThis.sleep)
    globalThis.sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  function getEventType(button) {
    switch (button) {
      case "right":
        return "contextmenu";
      case "middle":
        return "mouseup";
      default:
        return "click";
    }
  }
  function generateEventId() {
    return Date.now() + "-" + Math.random().toString(36).substr(2, 9);
  }
  var ChromePage = class {
    constructor(options) {
      __publicField(this, "pendingEvents", /* @__PURE__ */ new Map());
      __publicField(this, "keyboard");
      __publicField(this, "environment", "CAPACITOR" /* CAPACITOR */);
      __publicField(this, "debug", false);
      __publicField(this, "tabId");
      options = options || { debug: false };
      this.debug = options.debug;
      this.pendingEvents = /* @__PURE__ */ new Map();
      this.keyboard = new Keyboard(this);
      this.environment = this.detectEnvironment();
      this.tabId = null;
      console.log("ChromePage environment:", this.environment);
      if (this.environment === "CHROME" /* CHROME */) {
        chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
      }
    }
    detectEnvironment() {
      if (typeof globalThis.chrome !== "undefined") {
        return "CHROME" /* CHROME */;
      } else if (typeof globalThis.webView !== "undefined") {
        return "CAPACITOR" /* CAPACITOR */;
      } else {
        console.error("ChromePage Unknown environment");
        return "UNKNOWN" /* UNKNOWN */;
      }
    }
    _handleOperationCompletion(eventId, data) {
      data = data || {};
      if (typeof data !== "object")
        data = { data, message: "", PageBrigeCode: 0 };
      else if (data.hasOwnProperty("PageBrigeCode") === false)
        data = { data, message: "", PageBrigeCode: 0 };
      let result = JSON.stringify(data);
      switch (this.environment) {
        case "CAPACITOR" /* CAPACITOR */:
          return `AndroidPage.operationCompleted("${eventId}", '${result}');`;
        case "CHROME" /* CHROME */:
          return `chrome.runtime.sendMessage({ action: "operationCompleted", eventId: "${eventId}", result: \`${result}\` });`;
        default:
          console.warn("Unknown environment, no operation completion handler available.");
          return "";
      }
    }
    handleMessage(message, sender, sendResponse) {
      var _a;
      const { action: action2, eventId, result } = message;
      if ((_a = message.type) == null ? void 0 : _a.includes("hid"))
        return;
      if (action2 === "operationCompleted" && this.pendingEvents.has(eventId)) {
        this.operationCompleted(eventId, result);
      }
      if (this.debug) console.log("ChromePage addListener:", eventId, result);
    }
    async operationCompleted(eventId, result) {
      if (this.debug) {
        console.log("ChromePage.js operationCompleted in.", eventId);
        this.pendingEvents.forEach((value2, key) => {
          console.log(`forEach operationCompleted pendingEvents Key: ${key}, Value: ${value2}`);
        });
      }
      if (this.pendingEvents.has(eventId)) {
        const { resolve, reject } = this.pendingEvents.get(eventId) || {};
        if (this.debug)
          console.log("ChromePage.js operationCompleted resolve.", eventId);
        if (resolve && reject) {
          if (this.debug)
            console.log("ChromePage.js operationCompleted resolve start.", eventId, result);
          try {
            let res = JSON.parse(result);
            let { PageBrigeCode, message, data } = res;
            if (this.debug) console.log("ChromePage.js operationCompleted resolve start data.", eventId, PageBrigeCode);
            if (!!PageBrigeCode) {
              if (this.debug) console.log("ChromePage.js operationCompleted reject", message);
              reject(message);
            } else {
              if (this.debug) console.log("ChromePage.js operationCompleted resolve", data);
              resolve(data);
            }
          } catch (e) {
            reject("json parse error in ChromePage.js operationCompleted");
          }
          if (this.debug) console.log("ChromePage.js operationCompleted resolve end.", eventId);
        } else {
          console.log("error info\uFF1AChromePage.js operationCompleted resolve or reject is null.", eventId);
        }
        let delay = 10;
        if (this.debug) console.log("ChromePage.js operationCompleted delete timeout.", eventId);
        this.pendingEvents.delete(eventId);
      } else {
        console.log("ChromePage.js operationCompleted has not eventId.", Object.keys(this.pendingEvents), eventId);
      }
    }
    async title() {
      return await this.evaluate(() => document.title);
    }
    async content() {
      return await this.evaluate(() => document.body.innerHTML);
    }
    async url() {
      return await this.evaluate(() => window.location.href);
    }

  async reload(options = {}) {
    let { timeout = 30000, waitUntil = 'complete' } = options;
    timeout = timeout || 30000;
    waitUntil = waitUntil || 'complete';

    return await this.evaluate(() => window.location.reload());
  }
    
  // Function to initialize the tabId based on the current active tab
  async initializeTab() {
    const activeTab = await new Promise((resolve) => {
      chrome.tabs.query({ active: true }, (tabs) => resolve(tabs[0]));
    });

    if (!activeTab) throw new Error('No active tab found.');
    this.tabId = activeTab.id;
  }
  _getCurrentTime() {
    return new Date().toISOString().replace('T', ' ').replace('Z', '');
  }

  // Optimized `goto` function
  
    async goto(url, options = {}) {
      let { timeout = 30000, waitUntil = "complete" } = options;
      timeout = timeout || 30000;
      console.log("现在只实现了waitUntil =domcontentloaded ，已经自动切换.");
      waitUntil = "domcontentloaded";

      const targetTabId = await this._resolveActiveTabId();
      this.tabId = targetTabId;
      const debug = !!this.debug;

      const navigationPromise = new Promise((resolve, reject) => {
        let timeoutId;

        const handleTimeout = () => {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          reject(new Error("Navigation timeout exceeded"));
        };

        const onUpdated = (tabId, changeInfo, tab) => {
          if (tabId !== targetTabId) return;
          if (debug) {
            console.log("page.goto changeInfo:", tab?.url === url, tab?.url, changeInfo);
          }
          if (changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            clearTimeout(timeoutId);
            resolve();
          }
        };

        if (timeout > 0) {
          timeoutId = setTimeout(handleTimeout, timeout);
        }
        chrome.tabs.onUpdated.addListener(onUpdated);
      });

      const code = `window.location.href = "${url}"`;
      await this.eval(code);

      if (debug) {
        console.log("[ChromePage.goto] navigation triggered", { url, tabId: targetTabId });
      }
      return navigationPromise;
    }

  // `waitForNavigation` method to handle different waitUntil options
  async waitForNavigation(options = {}) {
    const { timeout = 15000, waitUntil = "domcontentloaded" } = options;
    const targetTabId = await this._resolveActiveTabId();
    this.tabId = targetTabId;
    const debug = !!this.debug;

    const isNavigationAlreadyComplete = async () => {
      try {
        const readyState = await this.evaluate(() => document.readyState);
        if (debug) {
          console.log("[ChromePage.waitForNavigation] readyState check:", readyState);
        }
        if (waitUntil === "domcontentloaded") {
          return readyState === "interactive" || readyState === "complete";
        }
        if (waitUntil === "load") {
          return readyState === "complete";
        }
      } catch (error) {
        if (debug) {
          console.warn("[ChromePage.waitForNavigation] readyState check failed:", error);
        }
      }
      return false;
    };

    if (await isNavigationAlreadyComplete()) {
      if (debug) {
        console.log("[ChromePage.waitForNavigation] already satisfied, resolve immediately");
      }
      return;
    }

    return new Promise((resolve, reject) => {
      let timeoutId;
      let idleTimer;
      let pendingRequests = 0;

      const cleanUp = () => {
        if (debug) console.log("waitForNavigation cleanUp");
        clearTimeout(timeoutId);
        clearTimeout(idleTimer);
        chrome.webNavigation.onCompleted.removeListener(onCompleted);
        chrome.webNavigation.onDOMContentLoaded.removeListener(onDOMContentLoaded);
        chrome.webRequest.onCompleted.removeListener(onRequestCompleted);
      };

      const resolveAndClean = () => {
        cleanUp();
        if (debug) console.log("[ChromePage.waitForNavigation] resolveAndClean", { waitUntil, tabId: targetTabId });
        resolve();
      };

      const onTimeout = () => {
        cleanUp();
        reject(new Error("Navigation timeout exceeded. " + timeout));
      };

      const onCompleted = (details) => {
        if (debug) console.log("waitForNavigation onCompleted", details);
        if (details.tabId === targetTabId && waitUntil === "load") {
          if (debug) console.log("[ChromePage.waitForNavigation] resolved (load)");
          resolveAndClean();
        }
      };

      const onDOMContentLoaded = (details) => {
        if (debug) console.log("waitForNavigation onDOMContentLoaded", details);
        if (details.tabId === targetTabId && waitUntil === "domcontentloaded") {
          if (debug) console.log("[ChromePage.waitForNavigation] resolved (domcontentloaded)");
          resolveAndClean();
        }
      };

      const onRequestCompleted = (details) => {
        if (details.tabId !== targetTabId) return;
        if (debug) console.log("waitForNavigation onRequestCompleted", details);

        pendingRequests--;
        if (pendingRequests <= 0) {
          clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            if (pendingRequests === 0) {
              resolveAndClean();
            }
          }, 500);
        }
      };

      timeoutId = setTimeout(onTimeout, timeout);

      if (waitUntil === "load") {
        chrome.webNavigation.onCompleted.addListener(onCompleted);
      } else if (waitUntil === "domcontentloaded") {
        chrome.webNavigation.onDOMContentLoaded.addListener(onDOMContentLoaded);
      } else if (waitUntil === "networkidle") {
        pendingRequests = 1;
        chrome.webRequest.onCompleted.addListener(onRequestCompleted, {
          urls: ["<all_urls>"],
          tabId: targetTabId
        });
      }
    });
  }

    async $x(xpath) {
      const outerHTMLs = await this.evaluate((xpath2) => {
        const iterator = document.evaluate(xpath2, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
        const results = [];
        let node = iterator.iterateNext();
        while (node) {
          results.push(node.outerHTML || new XMLSerializer().serializeToString(node));
          node = iterator.iterateNext();
        }
        return results;
      }, xpath);

      const parsedElements = outerHTMLs.map((outerHTML) => {
        if (!outerHTML) return ;
        const div = document.createElement("div");
        div.innerHTML = outerHTML;
        return new ChromeElement(this, xpath, div.firstChild);
        // return div.firstChild;
      });

      return parsedElements;
    }

    async $(selector) {
      const outerHTML = await this.evaluate((selector2) => {
        const element = document.querySelector(selector2);
        return element ? element.outerHTML : null;
      }, selector);
      if (!outerHTML)
        return null;
      const div = document.createElement("div");
      div.innerHTML = outerHTML;
      return new ChromeElement(this, selector, div.firstChild);
      // const parsedElement = div.firstChild;
      // return parsedElement;
    }
    async $$(selector) {
      const outerHTMLs = await this.evaluate((selector2) => {
        const elements = document.querySelectorAll(selector2);
        const results = [];
        elements.forEach((element) => {
          results.push(element.outerHTML);
        });
        return results;
      }, selector);
      const parsedElements = outerHTMLs.map((outerHTML) => {
        if (!outerHTML) return ;
        const div = document.createElement("div");
        div.innerHTML = outerHTML;
        return new ChromeElement(this, selector, div.firstChild);
        // return div.firstChild;
      });
      return parsedElements;
    }
    async $eval(selector, pageFunction, ...args) {
      // 打印选择器和回调函数
      // console.log(`$eval called with selector: ${selector}`);
      // console.log(`Callback function: ${pageFunction.toString()}`);
    
      // 使用 evaluate 获取并处理元素
      const result = await this.evaluate(
        (selector, pageFuncStr, ...args) => {
          // 找到匹配的第一个元素
          const element = document.querySelector(selector);
          if (!element) {
            throw new Error(`No element found for selector: ${selector}`);
          }
    
          // 将字符串转换回函数
          const pageFunc = new Function('return ' + pageFuncStr)();
    
          // 调用 pageFunction 处理元素
          const funcResult = pageFunc(element, ...args);
          console.log(`Result of pageFunction: ${funcResult}`);
          return funcResult;
        },
        selector,
        pageFunction.toString(), // 将函数转换为字符串
        ...args
      );
    
      // 打印最终结果
      // console.log(`Final result: ${result}`);
    
      return result;
    }
    
    async $$eval(selector, pageFunction, ...args) {
      // 打印选择器和回调函数
      // console.log(`$$eval called with selector: ${selector}`);
      // console.log(`Callback function: ${pageFunction.toString()}`);
    
      // 使用 evaluate 获取并处理元素
      const result = await this.evaluate(
        (selector, pageFuncStr, ...args) => {
          const elements = Array.from(document.querySelectorAll(selector));
    
          // 将字符串转换回函数
          const pageFunc = new Function('return ' + pageFuncStr)();
    
          // 调用 pageFunction 处理元素
          const funcResult = pageFunc(elements, ...args);
          console.log(`Result of pageFunction: ${funcResult}`);
          return funcResult;
        },
        selector,
        pageFunction.toString(), // 将函数转换为字符串
        ...args
      );
    
      // 打印最终结果
      // console.log(`Final result: ${result}`);
    
      return result;
    }
    
    
    
    
    async addScriptTag(options) {
      const scriptId = `chrome-ext-script-${Math.random().toString(36).substr(2, 9)}`;
      let { url: url3, content, type, onload } = options;
      if (url3) {
        await this.evaluate((url4, type2, id, onloadContent) => {
          const ensureHeadExists = (callback) => {
            if (document.body) {
              callback();
            } else {
              document.addEventListener("DOMContentLoaded", () => {
                if (document.body)
                  callback();
              });
            }
          };
          ensureHeadExists(() => {
            const script = document.createElement("script");
            script.src = url4;
            script.id = id;
            if (type2) {
              script.type = type2;
            }
            if (onloadContent) {
              script.onload = () => {
                const onloadScript = new Function(onloadContent);
                onloadScript();
              };
            }
            document.body.appendChild(script);
          });
        }, url3, type, scriptId, onload);
      } else if (content) {
        await this.evaluate((content2, type2, id) => {
          const ensureBodyExists = (callback) => {
            if (document.body) {
              callback();
            } else {
              document.addEventListener("DOMContentLoaded", () => {
                if (document.body)
                  callback();
              });
            }
          };
          ensureBodyExists(() => {
            const script = document.createElement("script");
            script.textContent = content2;
            script.id = id;
            if (type2) {
              script.type = type2;
            }
            document.body.appendChild(script);
          });
        }, content, type, scriptId);
      }
    }
    async addStyleTag(options) {
      if (options.url) {
        return this.evaluate((url3) => {
          const ensureHeadExists = (callback) => {
            if (document.head) {
              callback();
            } else {
              document.addEventListener("DOMContentLoaded", () => {
                if (document.head)
                  callback();
              });
            }
          };
          ensureHeadExists(() => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = url3;
            document.head.appendChild(link);
          });
        }, options.url);
      } else if (options.content) {
        return this.evaluate((content) => {
          const ensureHeadExists = (callback) => {
            if (document.head) {
              callback();
            } else {
              document.addEventListener("DOMContentLoaded", () => {
                if (document.head)
                  callback();
              });
            }
          };
          ensureHeadExists(() => {
            const style = document.createElement("style");
            style.type = "text/css";
            style.textContent = content;
            document.head.appendChild(style);
          });
        }, options.content);
      }
    }
    async cookies(...urls) {
      return new Promise(async (resolve, reject) => {
        switch (this.environment) {
          case "CAPACITOR" /* CAPACITOR */:
            resolve(this._getDocumentCookies());
            break;
          case "CHROME" /* CHROME */:
            if (chrome.permissions) {
              chrome.permissions.contains({ permissions: ["cookies"] }, (result) => {
                if (result) {
                  const queryInfo = urls.length ? { urls } : { url: void 0 };
                  chrome.cookies.getAll(queryInfo, (cookies) => {
                    const formattedCookies = cookies.map((cookie) => ({
                      name: cookie.name,
                      value: cookie.value,
                      domain: cookie.domain,
                      path: cookie.path,
                      expires: cookie.expirationDate,
                      httpOnly: cookie.httpOnly,
                      secure: cookie.secure,
                      sameSite: cookie.sameSite
                    }));
                    resolve(formattedCookies);
                  });
                } else {
                  resolve(this._getDocumentCookies());
                }
              });
            } else {
              resolve(this._getDocumentCookies());
            }
            break;
          default:
            console.log("Unsupported environment.");
            reject(new Error("Unsupported environment."));
        }
      });
    }
    async  setCookie(...cookies) {
        const eventId = generateEventId();
        let script = cookies.map(cookie => {
            if (typeof cookie === 'string') {
                // For simplicity, assuming string cookies are already in a valid format.
                return `document.cookie = "${cookie}";`;
            } else {
                const optionsParts = [];
                if (cookie.expires) optionsParts.push(`expires=${new Date(cookie.expires * 1000).toUTCString()}`);
                if (cookie.path) optionsParts.push(`path=${cookie.path}`);
                if (cookie.domain) optionsParts.push(`domain=${cookie.domain}`);
                if (cookie.secure) optionsParts.push(`secure`);
                if (cookie.sameSite) optionsParts.push(`SameSite=${cookie.sameSite}`);
                // Note: httpOnly cannot be set via JavaScript; it is ignored here.
                return `document.cookie = "${cookie.name}=${cookie.value}; ${optionsParts.join('; ')}";`;
            }
        }).join('\n');
        script += "\n console.log('page.setCookie')" ;

        // Execute the script to set cookies within the webpage context.
        // This requires a function to execute the script, similar to the click function's _execute method.
        // Assuming a function exists: this._executeScript(script) to execute JavaScript in the webpage context.
        try {
            await this.eval(script); // Assume this function exists and executes the provided JS in the webpage context.
            console.log('Cookies set successfully');
            if (globalThis.setCookies) globalThis.setCookies(cookies); // chrome extension 中的setCookies接口.
        } catch (error) {
            console.error('Failed to set cookies:', error);
        }
    }
    async deleteCookie(...cookies) {
      const script = cookies.map(cookie => {
          if (typeof cookie === 'string') {
              // 对于字符串形式的cookie，假设它是cookie的名字，并将它的过期时间设置为过去。
              return `document.cookie = "${cookie}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;";`;
          } else {
              // 构建cookie删除的脚本，通过将expires设为过去的时间。
              const optionsParts = [];
              optionsParts.push(`expires=Thu, 01 Jan 1970 00:00:00 GMT`);
              if (cookie.path) optionsParts.push(`path=${cookie.path}`);
              if (cookie.domain) optionsParts.push(`domain=${cookie.domain}`);
              // Note: 对于删除操作，secure和SameSite选项不是必需的。
              return `document.cookie = "${cookie.name}=; ${optionsParts.join('; ')}";`;
          }
      }).join('\n');

      // 假设这个函数存在，并且可以在网页上下文中执行提供的JS代码。
      try {
          await this.eval(script); // 假设这个函数存在，并执行提供的JS代码。
          console.log('Cookies deleted successfully');
      } catch (error) {
          console.error('Failed to delete cookies:', error);
      }
  }


    async _getDocumentCookies() {
      const rawCookies = await this.evaluate(() => document.cookie);
      return rawCookies.split("; ").map((cookie) => {
        const [name, value2] = cookie.split("=");
        return { name, value: value2 };
      });
    }
    async click(selector, options = {}) {
      const eventId = generateEventId();
      if (this.debug)
        console.log("ChromePage click in.", eventId);
      const {
        button = "left",
        clickCount = 1,
        delay = 0
      } = options;
      const script = `
            (async function() {
                const element = document.querySelector("${selector}");
                if (!element) {
                    throw new Error("Element not found for selector: ${selector}");
                }

                const eventInit = {
                    bubbles: true,
                    cancelable: true,
                    detail: ${clickCount}
                };

                const clickEvent = new MouseEvent("${getEventType(button)}", eventInit);

                function delayAction(duration) {
                    return new Promise(resolve => setTimeout(resolve, duration));
                }

                async function performClick() {
                    for (let i = 0; i < ${clickCount}; i++) {
                        element.dispatchEvent(new MouseEvent('mousedown', eventInit));
                        await delayAction(${delay});
                        element.dispatchEvent(new MouseEvent('mouseup', eventInit));
                        element.dispatchEvent(clickEvent);
                    }
                    return "Clicked";
                }
        await performClick();

                ${this._handleOperationCompletion(eventId, "clicked")}
                return
            })();
        `;
      if (this.debug)
        console.log("ChromePage click in options. script");
      return await this._execute(script, eventId);
    }
    async type(selector, text, options = {}) {
      const eventId = generateEventId();
      const { delay = 0 } = options;
      if (this.debug)
        console.log("ChromePage type in.", eventId, text);
      const script = `
      (async function() {
        const element = document.querySelector("${selector}");
        if (!element) {
          throw new Error("Element not found for selector: ${selector}");
        }

        function dispatchKeyEvent(element, type, char) {
          const event = new KeyboardEvent(type, {
            key: char,
            char: char,
            code: 'Key' + char.toUpperCase(),
            bubbles: true,
            cancelable: true
          });
          element.dispatchEvent(event);
        }

        function delayAction(duration) {
          return new Promise(resolve => setTimeout(resolve, duration));
        }

        async function performType() {
          element.focus();
          for (const char of "${text}") {
            // console.log( 'page input:' , char , moment().format('YYYY-MM-DD HH:mm:ss.SSS') );
            dispatchKeyEvent(element, 'keydown', char);
            element.value += char;  // Update the value
            dispatchKeyEvent(element, 'input', char); // Trigger input event
            dispatchKeyEvent(element, 'keypress', char);
            dispatchKeyEvent(element, 'keyup', char);

            if (${delay} > 0) {
              await delayAction(${delay});
            }
          }
          return "Typed";
        }

        await performType();
        // console.log( 'page input done:' , "${text}" , moment().format('YYYY-MM-DD HH:mm:ss.SSS') );
                ${this._handleOperationCompletion(eventId, "Typed")}
      })();
    `;
      if (this.debug)
        console.log("ChromePage type in.  script ", eventId);
      return this._execute(script, eventId);
    }
    async waitFor(selectorOrFunctionOrTimeout, options = {}, ...args) {
      if (typeof selectorOrFunctionOrTimeout === "string") {
        return await this.waitForSelector(selectorOrFunctionOrTimeout, options);
      } else if (typeof selectorOrFunctionOrTimeout === "function") {
        return await this.waitForFunction(selectorOrFunctionOrTimeout, options, ...args);
      } else if (typeof selectorOrFunctionOrTimeout === "number") {
        return await this.waitForTimeout(selectorOrFunctionOrTimeout);
      } else {
        throw new Error("Unsupported argument type for waitFor");
      }
    }
    
    async waitForTimeout(timeout) {
      return new Promise((resolve) => setTimeout(resolve, timeout));
    }
    async waitForXPath(xpath, options = {}) {
      const eventId = generateEventId();
      const { visible = false, hidden = false, timeout = 3e4 } = options;
      const script = `
        new Promise((resolve, reject) => {
          const startTime = Date.now();
          const checkXPath = () => {
            const result = document.evaluate("${xpath}", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const el = result.singleNodeValue;
            if (el) {
              if (${visible} && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden") {
                ${this._handleOperationCompletion(eventId, true)}
                return;
              }
              if (${hidden} && (getComputedStyle(el).display === "none" || getComputedStyle(el).visibility === "hidden")) {
                ${this._handleOperationCompletion(eventId, true)}
                return;
              }
              if (!${visible} && !${hidden}) {
                ${this._handleOperationCompletion(eventId, true)}
                return;
              }
            }
            if (Date.now() - startTime > ${timeout}) {
              ${this._handleOperationCompletion(eventId, { PageBrigeCode: 1, message: "Timeout exceeded while waiting, timeout: " + timeout + ", waitForXPath: " + xpath })}
            } else {
              requestAnimationFrame(checkXPath);
            }
          };
          checkXPath();
        });
      `;
      await this._execute(script, eventId);
      return new ChromeElement(this, xpath, true);
    }

    async waitForSelector(selector, options = {}) {
      const eventId = generateEventId();
      const { visible = false, hidden = false, timeout = 3e4 } = options;
      const script = `
            new Promise((resolve, reject) => {
                const startTime = Date.now();
                const checkSelector = () => {
                    const el = document.querySelector("${selector}");
                    if (el) {
                        if (${visible} && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden") {
                            ${this._handleOperationCompletion(eventId, true)}
                            return;
                        }
                        if (${hidden} && (getComputedStyle(el).display === "none" || getComputedStyle(el).visibility === "hidden")) {
                            ${this._handleOperationCompletion(eventId, true)}
                            return;
                        }
                        if (!${visible} && !${hidden}) {
                            ${this._handleOperationCompletion(eventId, true)}
                            return;
                        }
                    }
                    if (Date.now() - startTime > ${timeout}) {
                        ${this._handleOperationCompletion(eventId, { PageBrigeCode: 1, message: "Timeout exceeded while waiting,timeout:" + timeout + ",waitForSelector:" + selector })}
                    } else {
                        requestAnimationFrame(checkSelector);
                    }
                };
                checkSelector();
            });
        `;
      await this._execute(script, eventId);
      return new ChromeElement(this, selector);
    }
    async waitForFunction(pageFunction, options = {}, ...args) {
      const eventId = generateEventId();
      const { polling = "raf", timeout = 3e4 } = options;
      const functionString = `
            (function() {
                return new Promise((resolve, reject) => {
                    let startTime = Date.now();
                    const checkFunction = () => {
                        let result = (${pageFunction.toString()})(...${JSON.stringify(args)});
                        if (result) {
              ${this._handleOperationCompletion(eventId, true)}
                        } else if (Date.now() - startTime > ${timeout}) {
              ${this._handleOperationCompletion(eventId, { PageBrigeCode: 1, message: "Timeout exceeded while waiting,timeout:" + timeout + ",waitForFunction:" + pageFunction.toString() })}
                        } else {
                            if ('${polling}' === 'raf') {
                                requestAnimationFrame(checkFunction);
                            } else {
                                setTimeout(checkFunction, '${polling}');
                            }
                        }
                    };
                    checkFunction();
                });
            })();
        `;
      return await this._execute(functionString, eventId);
    }

    async screenshot(options = {}) {
      switch (this.environment) {
        case "CAPACITOR" /* CAPACITOR */:
          return this.screenshotInWebview();
        case "CHROME" /* CHROME */:
          return await this.screenshotInChrome(options);
        default:
          throw new Error("Unsupported environment for screenshot function");
      }
    }
    async screenshotInWebview() {
      return globalThis.webView.capturePicture();
    }
    async screenshotInChrome(options = {}) {
      let { format = "png" } = options;
      return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true }, (tabs) => {
          const activeTab = tabs[0];
          if (activeTab) {
            chrome.tabs.captureVisibleTab(activeTab.windowId, { format }, (dataUrl) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(dataUrl);
              }
            });
          } else {
            reject(new Error("No active tab found"));
          }
        });
      });
    }
    async uploadFile(selector, fileContent) {
      console.log("uploadFile:", selector, fileContent);
      if (fileContent instanceof ArrayBuffer || fileContent instanceof Blob) {
        await this._uploadFromBlob(selector, fileContent);
      } else if (typeof fileContent === "string") {
        if (fileContent.startsWith("data:")) {
          await this._uploadFromDataUrl(selector, fileContent);
        } else if (fileContent.startsWith("http://") || fileContent.startsWith("https://")) {
          await this._uploadFromUrl(selector, fileContent);
        } else {
          throw new Error("Unsupported string format. It should be a Data URL or a web URL.");
        }
      } else {
        throw new Error("Unsupported file content type.");
      }
    }
    async _uploadFromBlob(selector, blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            await this._uploadFromDataUrl(selector, reader.result);
            resolve(true);
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    async _uploadFromDataUrl(selector, dataUrl) {
      return this.evaluate((selector2, dataUrl2) => {
        function dataUrlToBlob(dataUrl3) {
          const parts2 = dataUrl3.split(",");
          const byteString = atob(parts2[1]);
          const mimeString = parts2[0].split(":")[1].split(";")[0];
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i2 = 0; i2 < byteString.length; i2++) {
            ia[i2] = byteString.charCodeAt(i2);
          }
          return new Blob([ab], { type: mimeString });
        }
        const blob = dataUrlToBlob(dataUrl2);
        const input2 = document.querySelector(selector2);
        const dt = new DataTransfer();
        dt.items.add(new File([blob], "filename.jpg", { type: "image/jpeg" }));
        input2.files = dt.files;
        input2.dispatchEvent(new Event("change", { bubbles: true }));
      }, selector, dataUrl);
    }
    async _uploadFromUrl(selector, url3) {
      const response = await fetch(url3);
      const blob = await response.blob();
      return this._uploadFromBlob(selector, blob);
    }
    async eval(code, options = {}) {
      const debug = options.debug || false;
      if (this.debug)
        console.log("eval:", code, debug);
      if (chrome?.scripting?.executeScript) {
        return await this._evalWithScripting(code, options);
      }
      if (code.includes("=")) {
        const scriptId2 = await this.addScriptTag({ content: code });
        if (!debug) {
          await this.evaluate((id) => {
            const script = document.getElementById(id);
            if (script)
              script.remove();
          }, scriptId2);
        }
        return;
      }
      const getCode = `
            (function() {
                var element = document.querySelector('chromeextension');
                if(!element) {
                    element = document.createElement('chromeextension');
                    element.style.display = 'none';
                    element.setAttribute('type', 'return');
                    document.body.appendChild(element);
                }
                let data = {};
                try {
                    let text = element.textContent;
                    data = JSON.parse(text || '{}');
                    let value = ${code};
                    data.result = value;
                    element.textContent = JSON.stringify(data);
                } catch(error) {
                    console.error('Error while fetching data: ', error);
                }
            })();
        `;
      const scriptId = await this.addScriptTag({ content: getCode });
      const resultElementContent = await this.evaluate(() => {
        const element = document.querySelector("chromeextension");
        return element ? element.textContent : null;
      });
      const result = JSON.parse(resultElementContent || "{}").result;
      if (!debug) {
        await this.evaluate((id) => {
          const script = document.getElementById(id);
          if (script)
            script.remove();
        }, scriptId);
        await this.evaluate(() => {
          const element = document.querySelector("chromeextension");
          if (element)
            element.remove();
        });
      }
      return result;
    }

    async _evalWithScripting(code, options = {}) {
      const tabId = typeof options.tabId === "number" ? options.tabId : await this._resolveActiveTabId();
      const target = { tabId };
      if (typeof options.frameId === "number") {
        target.frameIds = [options.frameId];
      }
      console.log("[ChromePage._evalWithScripting v3.1] Executing code:", code.substring(0, 100));
      
      return await new Promise((resolve, reject) => {
        chrome.scripting.executeScript(
          {
            target,
            world: "MAIN",
            args: [code],
            func: (source) => {
              return new Promise((resolveRun, rejectRun) => {
                try {
                  const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
                  const sentinel = `__chromeEvalSentinel_${Math.random().toString(36).slice(2)}`;
                  let wrappedSource = source;
                  const hasReturn = /return\s+/i.test(source);
                  const hasAwait = /await\s+/i.test(source);
                  
                  console.log("[ChromePage] Code analysis:", { 
                    hasReturn, 
                    hasAwait, 
                    willWrap: !hasReturn && !hasAwait,
                    code: source.substring(0, 80)
                  });
                  
                  if (!hasReturn && !hasAwait) {
                    // ✅ FIX: Auto-return the expression result
                    wrappedSource = `
                      return (async () => {
                        console.log("[ChromePage Context] Executing with auto-return:", "${source.replace(/"/g, '\\"').substring(0, 60)}...");
                        const __result = ${source};
                        console.log("[ChromePage Context] Result type:", typeof __result, "isNull:", __result === null);
                        return __result;
                      })();
                    `;
                    console.log("[ChromePage] Applied auto-return wrapper");
                  } else {
                    console.log("[ChromePage] Using code as-is (has return or await)");
                  }
                  
                  const runner = new AsyncFunction(`
                    const __chromeEvalInner = async () => {
                      ${wrappedSource}
                    };
                    let result = await __chromeEvalInner();
                    if (result && typeof result.then === "function") {
                      result = await result;
                    }
                    console.log("[ChromePage] Final result:", typeof result, result);
                    globalThis["${sentinel}"] = result;
                    return result;
                  `);
                  runner().then((res) => {
                    resolveRun(res);
                  }).catch((err) => {
                    rejectRun(err);
                  });
                } catch (injectError) {
                  rejectRun(injectError);
                }
              });
            }
          },
          (results) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            const finalResult = Array.isArray(results) && results.length ? results[0].result : void 0;
            console.log("[ChromePage._evalWithScripting] Returning to caller:", typeof finalResult, finalResult);
            resolve(finalResult);
          }
        );
      });
    }

    async _resolveActiveTabId() {
      if (typeof this.tabId === "number") {
        return this.tabId;
      }

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

      const debugLog = (...args) => {
        if (this.debug) {
          console.log("[ChromePage::_resolveActiveTabId]", ...args);
        }
      };

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

      const getAllNormalWindows = () =>
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

      const pickMostRecent = (tabs) => {
        return tabs
          .slice()
          .sort((a, b) => {
            const aValue = typeof a.lastAccessed === "number" ? a.lastAccessed : 0;
            const bValue = typeof b.lastAccessed === "number" ? b.lastAccessed : 0;
            return bValue - aValue;
          })[0];
      };

      try {
        const cached = globalThis.__lastChromePageTab;
        if (cached?.id) {
          const tab = await getTabById(cached.id).catch((error) => {
            debugLog("cached tab lookup failed", error);
            return null;
          });
          if (tab?.active && isInjectable(tab)) {
            debugLog("using cached tab", { id: tab.id, url: tab.url });
            return tab.id;
          }
        }
      } catch (error) {
        debugLog("cached tab validation error", error);
      }

      try {
        const windows = await getAllNormalWindows();
        if (this.debug) {
          const summary = windows.map((win) => ({
            id: win.id,
            focused: win.focused,
            tabCount: Array.isArray(win.tabs) ? win.tabs.length : 0,
            tabs: (win.tabs || []).map((tab) => ({
              id: tab.id,
              active: tab.active,
              url: tab.url,
              lastAccessed: tab.lastAccessed
            }))
          }));
          debugLog("window snapshot", summary);
        }

        const pickFromWindow = (win) => {
          if (!win || !Array.isArray(win.tabs)) {
            return null;
          }
          const activeTab = win.tabs.find((tab) => tab.active && isInjectable(tab));
          if (activeTab) {
            return activeTab;
          }
          const injectableTabs = win.tabs.filter(isInjectable);
          if (injectableTabs.length) {
            return pickMostRecent(injectableTabs);
          }
          return null;
        };

        const focusedWindow = windows.find((win) => win.focused && win.type === "normal");
        const focusedTab = pickFromWindow(focusedWindow);
        if (focusedTab) {
          debugLog("using focused window", { id: focusedTab.id, url: focusedTab.url });
          return focusedTab.id;
        }

        const allInjectableTabs = windows
          .flatMap((win) => (Array.isArray(win.tabs) ? win.tabs : []))
          .filter(isInjectable);
        if (allInjectableTabs.length) {
          const activeTabs = allInjectableTabs.filter((tab) => tab.active);
          if (activeTabs.length) {
            const pick = pickMostRecent(activeTabs);
            debugLog("using most recent active tab", { id: pick.id, url: pick.url });
            return pick.id;
          }
          const pick = pickMostRecent(allInjectableTabs);
          if (pick) {
            debugLog("using most recent injectable tab", { id: pick.id, url: pick.url });
            return pick.id;
          }
        }
      } catch (error) {
        debugLog("window sweep failed", error);
      }

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

      const fallbackQueries = [
        { active: true, lastFocusedWindow: true },
        { active: true, currentWindow: true },
        { windowType: "normal", active: true },
        {}
      ];

      for (const query of fallbackQueries) {
        try {
          const tabs = await queryTabs(query);
          const match = tabs.find(isInjectable);
          if (match) {
            debugLog("using fallback query", query, { id: match.id, url: match.url });
            return match.id;
          }
        } catch (error) {
          debugLog("fallback query failed", query, error);
        }
      }

      throw new Error("No active tab found.");
    }
    async evaluate(fnOrString, ...args) {
      const canUseScripting = this.environment === "CHROME" /* CHROME */ &&
        typeof chrome?.scripting?.executeScript === "function";

      const tryScriptingFunction = async (fn) => {
        const tabId = await this._resolveActiveTabId();
        const options = {
          target: { tabId },
          func: fn,
          args,
          world: "MAIN"
        };
        return await new Promise((resolve, reject) => {
          chrome.scripting.executeScript(options, (results) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            const value = Array.isArray(results) && results.length ? results[0].result : undefined;
            resolve(value);
          });
        });
      };

      if (canUseScripting && typeof fnOrString === "function") {
        const tabId = await this._resolveActiveTabId();
        try {
          return await tryScriptingFunction(fnOrString);
        } catch (error) {
          if (this.debug) {
            console.warn("[ChromePage.evaluate] scripting execution failed, falling back to bridge execution.", error);
          }
        }
      } else if (typeof fnOrString === "string") {
        throw new Error("String-based evaluation is not supported in MV3. Please use structured commands.");
      }

      const eventId = generateEventId();
      let functionString, functionStringPre;
      functionStringPre = `
      var doOperationCompletion = function(eventId, data, environment) {
        if (!data || typeof data !== 'object') data = { data, message: '', PageBrigeCode: 0 };
        else if (data && data.hasOwnProperty('PageBrigeCode') === false) data = { data, message: '', PageBrigeCode: 0 };
        console.log("doOperationCompletion", data )

        switch (environment) {
          case "CAPACITOR":
            AndroidPage.operationCompleted(eventId, JSON.stringify(data));
            break;
          case "CHROME":
            chrome.runtime.sendMessage({ action: "operationCompleted", eventId: eventId, result: JSON.stringify(data) });
            break;
          default:
            console.warn("Unknown environment, no operation completion handler available.");
        }
      };
    `;
      if (typeof fnOrString === "function") {
        const argsLiteral = JSON.stringify(args);
        functionString = `
        (async function() {
          const result = await (${fnOrString.toString()})(...${argsLiteral});
          doOperationCompletion("${eventId}", result, "${this.environment}");
          return result;
        })();
      `;
        functionString = functionStringPre + functionString;
      } else if (typeof fnOrString === "string") {
        const sanitized = fnOrString.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
        functionString = `
        (async function() {
          let result;
          try {
            result = await (async () => { ${sanitized} })();
          } catch (error) {
            doOperationCompletion("${eventId}", { PageBrigeCode: 1, message: error?.message || String(error), data: null }, "${this.environment}");
            return;
          }
          doOperationCompletion("${eventId}", result, "${this.environment}");
          return result;
        })();
      `;
        functionString = functionStringPre + functionString;
      } else {
        throw new Error("The evaluate method expects a function or a string.");
      }
      return await this._execute(functionString, eventId);
    }
    async _execute(functionString, eventId) {
      if (this.debug)
        console.log("_execute:", eventId);
      return new Promise((resolve, reject) => {
        this.pendingEvents.set(eventId, { resolve, reject });
        if (this.debug)
          this.pendingEvents.forEach((value2, key) => {
            console.log(`_execute forEach pendingEvents Key: ${key}, Value: ${value2}`);
          });
        switch (this.environment) {
          case "CAPACITOR" /* CAPACITOR */:
            if (this.debug)
              console.log("webView.evaluateJavascript start.", this.pendingEvents.has(eventId));
            globalThis.webView.evaluateJavascript(functionString);
            if (this.debug)
              console.log("webView.evaluateJavascript end.");
            break;
          case "CHROME" /* CHROME */: {
            const handleImmediateFailure = (error) => {
              const pending = this.pendingEvents.get(eventId);
              if (pending?.reject) {
                pending.reject(error instanceof Error ? error : new Error(String(error)));
              }
              this.pendingEvents.delete(eventId);
            };
            (async () => {
              try {
                const targetTabId = await this._resolveActiveTabId();
                this.tabId = targetTabId;
                const runWithScripting = () => {
                  chrome.scripting.executeScript(
                    {
                      target: { tabId: targetTabId },
                      world: "ISOLATED",
                      args: [functionString],
                      func: function(source) {
                        if (!source) return;
                        const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
                        return new AsyncFunction(source)();
                      }
                    },
                    () => {
                      if (chrome.runtime.lastError) {
                        handleImmediateFailure(new Error(chrome.runtime.lastError.message));
                      }
                    }
                  );
                };
                if (typeof chrome?.scripting?.executeScript === "function") {
                  runWithScripting();
                } else if (typeof chrome?.tabs?.executeScript === "function") {
                  chrome.tabs.executeScript(targetTabId, { code: functionString }, () => {
                    if (chrome.runtime.lastError) {
                      handleImmediateFailure(new Error(chrome.runtime.lastError.message));
                    }
                  });
                } else {
                  handleImmediateFailure(new Error("No executeScript API available"));
                }
              } catch (error) {
                handleImmediateFailure(error);
              }
            })();
            break;
          }
          default:
            console.log("Unsupported environment.");
            reject(new Error("Unsupported environment."));
            this.pendingEvents.delete(eventId);
        }
      });
    }
  };
  var ChromeElement = class {
    constructor(page2, selector, outerHTML) {
      __publicField(this, "page");
      __publicField(this, "selector");
      __publicField(this, "dom");
      this.page = page2;
      this.selector = selector;
      this.dom = outerHTML;
    }
    async click(options = {}) {
      // Check if selector is an XPath (you can customize this check as needed)
      const isXPath = this.selector.startsWith('//') || this.selector.startsWith('(');

      if (isXPath) {
        // Use page.evaluate with XPath to perform the click
        await this.page.evaluate((xpath) => {
          const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          const element = result.singleNodeValue;
          if (element) {
            element.click();
          } else {
            console.error(`No element found for XPath: ${xpath}`);
          }
        }, this.selector);
      } else {
        // Use Puppeteer's built-in page.click for CSS selectors
        await this.page.click(this.selector, options);
      }
    }

    async type(text, options = {}) {
      return await this.page.type(this.selector, text, options);
    }
    async uploadFile(fileContent) {
      return await this.page.uploadFile(this.selector, fileContent);
    }
  };
  var Keyboard = class {
    constructor(page2) {
      __publicField(this, "page");
      this.page = page2;
    }
    async type(text) {
      for (let char of text) {
        await this.press(char);
      }
    }
    async press(key) {
      await this.page.evaluate((key2) => {
        let event = new KeyboardEvent("keydown", { key: key2 });
        document.dispatchEvent(event);
        event = new KeyboardEvent("keypress", { key: key2 });
        document.dispatchEvent(event);
        event = new KeyboardEvent("keyup", { key: key2 });
        document.dispatchEvent(event);
      }, key);
    }
    async down(key) {
      await this.page.evaluate((key2) => {
        let event = new KeyboardEvent("keydown", { key: key2 });
        document.dispatchEvent(event);
      }, key);
    }
    async up(key) {
      await this.page.evaluate((key2) => {
        let event = new KeyboardEvent("keyup", { key: key2 });
        document.dispatchEvent(event);
      }, key);
    }
  };



  var page = new ChromePage();
  page.__version = 3.1;  // Version with auto-return fix
  page.__implementation = "ChromePage";
  
  if (typeof globalThis !== "undefined") {
    globalThis.page____ChromePage____Object = page;
    globalThis.page = globalThis.page || page;
    globalThis.ChromePage = ChromePage;
  }
  console.log("ChromePage.js loaded - Version 3.1 (with auto-return fix)");
  
// 'BROWSER' 'ANDROID_APP';     在 Env.js 中也有，复制过来的。
globalThis.CHROME_PAGE_TYPE = 'CHROME_EXTENSION';
