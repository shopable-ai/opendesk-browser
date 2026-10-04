import { sleep } from '/@/cool/utils';
import { bexBackground } from 'quasar/wrappers'
import _, { random } from 'lodash';
import { getObjectFromLocalStorage, saveObjectInLocalStorage, removeObjectFromLocalStorage } from './chrome-local-storage-api.js';
import TimeReview from './TimeReview';
import moment from 'moment';
import axios from 'axios';
// moment.locale('zh-cn');
import ChromePage, { page } from './ChromePage';
import { io } from "socket.io-client";
import UtilInfo from './utils/UtilInfo';
import UtilDevice from './utils/UtilDevice';
import { DeviceType } from './operate/Device.cst';
import { EVENT_OPERATE } from './operate/EventOperate.cst';
import { wrapAsync } from './utils/UtilScrpt.js';
import { csdnApp } from './controller/csdn.js';
// import puppeteer from 'puppeteer-core/lib/esm/puppeteer/web';
// import { ExtensionDebuggerTransport } from 'puppeteer-extension-transport'
if (!globalThis.sleep) globalThis.sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));


let timeReview: TimeReview;
let intervalId, countStart, duration;
var socket;
let deviceInfo: any = {};

if (page) globalThis.page = page;

let util = TraceTimeUtil;
let url, title;
// 通过注入到页面中的脚本，detect_focus.js 。内容页派发事件，background.js接收。
// 开发模式中，需要所有页面都刷新，才能执行注入脚本，并且生效。
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	// 移除前缀并处理所有消息
	let customEvent = request.type?.replace('hid_', '');

	// 使用异步自执行函数来处理请求
	(async () => {
		switch (customEvent) {
			case 'mousemove': // 对于mousemove事件的特殊处理（如果包含'hid_'前缀）
				if (request.type.includes('hid_')) {
					await handleHidMouseMove(request);
				}
				break;
			case 'notifications':
				handleNotifications(request);
				break;
			case 'chromeCustomEvt':
				handleChromeCustomEvent(request);
				break;
			case 'CHROME_BRIDGE_INTERFACE':
				await handleChromeBridgeInterface(request);
				break;
			case 'CHROME_PAGE_EXECUTE':
				await handleChromePageExecute(request);
				break;
			default:
				console.log("Unhandled CustomEvent type:", customEvent);
				break;
		}
	})().then(() => sendResponse("Processed message successfully"))
		.catch(error => console.error("Error processing message:", error));

	// 必须返回true来表明你会异步发送响应
	return true;
});
// 示例：处理隐藏的鼠标移动事件
async function handleHidMouseMove(request) {
	let url, title;
	url = request.url, title = request.title;
	if (request.type && !request.type.includes('hid_mousemove')) console.log("Handling hid mousemove event", request, url, title);

	if (!url || !title) return; //还没获取到关键数据,不用发送；很小的延迟.
	localStorage.currUrl = url, localStorage.currTitle = title;

	if ((request.active === 'true') || (request.active === true)) {
		if (!url || !title) return; //还没获取到关键数据,不用发送；很小的延迟.
		localStorage.currUrl = url, localStorage.currTitle = title;
		timeReview?.addAction({ duration: 0, timestamp: new Date().getTime(), path: url, title, action: request.type.replace('hid_', ''), app: 1 }); // 1=='chrome' util.getBrowser()
	}
}

// 示例：处理通知
function handleNotifications(request) {
	let timeMsg = request.time ? `${request.time}分钟` : '';
	chrome.notifications.create('', {
		title: '网站屏蔽:',
		message: `剩余时间：${timeMsg}`,
		iconUrl: '../icons/icon-48x48.png',
		type: 'basic'
	});
}

// 示例：处理自定义Chrome事件
function handleChromeCustomEvent(request) {
	let data = request.detail;
	console.log('Handling Chrome custom event with detail:', data);
	// 这里可以基于data执行具体操作，比如更新界面、存储数据等
}

