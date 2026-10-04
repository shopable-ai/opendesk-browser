const CustomChromeEvt = "chromeCustomEvt";
const CHROME_PAGE_EXECUTE = "CHROME_PAGE_EXECUTE";
const CHROME_BRIDGE_INTERFACE = "CHROME_BRIDGE_INTERFACE";
const CHROME_BRIDGE_POPUP = "CHROME_BRIDGE_POPUP";

function createCustomEventRequestId(prefix = "evt") {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildCustomEventMeta(source, requestId, meta) {
	return {
		protocolVersion: "1.0",
		requestId,
		source,
		timestamp: Date.now(),
		...(meta && typeof meta === "object" ? meta : {}),
		requestId
	};
}

function buildRuntimeMessageFromCustomEvent(evt) {
	const rawDetail = evt?.detail;
	const hasObjectDetail = rawDetail && typeof rawDetail === "object" && !Array.isArray(rawDetail);
	const requestId = hasObjectDetail && typeof rawDetail.requestId === "string" && rawDetail.requestId.length > 0
		? rawDetail.requestId
		: (hasObjectDetail && typeof rawDetail.meta?.requestId === "string" && rawDetail.meta.requestId.length > 0
			? rawDetail.meta.requestId
			: createCustomEventRequestId(evt?.type === CHROME_BRIDGE_POPUP ? "evt_popup" : "evt"));
	const meta = buildCustomEventMeta("custom-event", requestId, hasObjectDetail ? rawDetail.meta : undefined);
	const detail = hasObjectDetail
		? {
			...rawDetail,
			requestId,
			meta
		}
		: rawDetail;
	return {
		active: "true",
		type: "hid_" + evt.type,
		title: document.title,
		url: window.location.href,
		requestId,
		meta,
		detail
	};
}

var CustomEventDetector = {
	events: [CustomChromeEvt, CHROME_PAGE_EXECUTE, CHROME_BRIDGE_INTERFACE, CHROME_BRIDGE_POPUP],
	messager: function (evt) {
		try {
			const message = buildRuntimeMessageFromCustomEvent(evt);
			chrome.runtime.sendMessage(message, function (response) {
				if (chrome.runtime.lastError) {
					console.log("Chrome runtime error:", chrome.runtime.lastError, message.requestId);
					return;
				}
				if (response?.success === false) {
					console.warn("Custom event bridge response error:", response.errorCode, response.error, message.requestId);
				}
			});
		} catch (e) {
			console.log('Error in event handling:', e);
			CustomEventDetector.removeEventListeners();
		}
	},
	addEventListeners: function () {
		for (var i = 0; i < CustomEventDetector.events.length; i++) {
			window.addEventListener(CustomEventDetector.events[i], CustomEventDetector.messager, false);
		}
	},
	removeEventListeners: function () {
		for (var i = 0; i < CustomEventDetector.events.length; i++) {
			window.removeEventListener(CustomEventDetector.events[i], CustomEventDetector.messager);
		}
	}
};

CustomEventDetector.addEventListeners();
console.log('CustomEventDetector initialized in', window);
