globalThis.AppLocal = {
	setItem: async function (key,value) {
		return await callChromeBridgeInterface('APPLOCAL_SETITEM', { key,value });
	},
	getItem: async function (key) {
		return await callChromeBridgeInterface('APPLOCAL_GETITEM', { key });
	},
	removeItem: async function (key) {
		return await callChromeBridgeInterface('APPLOCAL_REMOVEITEM', { key });
	},
}