// 示例：处理Chrome桥接接口
async function handleChromeBridgeInterface(request) {
	let { detail } = request;
	let { BridgeEventName, BridgeEventId, BridgeUrl_Inject, ...data } = detail;
	let res;
	try {
		let { eventId } = data || {}; // BridgeEventName, BridgeEventId, BridgeUrl_Inject,
		delete data.BridgeEventName, delete data.BridgeEventId, delete data.BridgeUrl_Inject, delete data.eventId;
		let api = BridgeUrl_Inject;
		let { url, token, key } = data;
		console.log('page content CHROME_BRIDGE_INTERFACE:', BridgeEventName, data, api)
		if (token && token.includes('${token}')) {
			data.token = token.replace('${token}', localStorage.token)
		}
		if (BridgeEventName && BridgeEventName.startsWith("AXIOS_")) {
			if (url && !url.startsWith("http")) url = BASE_URL + '/' + url;
			console.log("axios url:", { url, BASE_URL })
		}
		if (BridgeEventName == 'AXIOS_GET') {
			res = await axios.get(api, data.config).catch(e => { });  // .then(r => r.data)
		}
		else if (BridgeEventName == 'AXIOS_POST') {
			let { config, ...postData } = data;
			res = await axios.post(api, postData.data, config).catch(e => { });
		}
		else if (BridgeEventName == 'AXIOS_PUT') {
			let { config, ...putData } = data;
			res = await axios.put(api, putData.data, config).catch(e => { });
		}
		else if (BridgeEventName == 'AXIOS_DELETE') {
			res = await axios.delete(api, data.config).catch(e => { });
		}

		if (BridgeEventName == 'APPSTORAGE_SETITEM') {
			localStorage.setItem(key, data.value)
		} else if (BridgeEventName == 'APPSTORAGE_GETITEM') {
			res = localStorage.getItem(key);
		} else if (BridgeEventName == 'APPSTORAGE_REMOVEITEM') {
			res = localStorage.removeItem(key)
		} else if (BridgeEventName == 'APPSTORAGE_CLEAR') {
			res = localStorage.clear();
		} else if (BridgeEventName == 'APPLOCAL_SETITEM') {
			globalThis[key] = data.value;
		} else if (BridgeEventName == 'APPLOCAL_GETITEM') {
			res = globalThis[key]
		} else if (BridgeEventName == 'APPLOCAL_REMOVEITEM') {
			if (globalThis.hasOwnProperty(key)) {
				delete globalThis[key];
			}
		}


		if (BridgeEventName == "CREATE_NOTIFY") {
			createNotify(data.title, { body: data.content });
		}

		if (BridgeEventName == 'CSDN_READ_ARTICLE') res = await csdnApp.read(url);
		if (BridgeEventName == 'CSDN_DOWNLOAD') res = await csdnApp.download(url);
		// if (BridgeEventName == 'CSDN_VIP_LOGIN') res = await csdnApp.vipLogin(code);
		if (BridgeEventName == 'CSDN_VIP_LOGIN') {
			let { code, deviceCode } = data;
			let isUserLogin = !!code;
			code = code || localStorage.csdn_vipcode;
			if (!code) {
				return console.warn("no vip code")
			}
			res = await csdnApp.vipLogin(code, deviceCode);
			if (res?.code != 1000) {
				console.error("CSDN_VIP_LOGIN error:", res)
				let info = `page.evaluate((message)=>{alert('错误提示：' + message)}, '${res.message || "网络异常"}')`;
				console.log("error info:", info)
				executeScript(info);
				return;
			}
			localStorage.csdn_vipcode = code;
			// expireAt: "2024-04-15 21:36:20"
			let { scripts, isused, allowed, expireAt, value, createTime, updateTime } = res.data;
			let [item] = scripts;
			let { encode, content } = item || {};
			if (encode == 'base64') content = atob(content);
			// 如果卡密已经过了有效期，则退出登录。
			// 通过 expireAt - createTime , 计算有效时长，如果小于等于1天，则时效从 updateTime 开始计算，增加有效时长，修改expireAt
			const expireDate = new Date(expireAt);
			const updateDate = new Date(updateTime);
			const createDate = new Date(createTime);
			const currentDate = new Date();
			// 计算从创建时间到过期时间的时间差
			const timeDiff = expireDate - currentDate;
			// 转换时间差为天数
			const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
			console.log("daysDiff:", daysDiff)
			if (daysDiff <= 1.1) {
				let minute = Math.ceil(timeDiff / (1000 * 60));
				// console.log("有效期小于等于1天，从更新时间开始计算时效。" , minutes , 'm' );
				let expireStr = `var PLATFORM_PARAMS = {expireAt: '${minute}m'} ;`;
				// let newExpireDate = new Date(currentDate.getTime() + minute * 60000);

				// let year = newExpireDate.getFullYear();
				// let month = newExpireDate.getMonth() + 1; // Adding 1 because months are zero-indexed
				// let day = newExpireDate.getDate();
				// let hours = newExpireDate.getHours();
				// let minutes = newExpireDate.getMinutes();
				// let seconds = newExpireDate.getSeconds();

				// // Format the date string using padStart to ensure two digits
				// let formattedExpireAt = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
				// expireAt = formattedExpireAt;

				content = expireStr + '\n' + content;
			}
			let loginInfos = localStorage.loginInfos ? JSON.parse(localStorage.loginInfos) : [];
			loginInfos.push(code);
			// 去除loginInfos重复内容，
			const uniqueCodes = new Set(loginInfos);
			loginInfos = Array.from(uniqueCodes)

			localStorage.loginInfos = JSON.stringify(loginInfos);
			console.log("localStorage.loginInfos:", expireAt, localStorage.loginInfos)
			localStorage.setItem(`cardcode_${code}`, JSON.stringify({ expireAt, createTime, updateTime, type: 'login', url: 'https://csdn.net' }))


			// 把数据库中的 expireAt 字段增加其他类型，如有效时长。如 1m 1d 1h
			// 保存到PLATFORM_PARAMS字段中；
			if (content) {
				let info = `page.evaluate((updateTime)=>{
				if ( location.host.includes('www.csdn.net') ) localStorage.vipcode='${code}'
			  })`;
				console.log("isused info vipcode:", info)
				executeScript(info);  // 弹窗过后似乎导致登录失效
				executeScript(content);  // 执行逻辑，完成登录。
			}
			if (isused == true) {
				await sleep(2000)
				let info = `page.evaluate((updateTime)=>{
				alert('口令已使用,使用时间：' + updateTime)
			  }, '${updateTime}')`;
				console.log("isused info alert:", info, isUserLogin)
				// if(isUserLogin) executeScript(info);  // 弹窗过后似乎导致登录失效
				// 手动登录会弹窗，自动登录不会弹窗；
				if (isUserLogin) createNotify("提示:", { body: `兑换码使用时间：${updateTime}` });
			}
		}
		console.log('page content CHROME_BRIDGE_INTERFACE res:', res)
		ChromeBridgeCallBack(BridgeEventId, res)
	} catch (error) {
		console.error('Error handling Chrome Bridge Interface:', error);
	}
}

