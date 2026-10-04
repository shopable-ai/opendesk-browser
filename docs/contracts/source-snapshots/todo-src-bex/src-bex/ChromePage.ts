if (!globalThis.sleep) globalThis.sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

function getEventType(button) {
	switch (button) {
		case 'right':
			return 'contextmenu';
		case 'middle':
			return 'mouseup';  // For middle click, just use mouseup
		default:
			return 'click';
	}
}

function generateEventId() {
	return Date.now() + "-" + Math.random().toString(36).substr(2, 9);
}

enum Environment {
	CAPACITOR = "CAPACITOR",
	CHROME = "CHROME",
	UNKNOWN = "UNKNOWN"
}

class ChromePage {
	private pendingEvents: Map<string, { resolve: Function, reject: Function }> = new Map();
	keyboard: Keyboard;
	environment: Environment = Environment.CAPACITOR;
	debug: boolean = true;

	// 在android app中的v8中没有运行。且容易报错，需要手动屏蔽
	constructor(options?: any) {
		options = options || { debug: true }
		this.debug = options.debug as boolean;

		this.pendingEvents = new Map();
		this.keyboard = new Keyboard(this);

		this.environment = this.detectEnvironment();
		console.log('ChromePage environment:', this.environment);
		if (this.environment === Environment.CHROME) {
			chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
		}
	}
	private detectEnvironment(): Environment {
		if (typeof globalThis.chrome !== 'undefined') {
			return Environment.CHROME;
		} else if (typeof globalThis.webView !== 'undefined') {
			return Environment.CAPACITOR;
		} else {
			console.error('ChromePage Unknown environment');
			return Environment.UNKNOWN;
		}
	}

	/**
	 * 统一处理多个跨设备调用的回调，如 android app，chrome extension，
	 * @param eventId 框架自动生成，用于标识事件。
	 * @param data 数据，主要是json。方便调用，成功可以直接传递简单数据，失败则必须传递{PageBrigeCode: 1, message: "错误信息"}。如果传递的对象中没有code属性，则默认为成功。
	 * @returns 返回给调用者的js代码，用于执行回调。主要用于拼接eval中执行的js代码.
	 */
	private _handleOperationCompletion(eventId: string, data?: object | string | boolean): string {
		data = data || {};
		// 如果不是对象，则转换为对象。包装为 { data , message: '' , PageBrigeCode: 0 } ; // PageBrigeCode = errcode = 0:成功，其他:失败
		if (typeof data !== 'object') data = { data, message: '', PageBrigeCode: 0 };
		else if (data.hasOwnProperty('PageBrigeCode') === false) data = { data, message: '', PageBrigeCode: 0 }; // 如果传递对象没有code，则默认为成功。并包装数据
		let result = JSON.stringify(data)
		switch (this.environment) {
			case Environment.CAPACITOR:
				return `AndroidPage.operationCompleted("${eventId}", '${result}');`;
			case Environment.CHROME:
				return `chrome.runtime.sendMessage({ action: "operationCompleted", eventId: "${eventId}", result: '${result}' });`;
			default:
				console.warn("Unknown environment, no operation completion handler available.");
				return "";
		}
	}

	/**
	 * 处理跨设备的回调，主要是chrome extension中 chrome.runtime.sendMessage的回调
	 * @param message
	 * @param sender
	 * @param sendResponse
	 * @returns
	 */
	handleMessage(message, sender, sendResponse) {
		const { action, eventId, result } = message;  // console.log('ChromePage addListener handleMessage filter return , other message')
		if (message.type?.includes('hid')) return;   // 过滤掉hid类型的消息，是background.ts中其他地方的消息
		if (action === "operationCompleted" && this.pendingEvents.has(eventId)) {
			this.operationCompleted(eventId, result);
		}
		console.log('ChromePage addListener:', eventId, result);
	}

