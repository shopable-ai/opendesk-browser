// Hooks added here have a bridge allowing communication between the BEX Content Script and the Quasar Application.
// More info: https://quasar.dev/quasar-cli/developing-browser-extensions/content-hooks


// More info: https://quasar.dev/quasar-cli/developing-browser-extensions/content-hooks
import { getObjectFromLocalStorage, saveObjectInLocalStorage, removeObjectFromLocalStorage } from './chrome-local-storage-api.js';
import { bexContent } from 'quasar/wrappers'
if (!globalThis.sleep) globalThis.sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

jQuery.noConflict();

let min5Id, min2Id, min1Id, minId, focusState;
export default bexContent(async (bridge /*  */) => {
	// Hook into the bridge to listen for events sent from the client BEX.
	/*
	bridge.on('some.event', event => {
	  if (event.data.yourProp) {
		// Access a DOM element from here.
		// Document in this instance is the underlying website the contentScript runs on
		const el = document.getElementById('some-id')
		if (el) {
		  el.value = 'Quasar Rocks!'
		}
	  }
	})
	*/
	let hasBlack = async (url) => {
		let { data } = await bridge.send('storage.get', { key: 'blackList' })
		let blackList = data || [];
		let has = blackList.some(i => url.includes(i))
		return has;
	}
	// customImage: 'img/info.png' ,customImage: "icons/icon-48x48.png"
	let baseNotifyOpts = { title: '消息提醒标题:', "description": "追踪时间清单描述", image: { visible: true }, "position": "top-right", "closeWith": ["click"], "animation": { "open": "slide-in", "close": "slide-out" }, "showButtons": false, "buttons": { "action": {} }, "showProgress": true, closeTimeout: 5000, zIndex: 99998 } // zIndex 未生效
	let notify = (obj) => {
		setTimeout(async () => {
			focusState = await getObjectFromLocalStorage('focusState');
			if (focusState != false) GrowlNotification.notify(Object.assign({}, baseNotifyOpts, { title: '保持专注:', description: '追踪时间清单助你提高时间质量', closeTimeout: 10000, type: 'error' }, obj || {}));
		}, 1000)
	}

	let checkStart = async () => {
		let url = document.location.href;
		let has = await hasBlack(url);
		let { data: UrlObj } = await bridge.send('getRedirectUrl'); // background-hooks 中获取。
		let RedirectUrl = UrlObj.RedirectUrl + '?from=chromeFocus';
		if (has && !focusState) return notify({ description: `屏蔽已关闭,这是您想要减少时间浏览的网页` })
		if (has) {
			let { data: rdata } = await bridge.send('doBlackCounter', { url })
			if (rdata) {
				if (rdata.duration > 0) {
					// 网页上notify 提示剩余时间
					let min5 = rdata.duration - 5 * 60;
					let min2 = rdata.duration - 2 * 60;
					let min1 = rdata.duration - 1 * 60;
					if (rdata.duration > 0) {
						if (rdata.duration > 60) notify({ description: `剩余时间 ${Math.floor(rdata.duration / 60)} 分钟，追踪时间清单助你提高时间质量` })
						else notify({ description: `剩余时间 ${rdata.duration} 秒，追踪时间清单助你提高时间质量` })
					}
					if (min5 > 0) min5Id = setTimeout(() => { notify({ description: `剩余时间 5 分钟，追踪时间清单助你提高时间质量` }) }, min5 * 1000)
					if (min2 > 0) min2Id = setTimeout(() => { notify({ description: `剩余时间 2 分钟，追踪时间清单助你提高时间质量` }) }, min2 * 1000)
					if (min1 > 0) min1Id = setTimeout(() => { notify({ description: `剩余时间 1 分钟，追踪时间清单助你提高时间质量` }) }, min1 * 1000)
					minId = setTimeout(async () => {
						focusState = await getObjectFromLocalStorage('focusState');
						if (focusState != false) location.href = RedirectUrl
					}, rdata.duration * 1000)
					// alert('剩余时间 start ：' + rdata.duration  )
				} else if (rdata.duration <= 0) {
					notify({ description: `时间已用完，5秒内自动关闭` })
					setTimeout(async () => {
						focusState = await getObjectFromLocalStorage('focusState');
						if (focusState != false) location.href = RedirectUrl
					}, 5000)
				}
			}
		}
		// alert("checkStart:" + has + ' ' + document.location.href )
	}
	async function appendScript(url, content: string | null = null, isModule = false) {
		let scriptElement = document.createElement('script');
		scriptElement.type = isModule ? 'module' : 'text/javascript';
		if (url) {
			if (url.startsWith('chrome-extension')) scriptElement.src = url;
			else { // 从网络获取内容，
				try {
					// 假设已经存在一个发送请求的 Bridge 函数
					// 你需要将此函数定义在某处，并确保它可以调用
					const response = await requestResourceByBridge(url);
					if (response.success) {
						scriptElement.textContent = response.data;
					} else {
						throw new Error('Failed to load resource: ' + response.error);
					}
				} catch (error) {
					console.error('Error loading script:', url , error);
					return; // 如果出现错误，不再继续执行
				}
			}
		}
		if (content) {
			scriptElement.innerHTML = content;
		}
		document.head.appendChild(scriptElement);
		}


	async function requestResourceByBridge(url) {
		let { data } = await bridge.send('requestResource', { url });

		// console.log("requestResource url:",url , data)
		return data ;
	}

	function appendCSS(url) {
		let linkElement = document.createElement('link');
		linkElement.rel = 'stylesheet';
		linkElement.href = url;
		document.head.appendChild(linkElement);
	}

	let initData = async () => {
		console.log('content.js initData body=', !!document.body, new Date().getTime(), location.href)
		document.addEventListener('DOMContentLoaded', function () {
			console.log('content.js Current URL:', new Date().getTime(), location.href);
		});

		focusState = await getObjectFromLocalStorage('focusState');
		if (focusState == undefined) focusState = true;
		let { data } = await bridge.send('bexUrl');
		let bexFocusUrl = data.url + 'www/index.html/todo/focus';
		jQuery(document).ready(function () {
			console.log("content.js jquery document ready:", new Date().getTime(), location.href)
			document.body.setAttribute("time-review", bexFocusUrl);
			var metaTag = document.createElement("meta");
			metaTag.setAttribute("name", "time-review");
			metaTag.setAttribute("content", bexFocusUrl);
			document.head.appendChild(metaTag);
			let url;
			try {
				// manifest.json 中引入的css 同等效果；
				// appendCSS(chrome.runtime.getURL(`assets/css/quasar.css`));
				// appendCSS(chrome.runtime.getURL(`assets/css/quasarNoH16.css`));
				// appendCSS(chrome.runtime.getURL(`assets/css/quasar.font.css`));
				// appendCSS(chrome.runtime.getURL(`assets/css/quasar.addon.css`));
				
				// appendCSS(chrome.runtime.getURL(`assets/app_script/app_csdn.css`));

				appendScript(chrome.runtime.getURL(`assets/js/core/brige.js`));
				appendScript(chrome.runtime.getURL(`assets/js/core/common.js`));
				appendScript(chrome.runtime.getURL(`assets/js/core/axiosx.js`));
				appendScript(chrome.runtime.getURL(`assets/js/core/appStorage.js`));
				appendScript(chrome.runtime.getURL(`assets/js/core/appLocal.js`));
				appendScript(chrome.runtime.getURL(`assets/js/core/utils.js`));
	  
				appendScript(chrome.runtime.getURL(`assets/js/lodash.min.js`));
				appendScript(chrome.runtime.getURL(`assets/js/moment.min.js`));
				appendScript(chrome.runtime.getURL(`assets/js/axios.min.js`));
				appendScript(chrome.runtime.getURL(`assets/js/js.cookie.min.js`));
	  
				appendScript(chrome.runtime.getURL(`assets/js/utils.js`));
				appendScript(chrome.runtime.getURL(`assets/js/Env.js`));
				// appendScript(chrome.runtime.getURL(`assets/js/vue.global.prod.js`));
				// setTimeout(()=>{
				//   appendScript(chrome.runtime.getURL(`assets/js/quasar.umd.js`));
				// },50)
	  
				// appendScript(chrome.runtime.getURL(`assets/js/react.development.js`));
				// appendScript(chrome.runtime.getURL(`assets/js/react-dom.development.js`));
				// appendScript(chrome.runtime.getURL(`assets/js/babel.min.js`));
	  
				appendScript(chrome.runtime.getURL(`assets/js/fingerprintjs@3.js`));
			   
	  
				let CHROME_EXTENSION_URL = chrome.extension.getURL("www/index.html");
				appendScript(null, `globalThis.CHROME_EXTENSION_URL = '${CHROME_EXTENSION_URL}';`);
				setTimeout(async function() {
				  let url2 = chrome.runtime.getURL(`assets/env.json`);
				  let envJson = await fetch(url2).then((r) => r.json());
				  envJson = envJson || {};
				  envJson.APP_ENV = envJson.APP_ENV || "";
				  if (envJson.APP_ENV == "bilivip" && envJson.isClient) {
					appendScript(chrome.runtime.getURL(`assets/app_script/csdnbase.js`));
					appendScript(chrome.runtime.getURL(`assets/app_script/csdn.js`));
					appendScript(chrome.runtime.getURL(`assets/app_script/app_chatGpt.js`));
					
					// appendScript(`http://static.todo6.com/app_script/csdn.js`);
				  }
				  if (envJson.APP_ENV.toLocaleLowerCase() == "testmonkey")
					appendScript(chrome.runtime.getURL(`assets/js/testMonkey.esm.js`), null, true);
					console.log("content hooks ready", envJson.isClient);
				}, 100);
			  }catch(e){
				console.error("content.js initData error:", e)
			  }
		});

		console.log('my-content-script.js 我被执行了！, window.evalTest:', window.evalTest);
		// eval(`
		// window.evalTest = Object.assign( window.evalTest || {} , { contentHook: 'useful'} ) ;
		// console.log('show eval window.evalTest:' , window.evalTest )
		// `)
	}
	bridge.on('testEvt', async (event) => {
		let val = event.data.val;
		console.log('bridge testEvt')
		alert('content focusState' + val)
		// if( !val ){
		//   clearTimeout(min5Id),clearTimeout(min2Id),clearTimeout(min1Id),clearTimeout(minId),min5Id=min2Id=min1Id=minId=null ;
		//   notify({description:`屏蔽已关闭,这是您想要减少时间浏览的网页`})
		// }
		// saveObjectInLocalStorage({'focusState':val})
	})
	setTimeout(() => {
	}, 2000);
	// do while 检查等到document.body为真时，再执行后续代码
	while (!document.body) {
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	initData()
	checkStart()

	// notify({description:`测试：剩余时间 ？？ 秒，追踪时间清单助你提高时间质量` , closeTimeout:500000 , zIndex: 99994}) //生效
})

	; (function () {
		console.log('content.js hooks ', document, !!document.body, new Date().getTime())
	})()