function extractDomainFromUrl(url) {
	// Add scheme if missing
	if (!/^https?:\/\//i.test(url)) {
		url = 'http://' + url;
	}

	const hostname = new URL(url).hostname;
	// Get the top-level domain, assuming the format is subdomain.domain.tld
	const topLevelDomain = hostname
		.split('.')
		.slice(-2) // Only take the last two parts
		.join('.');
	return '.' + topLevelDomain; // The cookies API requires the domain to start with a dot
}

async function deleteCookiesByUrl(url) {
	const domain = extractDomainFromUrl(url);

	// 使用chrome.cookies API获取所有cookies
	chrome.cookies?.getAll({ domain }, function (cookies) {
		for (let cookie of cookies) {
			let cookieUrl = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
			chrome.cookies.remove({ url: cookieUrl, name: cookie.name }, function (deletedCookie) {
				console.log(`Deleted cookie: ${cookie.name}`);
			});
		}
	});
}

// settingProxy('SOCKS5 192.168.28.140:10808');
async function settingProxy(proxy) {
	if (proxy == null) {
		// 不使用代理
		chrome.proxy.settings.clear({ scope: 'regular' }, function () { });
		return;
	}
	// 如果proxy 不是http(s)或sock开头的，则默认采用http代理补全，如127.0.0.1:10809补全为http 127.0.0.1:10809
	// 默认采用http代理补全
	if (!/^http(s)?:\/\//.test(proxy) && !/^sock(s)?:\/\//.test(proxy)) {
		proxy = "http " + proxy;
	}

	// // 定义代理配置，测试访问openai.com 正常。
	var config = {
		mode: "pac_script", // 使用 PAC (Proxy Auto-Configuration) 脚本
		pacScript: {
			data: `
		  function FindProxyForURL(url, host) {
			if (dnsDomainIs(host, ".open.ai") || url.includes("openai.com") || url.includes("chatgpt.com") ) {
			  return "${proxy}";
			  return "SOCKS5 192.168.28.140:40808";
			  return "SOCKS5 eWbPtbpAqM:hUFGfdE5Kw@47.90.183.177:48015";
			}
			return "DIRECT";
		  }
		`
		}
	};

	// // 设置代理配置
	chrome.proxy.settings.set(
		{ value: config, scope: 'regular' },
		function () { }
	);
	console.log("chrome.proxy.setting.set ")
}

async function setCookies(cookies) {
	if (!cookies) return;

	for (let cookie of cookies) {
		// Build the cookie URL
		let cookieUrl = `http${cookie.secure ? 's' : ''}://${cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain}`;

		// Log the cookie URL
		console.log("setCookies:", cookieUrl);

		// Set cookie options
		let cookieOptions = {
			url: cookieUrl,
			name: cookie.name,
			value: cookie.value,
			path: cookie.path,
			secure: cookie.secure,
			httpOnly: cookie.httpOnly,
			sameSite: cookie.sameSite ? cookie.sameSite : 'no_restriction', // Default to 'no_restriction' if sameSite is null
			expirationDate: cookie.session ? null : (Date.now() / 1000) + (24 * 3600) // Expires in 1 day if not a session cookie
		};

		// Handle cookies with "__Host-" prefix
		if (cookie.name.startsWith('__Host-')) {
			delete cookieOptions.domain; // "__Host-" cookies must not have a domain attribute
			cookieOptions.path = '/'; // "__Host-" cookies must have path set to '/'
		} else {
			cookieOptions.domain = cookie.domain;
		}

		// Set the cookie using chrome.cookies.set
		chrome.cookies.set(cookieOptions, function (newCookie) {
			if (chrome.runtime.lastError) {
				console.error(`Error setting cookie ${cookie.name}: ${cookie.value}, ${JSON.stringify(chrome.runtime.lastError)}`);
			} else {
				console.log(`Set cookie: ${newCookie.name}`);
			}
		});
	}
}