	/**
	 * 处理跨设备的回调，实现promise resole功能。这里给出的是android app中的v8的回调，需要在android app中调用
	 * @param eventId 框架自动生成，用于标识事件。
	 * @param result 事件的结果，json字符串，格式为 { data , message: '' , PageBrigeCode: 0 } ; // PageBrigeCode = errcode = 0:成功，其他:失败 , message: 错误信息。data: 结果
	 */
	async operationCompleted(eventId, result: string) {
		if (this.debug) {
			console.log('ChromePage.js operationCompleted in.', eventId);
			this.pendingEvents.forEach((value, key) => {
				console.log(`forEach operationCompleted pendingEvents Key: ${key}, Value: ${value}`);
			});
		}
		// 如果有注册的事件promise，则执行
		if (this.pendingEvents.has(eventId)) {
			const { resolve, reject } = this.pendingEvents.get(eventId) || {};
			if (this.debug) console.log('ChromePage.js operationCompleted resolve.', eventId)
			if (resolve && reject) {
				if (this.debug) console.log('ChromePage.js operationCompleted resolve start.', eventId, result)
				try {
					let res = JSON.parse(result);
					let { PageBrigeCode, message, data } = res;
					if (this.debug) console.log('ChromePage.js operationCompleted resolve start data.', eventId, PageBrigeCode)
					if (!!PageBrigeCode) {
						console.log('ChromePage.js operationCompleted reject', message);
						reject(message);
					}
					else {
						console.log('ChromePage.js operationCompleted resolve', data);
						resolve(data);
					}
				} catch (e) {
					reject('json parse error in ChromePage.js operationCompleted');
				}
				if (this.debug) console.log('ChromePage.js operationCompleted resolve end.', eventId)
			} else {
				console.log('error info：ChromePage.js operationCompleted resolve or reject is null.', eventId)
			}
			let delay = 10; // this.debug ? 10000 :
			// setTimeout((debug) => {  // this变量失效.
			if (this.debug)
				console.log('ChromePage.js operationCompleted delete timeout.', eventId);
			this.pendingEvents.delete(eventId);
			// }, delay, this.debug);
		} else {
			console.log('ChromePage.js operationCompleted has not eventId.', Object.keys(this.pendingEvents), eventId)
		}
	}


	async title(): Promise<string> {
		return await this.evaluate(() => document.title);
	}

	async content(): Promise<string> {
		return await this.evaluate(() => document.body.innerHTML);
	}

	async url(): Promise<string> {
		return await this.evaluate(() => window.location.href);
	}

	/**
	 * 刷新
	 *
	 * @param {*} [options={}]
	 *
	 * @memberof ChromePage
	 */
	async reload(options = {}) {
		let { timeout = 30000, waitUntil = 'complete' } = options as any;
		timeout = timeout || 30000;
		waitUntil = waitUntil || 'complete';

		return await this.evaluate(() => window.location.reload());
	}

	// 	page.goto(url[, options])
	// url <string> 导航到的地址. 地址应该带有http协议, 比如 https://.
	// options <Object> 导航配置，可选值：
	// timeout <number> 跳转等待时间，单位是毫秒, 默认是30秒, 传 0 表示无限等待。可以通过page.setDefaultNavigationTimeout(timeout)方法修改默认值
	// waitUntil <string|Array<string>> 满足什么条件认为页面跳转完成，默认是 load 事件触发时。指定事件数组，那么所有事件触发后才认为是跳转完成。事件包括：
	// load - 页面的load事件触发时
	// domcontentloaded - 页面的 DOMContentLoaded 事件触发时
	// networkidle0 - 不再有网络连接时触发（至少500毫秒后）
	// networkidle2 - 只有2个网络连接时触发（至少500毫秒后）
	// referer <string> Referer header value. If provided it will take preference over the referer header value set by page.setExtraHTTPHeaders().
	// 返回: <Promise<?Response>> Promise对象resolve后是主要的请求的响应。如果有多个跳转, resolve后是最后一次跳转的响应

