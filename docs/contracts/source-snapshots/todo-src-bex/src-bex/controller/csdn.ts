import axios from "axios"


export const csdnApp = {
	read: async (url) => {
		let api = 'https://api.todo6.com/app/operate/csdn/read';
		// let api = 'http://apidev.todo6.com/app/operate/csdn/read';
		let api_key, token;
		// api_key = 'b48fac8f-3216-45cc-96f2-68d53182e7b2';
		token = localStorage.token;
		let res = await axios.get(api, { params: { url, token, api_key, encode: 'base64' } }).then(res => res.data);
		return res;
	},
	download: async (url) => {
		let api = 'https://api.todo6.com/app/operate/csdn/download';
		// let api = 'http://apidev.todo6.com/app/operate/csdn/download';
		let api_key, token;
		// api_key = 'b48fac8f-3216-45cc-96f2-68d53182e7b2';
		// api_key = '5ef61c44-c133-4197-8096-0bb5c9fd2e5e'; // 无下载次数
		token = localStorage.token;
		let res = await axios.get(api, { params: { url, token, api_key } }).then(res => res.data);
		return res;
	},
	vipLogin: async (code) => {
		let api = 'https://api.todo6.com/open/operate/cardonce/use';
		let res = await axios.get(api, { params: { code, type: "chrome", encode: 'base64' } }).then(res => res.data);
		return res;
	}
}