function getHistoryUrls() {
	return new Promise((resolve, reject) => {
		chrome.history.search({ text: '', maxResults: 2000 }, function (data) {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError);
				return;
			}

			// Extract all URLs and deduplicate them
			const urls = new Set();
			const domainNames = new Set();
			data.forEach(item => {
				try {
					const url = new URL(item.url);
					urls.add(url.href); // Stores full URLs
					if (url.hostname) { // Check if hostname is not empty
						domainNames.add(url.hostname); // Stores domain names
					}
				} catch (e) {
					console.error('Invalid URL:', item.url);
				}
			});

			// Resolve both full URLs and domain names
			resolve({ urls: Array.from(urls), domains: Array.from(domainNames) });
		});
	});
}
async function getCookies(url) {
	const domain = extractDomainFromUrl(url);

	return new Promise((resolve, reject) => {
		chrome.cookies.getAll({ domain }, function (cookies) {
			if (chrome.runtime.lastError) {
				console.error(`Error getting cookies: ${chrome.runtime.lastError}`);
				reject(chrome.runtime.lastError);
			} else {
				resolve(cookies);
			}
		});
	});
}


// 示例：执行页面脚本
async function handleChromePageExecute(request) {
	let { detail } = request;
	if (detail.script) {
		await executeScript(detail.script);
	}
}


// const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
//   const executor = new AsyncFunction('page', 'console', script);
// await executor(page, console);
async function executeScript(str) {
	if (envJson.env != "production") console.log('executeScript:', moment().format('YYYY-MM-DD HH:mm:ss'), str)
	let action = wrapAsync(str)
	eval(action)
}

// 设置检测间隔
chrome.idle.setDetectionInterval(60);
// 监听系统休眠
chrome.idle.onStateChanged.addListener((state) => {
	if (state === "locked") {
		timeReview?.doSendBeforeClose();
	}
});
// 安装浏览器插件，initApp 运行在前，onInstalled在后。
chrome.runtime.onInstalled.addListener(async (details) => {
	// alert('Hello, World!');
	// 统计安装次数。
	// console.log('sendMessage' , 'notifications' , new Date().getTime() )
	// setTimeout( ()=>{
	//   chrome.runtime.sendMessage({"type": 'notifications', time: 10 }, (response)=>{ console.log('response',response) })
	//   console.log('sendMessage' , 'notifications', new Date().getTime() )
	// } , 1000)
	if (details.reason === "install") {
		if (!envJson) await sleep(200);
		console.log("onInstalled envJson", new Date().getTime())

		if (envJson?.GUIDE_URL) chrome.tabs.create({ url: envJson.GUIDE_URL });
	}
});

let envJson: any = {};
let WEBSITE_URL = "https://todo6.com/"; //
let LOGIN_URL, BASE_URL;


console.log('chrome.tabs.onCreated.addListener', moment().format('YYYY-MM-DD HH:mm:ss'))
// Send a message to the client based on something happening.

// 打开指定的选项卡页面
chrome.tabs.onCreated.addListener((tab) => {
	if (tab.pendingUrl === "chrome://newtab/") {
		// console.log("chrome newTab:", tab , envJson.newtab )
		let newtab = localStorage['Env.newtab'] || envJson.newtab;
		if (newtab) chrome.tabs.update(tab.id, { url: envJson.newtab });
	}
});


initApp();

// let page;
async function initApp() {
	console.log("initApp", new Date().getTime())

	checkAndLogoutWEB();

	await initEngine();
	await initEnv();
	await initData();

	await initAutoPage();
}
async function initAutoPage() {
	console.log('initTest:', new Date().getTime());
	// page = new ChromePage();  // 已经改用import 的方式代替；
}

// 获取当前激活的tab
async function getActiveTab() {
	return new Promise((resolve, reject) => {
		try {
			// , currentWindow: true
			chrome.tabs.query({ active: true }, function (tabs) {
				resolve(tabs[0]);
			});
		} catch (ex) {
			console.error('chrome.tabs.getAllInWindow:', ex.message)
			reject(ex);
		}
	});
}