	/**
	 * 导航到指定的url，等待导航完成或超时.
	 *
	 * @param {*} url 导航到的地址. 地址应该带有http协议, 比如 https://.
	 * @param {*} [options={}]
	 * @return {*} 无返回
	 * @memberof ChromePage
	 */
	async goto(url, options = {}) {
		let { timeout = 30000, waitUntil = 'complete' } = options as any;
		timeout = timeout || 30000;
		waitUntil = waitUntil || 'complete';

		// 开始导航
		const navigationPromise = new Promise<void>((resolve, reject) => {
			let timeoutId;

			// 设置超时
			if (timeout > 0) {
				timeoutId = setTimeout(() => {
					chrome.tabs.onUpdated.removeListener(listener); // 移除监听器
					reject(new Error('Navigation timeout exceeded'));
				}, timeout);
			}

			function listener(tabId, changeInfo, tab) {
				// tab.url === url &&
				if (changeInfo.status === 'complete') {
					chrome.tabs.onUpdated.removeListener(listener); // 移除监听器
					clearTimeout(timeoutId);
					resolve();
				}
			}

			// 添加事件监听器
			chrome.tabs.onUpdated.addListener(listener);
		});

		// 执行导航
		const code = `window.location.href = "${url}";`;
		await this.eval(code);

		// 等待导航完成或超时
		return navigationPromise;
	}

