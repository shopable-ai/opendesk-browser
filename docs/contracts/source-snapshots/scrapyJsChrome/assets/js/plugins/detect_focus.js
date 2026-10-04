



var TimeReviewDetector = {
	events: ["focus", "click", "keydown", "mousemove"],
	not_before: 0,
	messager: function (evt) {
		var now = Date.now();
		if (evt.type != "mousemove" && window.location.href.includes('debug')) console.log('event:', evt, evt.detail)
		// 如果是CustomChromeEvt事件，则不需要判断时间间隔
		if (now > TimeReviewDetector.not_before) {
			var hid_type = "hid_" + evt.type;
			try {
				chrome.runtime.sendMessage({ "active": "true", "type": hid_type, title: document.title, url: window.location.href, detail: evt.detail }, function (response) {
					var lastErr = chrome.runtime.lastError;
					if (lastErr) {
						// Chrome runtime fix
						return Promise.resolve("Dummy response to keep the console quiet");
					}
				});
				// Set not_before only if the event isn't CustomChromeEvt
				if (evt.type !== CustomChromeEvt) {
					TimeReviewDetector.not_before = now + 250;
				}
			} catch (e) {
				console.log('RT: removing stale event listeners due to update');

				for (var i = 0; i < TimeReviewDetector.events.length; i++) {
					window.removeEventListener(TimeReviewDetector.events[i], TimeReviewDetector.messager);
				}
			}
		}
	}
};

// 打开页面时监听事件。
for (var i = 0; i < TimeReviewDetector.events.length; i++) {
	window.removeEventListener(TimeReviewDetector.events[i], TimeReviewDetector.messager);
	window.addEventListener(TimeReviewDetector.events[i], TimeReviewDetector.messager, false);
}

console.log('detect file in', window)