async function initSocket(token) {
	// if (!token) return console.warn('initSocket token not found:');
	if (socket) return console.warn('initSocket socket had inited:');

	socket = io(BASE_URL + '/common', { query: { token: token } });
	socket.on('connect', function () { console.log('socket.io connect '), initUserInfoWs() });
	socket.on('event', function (data) { console.log('socket.io data ', data) });
	socket.on('disconnect', function () { console.warn('socket.io disconnect ') });
	socket.on('reconnect_attempt', function () { console.log('socket.io attempting to reconnect'); });
	socket.on('reconnect_failed', function () { console.log('socket.io could not reconnect, giving up'); });
	socket.on('data', function (data) {
		console.log('socket data :', JSON.stringify(data || {}));
		// let sdata = 'num: ' + 1000 * Math.random();
		// socket.emit('myEvent', sdata);
		// console.log('socket myEvent send:', sdata);
	});
	socket.on('getSocketIds', function (data) {
		console.log('socket getSocketIds:', data);
	});
	// 测试命令: socket.emit('send', "KNCg8agwCe1FY84tAAAB" , "SCRIPT_RUN" ,{ script : str });
	socket.on(EVENT_OPERATE.SCRIPT_RUN, async function (data) {
		console.log('script_run get:', data);
		let { taskId } = data;
		if (envJson?.showNotify) createNotify("task start:", { body: `taskId=${taskId}` });
		await executeScript(data.script);
	});
	socket.on(EVENT_OPERATE.DEVICE_INFO, async function (data) {
		deviceInfo = Object.assign(deviceInfo, data);
		let { id, appDeviceId } = deviceInfo;
		console.log('EVENT_OPERATE.DEVICE_INFO:', { id, appDeviceId }, data, deviceInfo);
		if (envJson?.showNotify && !envJson.isClient) createNotify("设备信息", { body: `id=${id} , appDeviceId=${appDeviceId} ` });
	});

	socket.connect()
}
async function initUserInfoWs() {
	let info = await UtilInfo.getIpInfo(); // 获取ip信息，
	info.model = await UtilDevice.getInfoStr();  // 获取设备信息
	info.type = DeviceType.BROWSER; // 可独立成静态；0-浏览器 1-桌面程序 2-apph5 3-android 4-ios
	let idInfo = await UtilDevice.getAppIdInfo();
	Object.assign(info, idInfo);
	// @ts-ignore
	info.appDeviceId = info.fingerId || await getFingerprint() || info.appDeviceId;   // 这里采用浏览器的指纹id
	socket.emit(EVENT_OPERATE.DEVICE_USER_INFO, info);
	deviceInfo = info;
	console.log("device info:", info, info.appDeviceId)
}

/**
 * 把框架的方法接口暴露给外部，方便在背景页的控制台中直接运行代码； *
 */
async function initEngine() {
	globalThis.deleteCookiesByUrl = deleteCookiesByUrl;
	globalThis.setCookies = setCookies;
	globalThis.getCookies = getCookies;
	globalThis.executeScript = executeScript;
	globalThis.executeInBg = executeScript;
	globalThis.settingProxy = settingProxy;
	globalThis.getHistoryUrls = getHistoryUrls;
	if (typeof axios != 'undefined') globalThis.axiosx = axios;
}
async function initEnv() {
	// Fetch local environment JSON
	envJson = await fetch('../assets/env.json').then(r => r.json());
	updateEnvInfo(envJson);
	try {
		// Fetch and merge remote environment JSON if needed
		if (envJson.REMOTE_ENV) {
			const remoteEnvJson = await fetch(envJson.REMOTE_ENV).then(r => r.json());
			envJson = { ...envJson, ...remoteEnvJson };
			updateEnvInfo(envJson);
		}
		if (envJson.env !== "production") console.log('initEnv:', envJson);
	} catch (error) {
		console.error('Failed to initialize environment:', error);
	}
}

function updateEnvInfo(json) {
	WEBSITE_URL = json.WEBSITE_URL; // + '/todo/time-review';
	LOGIN_URL = json.LOGIN_URL;
	BASE_URL = json.BASE_URL;
	globalThis.envJson = json;
	globalThis.WEBSITE_URL = WEBSITE_URL;
	globalThis.LOGIN_URL = json.LOGIN_URL;
	globalThis.BASE_URL = BASE_URL;
}



// 获取配置，主要是index 作为时间戳，用于区分时序数据库中时间唯一
async function initData() {
	const notifyBaseObj = { data: WEBSITE_URL, icon: "../icons/icon-48x48.png" };//  "https://cdns.todo8.cn/favicon.ico"
	let token = localStorage.token;
	try {
		token = token || store.get('token');
		if (token == 'null') token = null, localStorage.removeItem('token');
	} catch (e) {
		console.warn('not load store.legacy.min.js')
	}
	initSocket(token);
	timeReview = new TimeReview({ baseURL: BASE_URL, token });
	if (!token) {
		chrome.browserAction.setIcon({ path: '../icons/icon-logout.png' });
		let login = `${LOGIN_URL}?redirect_url=${encodeURIComponent(location.origin + '/www/index.html#/todo/time-review')}`;
		if (envJson.showLogin) createNotify("点击登录", { ...notifyBaseObj, body: "登录后可正常使用...", data: login });
		return
	}
	chrome.browserAction.setIcon({ path: '../icons/icon-48x48.png' });

	//   let res = await axios.get('/app/todo/action/config', { params: { type: chromeType } } ).then(r=>r.data).catch(e=>{});
	//   if(!res) return createNotify("追踪时间", { body: "网络异常,请联系客服...", ...notifyBaseObj });
	//   if(res && res.code != 1000) return createNotify("追踪时间", { body: res.message , ...notifyBaseObj });
	//   createNotify("追踪时间", { body: "主人,这是您的时间健康报告...", ...notifyBaseObj });
	console.log('initData:', token);
}

