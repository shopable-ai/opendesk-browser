
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

// 在common.js中