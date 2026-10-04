globalThis.AppStorage = {
	setItem: async function (key,value) {
		return await callChromeBridgeInterface('APPSTORAGE_SETITEM', { key,value });
	},
	getItem: async function (key) {
		return await callChromeBridgeInterface('APPSTORAGE_GETITEM', { key });
	},
	removeItem: async function (key) {
		return await callChromeBridgeInterface('APPSTORAGE_REMOVEITEM', { key });
	},
	clear: async function () {
		return await callChromeBridgeInterface('APPSTORAGE_CLEAR', { });
	},
}