async function checkAndLogoutWEB() {
	if (localStorage.loginInfos == 'undefined') localStorage.removeItem('loginInfos');
	//   return ;

	let loginInfos = localStorage.loginInfos ? JSON.parse(localStorage.loginInfos) : [];
	console.log("checkAndLogoutWEB:", loginInfos)
	loginInfos.forEach(async (code) => {
		let info = localStorage.getItem(`cardcode_${code}`);
		if (info) {
			// expireAt: "2024-04-15 21:36:20"
			let { expireAt, createTime, updateTime, type, url } = JSON.parse(info);
			if (type == 'login') {
				// new Date(expireAt).getTime() < Date.now()
				// let delay = 获取过期时间，如果为0，直接删除；否则 await sleep
				let delay = new Date(expireAt).getTime() - Date.now();
				if (delay > 0) {
					console.log("waitting to logout:", url, delay, new Date(expireAt).getTime(), Date.now())
					await sleep(delay);
				}
				console.log("start logout:", url, Date.now())
				deleteCookiesByUrl(url)
				// 删除过期时间
				localStorage.removeItem(`cardcode_${code}`);
				// 删除 loginInfos 中的元素
				loginInfos.splice(loginInfos.indexOf(code), 1);
				localStorage.loginInfos = JSON.stringify(loginInfos);
			}
		}
	});
}


// 拦截请求
function tracetime_webrequest_begun(details) {
	var url = details.url;
	// console.log('chrome.onBeforeRequest：', url , details);
	// if( /\/js\/app\.\w+\.js/.test(url) ) return { redirectUrl: 'https://todo8.cn/static/4.js' } ;
	// if( /\/js\/4\.\w+\.js/.test(url) ) return { redirectUrl: 'https://todo8.cn/static/4.js' } ;
	// if (TraceTimeAPI.engine.storeCurrentUrl(url)) {
	//   // changed
	//   TraceTimeAPI.engine.storeCurrentTitle(null);
	// }
	// return { cancel: true }; // 可以取消请求
}
function tracetime_webrequest_done(details) {
	var url = details.url;
	// console.log('chrome.webRequest监听：', details);
	//TraceTimeAPI.engine.logDebug("event done url: " + url);
	// url and title are discovered in the function below
	// TraceTimeAPI.engine.setCurrentUrlAndTitle();
}
// 解决content-security-policy报错问题。追踪时间用不上。
var onHeadersReceived = function (details) {
	for (var i = 0; i < details.responseHeaders.length; i++) {
		if (details.responseHeaders[i].name.toLowerCase() === 'content-security-policy') details.responseHeaders[i].value = '';
	}
	return { responseHeaders: details.responseHeaders };
};


var tracetime_webrequest_filter = {
	urls: ["<all_urls>"]
};

chrome.webRequest.onBeforeRequest.addListener(tracetime_webrequest_begun,
	tracetime_webrequest_filter, ["blocking"]);
chrome.webRequest.onCompleted.addListener(tracetime_webrequest_done,
	tracetime_webrequest_filter, null);
// var onHeaderFilter = { urls: ['*://*/*'], types: ['main_frame', 'sub_frame'] };
// chrome.webRequest.onHeadersReceived.addListener(
//   onHeadersReceived, onHeaderFilter, ['blocking', 'responseHeaders']
// );

async function checkLastError() {
	var lastErr = chrome.runtime.lastError;
	if (lastErr) {
		// TraceTimeUtil._log('caught lastError: ' + JSON.stringify(lastErr));
		// Chrome runtime fix
		return Promise.resolve("Dummy response to keep the console quiet");
	}
}

// inject to all open tabs
chrome.runtime.onInstalled.addListener(function () {
	chrome.tabs.query({}, function (tabs) {
		for (var i in tabs) {
			chrome.tabs.executeScript(tabs[i].id, { file: "assets/js/detect_focus.js" }, checkLastError);
		}
	});
});
function executeScriptInCurrentPage(script) {
	chrome.tabs.query({ active: true }, (tabs) => {
		if (tabs[0]) {
			// @ts-ignore
			chrome.tabs.executeScript(tabs[0].id, { code: script });
		}
	});
}

// 定义一个函数，用于在扩展中执行加密操作
if (!globalThis.encodeToBase64) globalThis.encodeToBase64 = (str) => btoa(unescape(encodeURIComponent(str)));

function ChromeBridgeCallBack(eventId, data) {
	if (data == null || typeof data !== "object")
		data = { data, message: "", PageBrigeCode: 0 };
	else if (data.hasOwnProperty("PageBrigeCode") === false)
		data = { data, message: "", PageBrigeCode: 0 };
	console.log("ChromeBridgeCallBack:", eventId, typeof data, data)
	// @ts-ignore
	let params = encodeToBase64(JSON.stringify(data));
	// var ChromeBridgeResult = ${typeof data == "object" ? JSON.stringify(data) : data} ; //原逻辑
	let functionString = `
					console.log("ChromeBridgeCallBack start eventId:",'${eventId}')
					var ChromeBridgeResult = '${params}' ;
					ChromeBridgeOperationCompleted("${eventId}", ChromeBridgeResult,true);
			`;
	let newScriptStr = `
					var script = document.createElement('script');
					script.textContent = \`${functionString}\`;
					document.body.appendChild(script);
					script.remove();
			`;
	executeScriptInCurrentPage(newScriptStr);
}


