
function generateEventId() {
	return Date.now() + "-" + Math.random().toString(36).substr(2, 9);
}
globalThis.ChromeBridgeEvents = globalThis.ChromeBridgeEvents || new Map();

if(!globalThis.decodeBase64) globalThis.decodeBase64 = (encodedStr)=> decodeURIComponent(escape(atob(encodedStr)));


/**
 * 回调方法，用于完成网页中的跨环境await功能。
 * 用户访问的网页中调用框架background.ts的逻辑，background.ts执行完成后，会调用这个方法，将结果返回给网页。完成网页中的await功能。
 * @param {*} eventId 框架生成唯一的事件ID
 * @param {*} result
 */
function ChromeBridgeOperationCompleted(eventId, result, isBase64) {
	let event = globalThis.ChromeBridgeEvents.get(eventId) || {};
	let { resolve, reject } = event;
	if (resolve) {
		try {
			let res ;
			if(!isBase64) res = typeof result == 'string' ? JSON.parse(result) : result;  // 全部采用base64字符传递，方便跨浏览器传递特殊字符;
			else res = typeof result == 'string' ? JSON.parse( decodeBase64(result)) : result;
			let { PageBrigeCode, message, data } = res;
			if (!!PageBrigeCode) {
				// console.log('ChromeBridge operationCompleted reject', message);
				reject(message);
			}
			else {
				// console.log('ChromeBridge operationCompleted resolve', data);
				resolve(data);
			}
		}
		catch (e) {
			reject('json parse error in ChromePage operationCompleted');
		}
	}
	else {
		console.log('ChromeBridgeCallBackOperationCompleted has not eventId.', Object.keys(globalThis.ChromeBridgeEvents), eventId);
	}

	return "";
}

function executeInBg(script){
	let event = new CustomEvent('CHROME_PAGE_EXECUTE', { detail: { script } });
	window.dispatchEvent(event);
}

globalThis.executeScript = executeInBg;