	/**
	 * 返回dom元素，如果没有找到则返回null。和document.querySelector 作用相同
	 * 对象是克隆的，不是原始对象。主要用于获取dom元素的属性和内容。
	 * @param selector
	 * @returns
	 */
	async $(selector) {
		// 在页面上下文中执行查询选择器操作
		const outerHTML = await this.evaluate((selector) => {
			const element = document.querySelector(selector);
			return element ? element.outerHTML : null;
		}, selector);

		if (!outerHTML) return null;

		// 在Chrome上下文中，从outerHTML解析为DOM对象
		const div = document.createElement('div');
		div.innerHTML = outerHTML as string;
		const parsedElement = div.firstChild;

		// 返回解析的DOM对象
		return parsedElement;
	}
	/**
	 * 返回dom元素，如果没有找到则返回null。和document.querySelectorAll 作用相同
	 * 对象是克隆的，不是原始对象。主要用于获取dom元素的属性和内容。
	 * @param selector
	 * @returns
	 */
	async $$(selector) {
		// 在页面上下文中执行查询选择器操作并获取所有匹配的元素的outerHTML
		const outerHTMLs = await this.evaluate((selector) => {
			const elements = document.querySelectorAll(selector);
			const results = [];
			elements.forEach((element) => {
				// @ts-ignore
				results.push(element.outerHTML);
			});
			return results;
		}, selector);

		const parsedElements = outerHTMLs.map(outerHTML => {
			const div = document.createElement('div');
			div.innerHTML = outerHTML;
			return div.firstChild;
		});

		// 返回解析的DOM对象数组
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


	/**
	 *
	 * @param options
	 * @example
		page.addScriptTag({
			url: "http://192.168.28.150:9400/testMonkey.js",
			type: "module",
			onload: " console.log('onload'); ",
		});
		page.addScriptTag({
			content: "console.log(document.title)",
			type: "module",
			onload: " console.log('onload'); ",
		});
	 */
	async addScriptTag(options: { url?: string; content?: string; type?: string; onload?: string }): Promise<void> {
		const scriptId = `chrome-ext-script-${Math.random().toString(36).substr(2, 9)}`;

		// Destructure properties from options
		let { url, content, type, onload } = options;

		if (url) {
			await this.evaluate((url: string, type: string | undefined, id: string, onloadContent: string | undefined) => {
				const ensureHeadExists = (callback: () => void) => {
					if (document.body) {
						callback();
					} else {
						document.addEventListener('DOMContentLoaded', () => {
							if (document.body) callback();
						});
					}
				};

				ensureHeadExists(() => {
					const script = document.createElement('script');
					script.src = url;
					script.id = id;

					if (type) {
						script.type = type;
					}

					if (onloadContent) {
						script.onload = () => {
							const onloadScript = new Function(onloadContent);
							onloadScript();
						};
					}

					document.body.appendChild(script);
				});
			}, url, type, scriptId, onload);
		} else if (content) {
			await this.evaluate((content: string, type: string | undefined, id: string) => {
				const ensureBodyExists = (callback: () => void) => {
					if (document.body) {
						callback();
					} else {
						document.addEventListener('DOMContentLoaded', () => {
							if (document.body) callback();
						});
					}
				};

				ensureBodyExists(() => {
					const script = document.createElement('script');
					script.textContent = content;
					script.id = id;

					if (type) {
						script.type = type;
					}

					document.body.appendChild(script);
				});
			}, content, type, scriptId);
		}
	}



	async addStyleTag(options: { url?: string; content?: string }): Promise<void> {

		if (options.url) {
			return this.evaluate((url: string) => {
				const ensureHeadExists = (callback: () => void) => {
					if (document.head) {
						callback();
					} else {
						document.addEventListener('DOMContentLoaded', () => {
							if (document.head) callback();
						});
					}
				};

				ensureHeadExists(() => {
					const link = document.createElement('link');
					link.rel = 'stylesheet';
					link.href = url;
					document.head.appendChild(link);
				});
			}, options.url);
		} else if (options.content) {
			return this.evaluate((content: string) => {
				const ensureHeadExists = (callback: () => void) => {
					if (document.head) {
						callback();
					} else {
						document.addEventListener('DOMContentLoaded', () => {
							if (document.head) callback();
						});
					}
				};

				ensureHeadExists(() => {
					const style = document.createElement('style');
					style.type = 'text/css';
					style.textContent = content;
					document.head.appendChild(style);
				});
			}, options.content);
		}
	}




	async cookies(...urls: string[]): Promise<{ [key: string]: string }[] | any[]> {
		return new Promise(async (resolve, reject) => {
			switch (this.environment) {
				case Environment.CAPACITOR:
					resolve(this._getDocumentCookies());
					break;

				case Environment.CHROME:
					if (chrome.permissions) {
						// 检查扩展是否拥有"cookies"权限
						chrome.permissions.contains({ permissions: ['cookies'] }, (result) => {
							if (result) {
								// 如果有权限，使用chrome.cookies.getAll获取cookie
								// @ts-ignore
								const queryInfo: chrome.cookies.GetDetails = urls.length ? { urls } : { url: undefined };
								chrome.cookies.getAll(queryInfo, (cookies) => {
									const formattedCookies = cookies.map(cookie => ({
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
								// 如果没有权限，使用document.cookie获取cookie
								resolve(this._getDocumentCookies());
							}
						});
					} else {
						// 如果chrome.permissions API不存在，使用document.cookie获取cookie
						resolve(this._getDocumentCookies());
					}
					break;

				default:
					console.log('Unsupported environment.');
					reject(new Error("Unsupported environment."));
			}
		});
	}
	/**
	 * 设置cookie
	 *
	 * @param {(...(string | {
	 * 		name: string,
	 * 		value: string,
	 * 		url?: string,
	 * 		domain?: string,
	 * 		path?: string,
	 * 		expires?: number,
	 * 		httpOnly?: boolean,
	 * 		secure?: boolean,
	 * 		sameSite?: "Strict" | "Lax"
	 * 	})[])} cookies
	 * @return {*}  {Promise<void>}
	 * @memberof ChromePage
	 */
	async setCookie(...cookies: (string | {
		name: string,
		value: string,
		url?: string,
		domain?: string,
		path?: string,
		expires?: number,
		httpOnly?: boolean,
		secure?: boolean,
		sameSite?: "Strict" | "Lax"
	})[]): Promise<void> {
		const script = cookies.map(cookie => {
			if (typeof cookie === 'string') {
				// For simplicity, assuming string cookies are already in a valid format.
				return `document.cookie = "${cookie}";`;
			} else {
				const optionsParts: any = [];
				if (cookie.expires) optionsParts.push(`expires=${new Date(cookie.expires * 1000).toUTCString()}`);
				if (cookie.path) optionsParts.push(`path=${cookie.path}`);
				if (cookie.domain) optionsParts.push(`domain=${cookie.domain}`);
				if (cookie.secure) optionsParts.push(`secure`);
				if (cookie.sameSite) optionsParts.push(`SameSite=${cookie.sameSite}`);
				// Note: httpOnly cannot be set via JavaScript; it is ignored here.
				return `document.cookie = "${cookie.name}=${cookie.value}; ${optionsParts.join('; ')}";`;
			}
		}).join('\n');

		// Execute the script to set cookies within the webpage context.
		// This requires a function to execute the script, similar to the click function's _execute method.
		// Assuming a function exists: this._executeScript(script) to execute JavaScript in the webpage context.
		try {
			await this.eval(script); // Assume this function exists and executes the provided JS in the webpage context.
			console.log('Cookies set successfully');
		} catch (error) {
			console.error('Failed to set cookies:', error);
		}
	}
	/**
	 * 删除coockie
	 *
	 * @param {(...(string | { name: string, url?: string, domain?: string, path?: string })[])} cookies
	 * @return {*}  {Promise<void>}
	 * @memberof ChromePage
	 */
	async deleteCookie(...cookies: (string | { name: string, url?: string, domain?: string, path?: string })[]): Promise<void> {
		const script = cookies.map(cookie => {
			if (typeof cookie === 'string') {
				// 对于字符串形式的cookie，假设它是cookie的名字，并将它的过期时间设置为过去。
				return `document.cookie = "${cookie}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;";`;
			} else {
				// 构建cookie删除的脚本，通过将expires设为过去的时间。
				const optionsParts: any = [];
				optionsParts.push(`expires=Thu, 01 Jan 1970 00:00:00 GMT`);
				// @ts-ignore
				cookie.value = null;
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




	private async _getDocumentCookies(): Promise<{ [key: string]: string }[]> {
		const rawCookies = await this.evaluate(() => document.cookie);
		return rawCookies.split("; ").map(cookie => {
			const [name, value] = cookie.split("=");
			return { name, value };
		});
	}

	async click(selector, options = {}) {
		const eventId = generateEventId();
		if (this.debug) console.log('ChromePage click in.', eventId);
		const {
			button = 'left',
			clickCount = 1,
			delay = 0
		} = options as any;

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

		if (this.debug) console.log('ChromePage click in options. script');
		return await this._execute(script, eventId);
	}

	async type(selector, text, options = {}) {
		const eventId = generateEventId();
		const { delay = 0 } = options as any;
		if (this.debug) console.log('ChromePage type in.', eventId, text)

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

		if (this.debug) console.log('ChromePage type in.  script ', eventId)
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


	async waitForSelector(selector, options = {}) {
		const eventId = generateEventId();
		const { visible = false, hidden = false, timeout = 30000 } = options as any;
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
						${this._handleOperationCompletion(eventId, { PageBrigeCode: 1, message: "Timeout exceeded while waiting," + timeout })}
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

	/**
	 *
	 * @param pageFunction
	 * @param options
	 * @param args
	 * @returns
	 * @example
	 * await page.waitFor(()=> document.querySelector("#base-info  div.content-show-l").innerText == '用户' ) ;
	 */
	async waitForFunction(pageFunction, options = {}, ...args) {
		const eventId = generateEventId();
		const { polling = 'raf', timeout = 30000 } = options as any;
		const functionString = `
            (function() {
                return new Promise((resolve, reject) => {
                    let startTime = Date.now();
                    const checkFunction = () => {
                        let result = (${pageFunction.toString()})(...${JSON.stringify(args)});
                        if (result) {
							${this._handleOperationCompletion(eventId, true)}
                        } else if (Date.now() - startTime > ${timeout}) {
							${this._handleOperationCompletion(eventId, { PageBrigeCode: 1, message: "Timeout exceeded while waiting," + timeout })}
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

	/**
	 *
	 * @param options
	 * @returns
	 * @example
		const screenshotData = await page.screenshot({  }); // fullPage: true, type: 'png'
		console.log('screenshotData:',screenshotData)
		await page.evaluate((base64Image) => {
			const image = new Image();
			image.src = base64Image;
			document.body.appendChild(image);
		}, screenshotData)
	 */
	async screenshot(options = {}): Promise<string | null> {
		switch (this.environment) {
			case Environment.CAPACITOR:
				return this.screenshotInWebview();

			case Environment.CHROME:
				return await this.screenshotInChrome(options);

			default:
				throw new Error("Unsupported environment for screenshot function");
		}
	}

	async screenshotInWebview(): Promise<string | null> {
		// 调用webview的截图方法，WebViewInterceptor 封装过一次。
		return globalThis.webView.capturePicture()
	}

	async screenshotInChrome(options = {}): Promise<string> {
		let { format = 'png' } = options as any;
		return new Promise<string>((resolve, reject) => {
			// 获取当前活动的标签页
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
					reject(new Error('No active tab found'));
				}
			});
		});
	}

	async uploadFile(selector, fileContent) {
		console.log('uploadFile:', selector, fileContent);
		if (fileContent instanceof ArrayBuffer || fileContent instanceof Blob) {
			await this._uploadFromBlob(selector, fileContent);
		} else if (typeof fileContent === 'string') {
			if (fileContent.startsWith('data:')) {
				await this._uploadFromDataUrl(selector, fileContent);
			} else if (fileContent.startsWith('http://') || fileContent.startsWith('https://')) {
				await this._uploadFromUrl(selector, fileContent);
			} else {
				throw new Error('Unsupported string format. It should be a Data URL or a web URL.');
			}
		} else {
			throw new Error('Unsupported file content type.');
		}
	}

	async _uploadFromBlob(selector, blob) {
		// Convert blob to Data URL and then use the existing logic to upload
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
		return this.evaluate((selector, dataUrl) => {
			function dataUrlToBlob(dataUrl) {
				const parts = dataUrl.split(',');
				const byteString = atob(parts[1]);
				const mimeString = parts[0].split(':')[1].split(';')[0];
				const ab = new ArrayBuffer(byteString.length);
				const ia = new Uint8Array(ab);
				for (let i = 0; i < byteString.length; i++) {
					ia[i] = byteString.charCodeAt(i);
				}
				return new Blob([ab], { type: mimeString });
			}
			// The function 'dataUrlToBlob' should be available in the context or injected
			const blob = dataUrlToBlob(dataUrl);
			const input = document.querySelector(selector);
			const dt = new DataTransfer();
			dt.items.add(new File([blob], "filename.jpg", { type: "image/jpeg" })); // 设置你的文件名和类型
			input.files = dt.files;
			input.dispatchEvent(new Event('change', { bubbles: true }));
		}, selector, dataUrl);
	}

	async _uploadFromUrl(selector, url) {
		const response = await fetch(url);
		const blob = await response.blob();
		return this._uploadFromBlob(selector, blob);
	}

	/**
	 * eval 在当前页面运行eval。
	 * 通过插入js代码到页面只执行eval，达到浏览器沙箱无法获取变量问题。
	 *
	 * @param {string} code
	 * @param {{ debug?: boolean }} [options={}]
	 * @return {*}
	 * @memberof ChromePage
	 */
	async eval(code: string, options: { debug?: boolean } = {}) {
		const debug = options.debug || false;
		console.log('eval:', code, debug);

		if (code.includes('=')) {  // Simplistic check for set operation
			const scriptId = await this.addScriptTag({ content: code });
			if (!debug) {
				await this.evaluate(id => {
					const script = document.getElementById(id);
					if (script) script.remove();
				}, scriptId);
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
			const element = document.querySelector('chromeextension');
			return element ? element.textContent : null;
		});
		const result = JSON.parse(resultElementContent || '{}').result;

		if (!debug) {
			await this.evaluate(id => {
				const script = document.getElementById(id);
				if (script) script.remove();
			}, scriptId);
			await this.evaluate(() => {
				const element = document.querySelector('chromeextension');
				if (element) element.remove();
			})
		}

		return result;
	}

	// 把同步或异步的方法都包装一次，按照跨设备处理。减少跨设备中的逻辑代码。如：android app中WebViewInterceptor的webView.evaluateJavascript
	async evaluate(fnOrString, ...args) {
		const eventId = generateEventId();
		let functionString, functionStringPre;

		// 这是doOperationCompletion的预定义代码
		functionStringPre = `
			var doOperationCompletion = function(eventId, data, environment) {
				if (typeof data !== 'object') data = { data, message: '', PageBrigeCode: 0 };
				else if (data.hasOwnProperty('PageBrigeCode') === false) data = { data, message: '', PageBrigeCode: 0 };
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

		if (typeof fnOrString === 'function') {
			functionString = `
				(async function() {
					const result = await (${fnOrString.toString()})(...${JSON.stringify(args)});
					doOperationCompletion("${eventId}", result, "${this.environment}");
					return result;
				})();
			`;
			functionString = functionStringPre + functionString;
		} else if (typeof fnOrString === 'string') {
			functionString = `${fnOrString}; ${this._handleOperationCompletion(eventId, true)}`;
		} else {
			throw new Error("The evaluate method expects a function or a string.");
		}
		return await this._execute(functionString, eventId);
	}



	async _execute(functionString: string, eventId: string): Promise<any> {
		if (this.debug) console.log('_execute:', eventId); // , functionString
		return new Promise((resolve, reject) => {
			this.pendingEvents.set(eventId, { resolve, reject });
			if (this.debug) this.pendingEvents.forEach((value, key) => {
				console.log(`_execute forEach pendingEvents Key: ${key}, Value: ${value}`);
			});
			switch (this.environment) {
				case Environment.CAPACITOR:
					if (this.debug) console.log('webView.evaluateJavascript start.', this.pendingEvents.has(eventId));
					globalThis.webView.evaluateJavascript(functionString);
					if (this.debug) console.log('webView.evaluateJavascript end.');
					break;

				case Environment.CHROME:
					chrome.tabs.query({ active: true }, (tabs) => {
						const nonExtensionTabs = tabs.filter(tab =>  !tab.url.startsWith('chrome-extension://'));
						let [tab] = nonExtensionTabs;
						if (tab) {
							// @ts-ignore
							chrome.tabs.executeScript(tab.id, { code: functionString });
						} else {
							console.log('No active tab found.');
							reject(new Error("No active tab found."));
							this.pendingEvents.delete(eventId);
						}
					});
					break;

				default:
					console.log('Unsupported environment.');
					reject(new Error("Unsupported environment."));
					this.pendingEvents.delete(eventId);
			}
		});
	}


}


class ChromeElement {
	page: ChromePage;
	selector: string;

	constructor(page, selector) {
		this.page = page;
		this.selector = selector;
	}

	async click(options = {}) {
		return await this.page.click(this.selector, options);
	}

	async type(text, options = {}) {
		return await this.page.type(this.selector, text, options);
	}
	async uploadFile(fileContent) {
		return await this.page.uploadFile(this.selector, fileContent);
	}
}

// 未生效，模拟输入框里backspace删除内容失败。现在暂无需求，起初是觉得需要触发enter，直接使用page.click(selector)即可
class Keyboard {
	page: ChromePage;

	constructor(page) {
		this.page = page;
	}

	async type(text) {
		for (let char of text) {
			await this.press(char);
		}
	}

	async press(key) {
		await this.page.evaluate((key) => {
			let event = new KeyboardEvent('keydown', { key: key });
			document.dispatchEvent(event);

			event = new KeyboardEvent('keypress', { key: key });
			document.dispatchEvent(event);

			event = new KeyboardEvent('keyup', { key: key });
			document.dispatchEvent(event);
		}, key);
	}

	async down(key) {
		await this.page.evaluate((key) => {
			let event = new KeyboardEvent('keydown', { key: key });
			document.dispatchEvent(event);
		}, key);
	}

	async up(key) {
		await this.page.evaluate((key) => {
			let event = new KeyboardEvent('keyup', { key: key });
			document.dispatchEvent(event);
		}, key);
	}
}

const page = new ChromePage();

// 编译到android app中，即目录src-capacitor\android\app\src\main\assets\core，需要使用注释下面代码;
export { page };
export default ChromePage;

if (typeof globalThis !== 'undefined') {
	// @ts-ignore
	globalThis.page____ChromePage____Object = page;     // 保留实例对象。如果需要在app和webview之间切换，需要保留实例对象
	// @ts-ignore
	globalThis.page = globalThis.page || page;  // android webview中重复进入
	// @ts-ignore
	globalThis.ChromePage = ChromePage;
}
// if (globalThis.module) module.exports = page;
// else globalThis.page = page;
console.log('ChromePage.js loaded')