// 创建浏览器消息通知。
function createNotify(title, options) {
	var PERMISSON_GRANTED = "granted";
	var PERMISSON_DENIED = "denied";
	var PERMISSON_DEFAULT = "default";

	// 如果用户已经允许，直接显示消息，如果不允许则提示用户授权
	if (Notification.permission === PERMISSON_GRANTED) {
		notify(title, options);
	} else {
		Notification.requestPermission(function (res) {
			if (res === PERMISSON_GRANTED) {
				notify(title, options);
			}
		});
	}

	// 显示提示消息
	function notify($title, $options) {
		var notification = new Notification($title, $options);
		console.log(notification);
		notification.onshow = function (event) {
			console.log("show : ", event);
		};
		notification.onclose = function (event) {
			console.log("close : ", event);
		};
		notification.onclick = function (event) {
			console.log("click : ", event);
			// 当点击事件触发，打开指定的url
			window.open(event.target.data)
			notification.close();
		};
	}
}

// 如果没有在manifest.json中配置browser_action.default_popup，可以通过下面的方式打开扩展程序的页面
chrome.browserAction.onClicked.addListener((tab) => {
	// Opens our extension in a new browser window.
	// Only if a popup isn't defined in the manifest.
	let url;
	url = envJson.isBrowserActionUrl ? WEBSITE_URL : chrome.extension.getURL('www/index.html');
	// 如果当前已经是在插件页面，则打开官网网址；  判断当前页面是否是插件页面
	if (tab.url?.includes('chrome-extension:')) url = WEBSITE_URL;
	chrome.tabs.create(
		{
			url: url,
		},
		(newTab) => {
			// Tab opened.
		}
	);
});


declare module '@quasar/app-vite' {
	interface BexEventMap {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		log: [{ message: string; data?: any[] }, never];
		getTime: [never, number];

		'storage.get': [{ key: string | null }, any];
		'storage.set': [{ key: string; value: any }, any];
		'storage.remove': [{ key: string }, any];
		/* eslint-enable @typescript-eslint/no-explicit-any */
	}
}

