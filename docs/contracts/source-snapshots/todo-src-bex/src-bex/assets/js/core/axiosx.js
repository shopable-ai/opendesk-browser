
/**
 *
axiosx.get("http://baidu.com",{ params: { kw: 'csdn'} }).then(res=>{
    console.log("axiosx:",res)
})
axiosx.get("http://test.com/open/common/info/ipInfo").then(res=>{
    console.log("axiosx:",res, res.data)
})
 */
globalThis.axiosx = {
	get: async function (url, config) {
		return await callChromeBridgeInterface('AXIOS_GET', { BridgeUrl_Inject: url, config });
	},
	post: async function (url, data, config) {
		return await callChromeBridgeInterface('AXIOS_POST', { BridgeUrl_Inject: url, data, config });
	},
	put: async function (url, data, config) {
		return await callChromeBridgeInterface('AXIOS_PUT', { BridgeUrl_Inject: url, data, config });
	},
	delete: async function (url, config) {
		return await callChromeBridgeInterface('AXIOS_DELETE', { BridgeUrl_Inject: url, config });
	},
}

async function callChromeBridgeInterface(functionName, params) {
	let eventId = generateEventId();
	params = params || {};
	// params.eventId = eventId;
	let promise = new Promise((resolve, reject) => {
		globalThis.ChromeBridgeEvents.set(eventId, { resolve, reject });
		// let EventName = 'CHROME_BRIDGE_' + functionName;
		// console.log('callChromeBridgeInterface', functionName, params);
		window.dispatchEvent(new CustomEvent('CHROME_BRIDGE_INTERFACE', {
			detail: {
				...params,
				BridgeEventName: functionName,
				BridgeEventId: eventId
			}
		}));
	});
	return promise;
}