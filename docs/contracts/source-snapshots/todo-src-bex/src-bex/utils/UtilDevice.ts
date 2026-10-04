
import { getObjectFromLocalStorage, saveObjectInLocalStorage } from "../chrome-local-storage-api";
import { DeviceType } from "../operate/Device.cst";
// import FingerprintJS from '@fingerprintjs/fingerprintjs';
// 在manifest.json中 background.js 已经导入。

const isElectron = () => {
	return window && window.process && window.process.type;
};
const isChromeExtension = () => {
	return window && window.chrome && window.chrome.runtime && window.chrome.runtime.id;
}


class UtilDevice {
	static getInfo(): any {
		if (isElectron()) {
			const os = {} as any; //  require('os');
			return {
				platform: os.platform(),
				release: os.release(),
				hostname: os.hostname(),
				arch: os.arch(),
				totalMem: os.totalmem(),
				freeMem: os.freemem(),
				cpuCount: os.cpus().length
			};
		} else {
			return {
				userAgent: navigator.userAgent,
				platform: navigator.platform,
				language: navigator.language,
				online: navigator.onLine
			};
		}
	}

	static getBrowserInfo(userAgent: string): string {
		const browsers = [
			{ name: "Chrome Canary", regex: /Chrome\/(\S+).*\s+Edg\// },
			{ name: "Edge", regex: /Edg\/(\S+)/ },
			{ name: "Chrome", regex: /Chrome\/(\S+).*\s+Safari\// },
			{ name: "Firefox", regex: /Firefox\/(\S+)/ },
			{ name: "Safari", regex: /Safari\/(\S+)/ },
			{ name: "IE", regex: /MSIE (\S+);/ }
		];

		for (const browser of browsers) {
			const match = userAgent.match(browser.regex);
			if (match) {
				return `${browser.name} ${match[1]}`;
			}
		}

		return userAgent; // 如果无法识别则返回完整的 userAgent
	}

	static getInfoStr(): string {
		const info = this.getInfo();

		if (isElectron()) {
			return `Electron on ${info.platform} ${info.release}`;
		} else {
			return this.getBrowserInfo(info.userAgent);
		}
	}

	static generateRandomString(length): string {
		let result = '';
		const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const charactersLength = characters.length;

		for (let i = 0; i < length; i++) {
			result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}

		return result;
	}
	static async getAppId(): Promise<string> {
		let appDeviceId = "";
		// 如果是 chrome extension，则从浏览器插件的缓存中获取 appDeviceId
		if (isChromeExtension()) {
			appDeviceId = await getObjectFromLocalStorage("appDeviceId");
			if (appDeviceId && appDeviceId.length == 16) return appDeviceId;
			// 如果没有 appDeviceId ，则使用lodash 随机16个字符串创建一个，并保存到浏览器插件的缓存中 saveObjectInLocalStorage
			appDeviceId = this.generateRandomString(16);
			saveObjectInLocalStorage({ "appDeviceId": appDeviceId });
		} else {
			appDeviceId = localStorage.getItem("appDeviceId") || "";
			if (appDeviceId && appDeviceId.length == 16) return appDeviceId;
			// 如果没有 appDeviceId ，则使用lodash 随机16个字符串创建一个，并保存到浏览器插件的缓存中 saveObjectInLocalStorage
			appDeviceId = this.generateRandomString(16);
			localStorage.setItem("appDeviceId", appDeviceId);
		}
		console.log("appDeviceId:", appDeviceId)
		return appDeviceId
	}
	// "$price_$count"
	static async getFingerprint() {
		let visitorId;
		try {
			// @ts-ignore
			const fp = await FingerprintJS.load();  // 从ba
			const result = await fp.get();
			visitorId = result.visitorId;
		} catch (e) {

		}
		return visitorId
	}
	static async getAppIdInfo(): Promise<Object> {
		let info = {};
		if (isChromeExtension()) {
			info = {
				// idType: "chromeExtension",
				type: DeviceType.BROWSER,
				chromeId: window.chrome.runtime.id,
				appDeviceId: await this.getAppId(),
				fingerId: await this.getFingerprint(),  // 浏览器指纹;
			}
		}
		return info;
	}

}

export default UtilDevice;
