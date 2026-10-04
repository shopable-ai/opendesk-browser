const CustomChromeEvt = "chromeCustomEvt";
const CHROME_PAGE_EXECUTE = "CHROME_PAGE_EXECUTE";
const CHROME_BRIDGE_INTERFACE = "CHROME_BRIDGE_INTERFACE";

var CustomEventDetector = {
	events: [CustomChromeEvt, CHROME_PAGE_EXECUTE, CHROME_BRIDGE_INTERFACE],
	messager: function (evt) {
		try {
			chrome.runtime.sendMessage({
				"active": "true",
				"type": "hid_" + evt.type,
				title: document.title,
				url: window.location.href,
				detail: evt.detail
			}, function (response) {
				if (chrome.runtime.lastError) {
					console.log("Chrome runtime error:", chrome.runtime.lastError);
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