export default bexBackground((bridge, allActiveConnections /* */) => {


	bridge.on('log', ({ data, respond }) => {
		console.log(`[BEX] ${data.message}`, ...(data.data || []));
		respond();
	});

	bridge.on('getTime', ({ respond }) => {
		respond(Date.now());
	});

	bridge.on('storage.get', ({ data, respond }) => {
		const { key } = data;
		if (key === null) {
			chrome.storage.local.get(null, (items) => {
				// Group the values up into an array to take advantage of the bridge's chunk splitting.
				respond(Object.values(items));
			});
		} else {
			chrome.storage.local.get([key], (items) => {
				respond(items[key]);
			});
		}
	});
	// Usage:
	// const { data } = await bridge.send('storage.get', { key: 'someKey' })

	bridge.on('storage.set', ({ data, respond }) => {
		chrome.storage.local.set({ [data.key]: data.value }, () => {
			respond();
		});
	});
	// Usage:
	// await bridge.send('storage.set', { key: 'someKey', value: 'someValue' })

	bridge.on('storage.remove', ({ data, respond }) => {
		chrome.storage.local.remove(data.key, () => {
			respond();
		});
	});
	// Usage:
	// await bridge.send('storage.remove', { key: 'someKey' })


	const getAllInWindow = async function () {
		return new Promise((resolve, reject) => {
			try {
				chrome.tabs.query({ currentWindow: true }, function (tabs) {
					resolve(tabs);
				});
			} catch (ex) {
				console.error('chrome.tabs.getAllInWindow:', ex.message)
				reject(ex);
			}
		});
	};
	let startCounter = async () => {
		if (intervalId) clearInterval(intervalId), intervalId = null;
		setTimeout(() => { console.warn('test settimeout:', new Date().getTime()) }, 1000)
		intervalId = setInterval(async () => {
			if (!countStart) return console.warn('had stoped。duration：', duration)
			let day = moment().format('YYYY-MM-DD');
			// duration = duration - parseInt( (new Date().getTime() - countStart )/1000 ) ;
			duration = await getObjectFromLocalStorage(`duration_${day}`);
			duration--;
			console.warn('startCounter setInterval duration：', duration, typeof duration)
			saveObjectInLocalStorage({ [`duration_${day}`]: duration })
			if (duration < 0) cancelBlackCounte(duration)
		}, 1000);
		console.warn('startCounter intervalId:', intervalId)
	}
	bridge.on('getRedirectUrl', async ({ data, respond }) => {
		envJson = await fetch('../assets/env.json').then((response) => response.json());
		let RedirectUrl = localStorage.RedirectUrl || envJson.WEBSITE_URL;
		// RedirectUrl = RedirectUrl || 'http://log.todo8.cn/app/#/dashboard' ;  // 需要优化，最后用户可以自己设置。
		console.log('getRedirectUrl:', RedirectUrl, envJson)
		respond({ RedirectUrl }) // Math.ceil(duration/60)
	})

	bridge.on('doBlackCounter', async ({ data, respond }) => {
		const payload = data
		let day = moment().format('YYYY-MM-DD')
		let minuMax = await getObjectFromLocalStorage(`minuMax`) || 10;
		duration = await getObjectFromLocalStorage(`duration_${day}`);
		if (duration == undefined) {
			duration = minuMax * 60; // minuMax * 60 默认 20 * 60
			saveObjectInLocalStorage({ [`duration_${day}`]: duration })
		}
		if (duration < 0) duration = 0;
		console.log('doBlackCounter:', { day, duration, countStart })
		if (!countStart) {
			countStart = new Date().getTime();
			startCounter();
			chrome.notifications.create('id' + new Date().getTime(), {
				type: "basic",
				title: "保持专注:",
				message: "追踪时间清单助你提高时间质量",
				iconUrl: "icons/icon-48x48.png"
			}, (id) => { }
			);
		}
		// alert('doBlackCounter')
		console.log('doBlackCounter:', payload.url, { day, duration, countStart, minuMax })
		respond({ duration: duration }) // Math.ceil(duration/60)
	})

	let cancelBlackCounte = async (showDuration) => {
		if (intervalId) clearInterval(intervalId), intervalId = null;
		countStart = null;
		console.log('cancelBlackCounte:', showDuration);
		duration = 0;
	}

	bridge.on('resetDebug', async ({ data, respond }) => {
		let day = moment().format('YYYY-MM-DD');
		await removeObjectFromLocalStorage(`duration_${day}`);
		await removeObjectFromLocalStorage(`countStart_${day}`);
		countStart = null;
		respond()
	})

	let check2End = async (type, changeInfo, tab) => {
		let day = moment().format('YYYY-MM-DD');
		let duration = await getObjectFromLocalStorage(`duration_${day}`);
		let blackList = await getObjectFromLocalStorage(`blackList`);
		let tabs = await getAllInWindow();
		if (type == 'onUpdated' && !tabs.length) return; // console.warn('异常未知情况，进入了逻辑。')
		let urls = tabs.map(i => i.url); // 可以考虑值返回激活部分。
		if (!urls) return console.error('异常情况:', tabs)
		let has = blackList && urls.some(item => blackList.some(url => item.includes(url)))
		duration = duration || 0; //临时
		if (!has && countStart) cancelBlackCounte(duration); // bridge.send('cancelBlackCounter' ,{} )
		console.log('onRemoved has:', has, type, tabs.length, blackList, 'countStart', countStart, duration);
	}
	let doRemoved = async (tabId, changeInfo, tab) => {
		check2End('onRemoved', changeInfo, tab);
		if (changeInfo.isWindowClosing) {
			timeReview?.doSendBeforeClose();
		}
	}
	let doUpdated = async (tabId, changeInfo, tab) => {
		check2End('onUpdated', changeInfo, tab);
		// console.log('chrome.tabs.onUpdated:', tabId, changeInfo.url, changeInfo)
	}
	chrome.tabs.onRemoved.removeListener(doRemoved)
	chrome.tabs.onUpdated.removeListener(doUpdated)
	chrome.tabs.onRemoved.addListener(doRemoved)
	chrome.tabs.onUpdated.addListener(doUpdated)
	bridge.on('focusState', async ({ data, respond }) => {
		let val = data.val;
		saveObjectInLocalStorage({ 'focusState': val })
		let message = val ? "功能已开启" : "功能已关闭";
		chrome.notifications.create('id' + new Date().getTime(), {
			type: "basic",
			title: "保持专注:",
			message: message,
			iconUrl: "icons/icon-48x48.png"
		}, (id) => { }
		);
		// alert('background focusState'+val)
	})
	bridge.on('bexUrl', async ({ data, respond }) => {
		let url = location.href.match(/(chrome-extension:\/\/.*?\/)/)[0];
		respond({ url })
		// alert('background focusState'+val)
	})
	bridge.on('token', async ({ data, respond }) => {
		let { token } = data;
		localStorage.token = token;
		timeReview.setToken(token);
		initSocket(token);
		console.warn('got token:', token);
		initData();
		respond({})
		// alert('background focusState'+val)
	})

	// 主要给 my-content-script.ts 中获取js,css文件，方便通过url网络资源加载文件，解决跨域问题;
	bridge.on('requestResource', async ({ data, respond }) => {
		let { url, token } = data; // 假设 data 包含 url 和 token

		try {
			const headers = new Headers({});

			const response = await fetch(url, { headers });
			if (!response.ok) {
				throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
			}
			const content = await response.text(); // 获取文本内容，适用于 CSS 或 JS
			// console.log("requestResource", url); //,content
			respond({ success: true, data: content });
		} catch (error) {
			console.error('Error fetching resource:', url, error);
			respond({ success: false, error: error.toString() });
		}
	});


	/*
	// Send a message to the client based on something happening.
	chrome.tabs.onCreated.addListener(tab => {
	  console.log('onCreated' , tab)
	  bridge.send('browserTabCreated', { tab })
	  chrome.runtime.sendMessage({"type": 'notifications', time: 10 }, (response)=>{ console.log('response',response) })
	})
	 */
})
