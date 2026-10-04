if (!globalThis.sleep) globalThis.sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));
console.log('初始化框架开始 by WebAppVip plugin');

class WebAppVip {
	// 传入网站的url，方便判断是否进入逻辑。
	constructor(url) {
		this.url = url;
		// 从url中提取出域名，删除https://相关部分
		this.appname = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
		// this.initApp();
	}
	// 初始化app，入口函数
	async initApp() {
		// 如果域名中不是 目标网站 则不执行。
		if (!location.hostname.includes(this.url)) return;

		console.log("initApp", this.url)
		await sleep(100);
		try {
			await this.initData();
			await this.initView();
			await this.initEvent();
			await this.initLogic();
		} catch (e) {
			console.log("initApp error:", e)
		}
	}
	// 初始化数据
	async initData() {
		let fingerId;
		let deviceCode = await AppStorage.getItem('deviceCode');
		if (!deviceCode) {
			fingerId = await getFingerprint();
			AppStorage.setItem('deviceCode', fingerId);
		}
		localStorage.deviceCode = deviceCode || fingerId || localStorage.deviceCode || generateRandomString(16);
		// console.log("localStorage.deviceCode:", localStorage.deviceCode)
	}
	// 初始化界面，放一些ui界面初始化和修改的.
	async initView() {
		this.initPluginStatus();
	}
	// 初始化时间，可能用来覆盖原按钮的点击事件
	initEvent() {}
	// 初始化业务逻辑
	async initLogic() {
		await this.checkSetting();
		await this.checkRelogin();
		await this.checkLogin();
		await this.initCustomLogout();
	}
	async checkSetting() {
		const queryString = location.href.includes('?') ? location.href.replace(/.*\?/, '?') : '';
		if (!queryString.includes('proxy')) return console.log('checkSetting no proxy');

		const urlParams = new URLSearchParams(queryString.replace(/\/#\/.*/, ''));
		let proxy = urlParams.get('proxy');
		console.log('checkSetting urlParams', urlParams, {proxy	});
		// if (!proxy?.length) proxy = null ;   // 下面是字符串，这里用null，基本会报错。

		let script = `settingProxy('${proxy}'); `;
		executeScript(script);
		if (proxy) {
			await AppStorage.setItem('proxy', proxy);
		}
		let redirect = urlParams.get('redirect');
		// decodeuri  
		redirect = decodeURIComponent(redirect);
		window.location.href = redirect ;
	}
	// 检查重新登录，通过缓存中的vipcode进行掉线自动登录。获取vipcode，如果用户主动点击退出登录，在1分钟内不会重新登录，用户在这期间可以登录自己的账号。否则就会一直死循环，一直无法退出登录。
	async checkRelogin() {
		// 如果当前有新的卡密，则跳出。location.href
		if (/vipcode=(.*)/.test(location.href)) return console.debug('使用新的卡密，跳出relogin')
		let vipcode = localStorage.vipcode;
		if (!vipcode) return;
		// setTimeout(checkExpired,8000); 

		let isLogin = await this.isLogined();
		if (isLogin) return;
		console.log("checkRelogin isLogin:", isLogin)

		let userLogoutTime = localStorage.userLogoutTime;
		// 如何  userLogoutTime 距离现在小于 1分钟，则跳出逻辑。
		if (userLogoutTime) {
			const logoutTime = new Date(parseInt(userLogoutTime));
			const currentTime = new Date();
			const timeDifference = (currentTime - logoutTime) / 1000; // 时间差异，以秒为单位

			if (timeDifference < 60) {
				// 如果 userLogoutTime 距离现在小于1分钟，执行以下逻辑
				console.log("距离上次登出时间小于1分钟");
				return; // 不需要自动登录，否则永远无法退出登录.
			}
		}
		let statusItem = document.querySelector(".custom_plugin_status")
		if (statusItem) statusItem.innerText = "请求开始";
		createNotify("请求开始...");

		let deviceCode = localStorage.deviceCode;
		console.log("checkCsdnRelogin", vipcode, deviceCode);
		let res = await this.doVipLogin(vipcode, deviceCode, this.appname);

		if (statusItem) statusItem.innerText = "请求完成";
		createNotify("请求完成!");
	}
	// 检查登录，通过url中的vipcode进行登录。然后重定向删除vipcode数值，
	async checkLogin() {
		var vipcode = '';
		var name ;
		let queryString = location.href.includes('?') ? location.href.replace(/.*\?/, '?') : '';
		queryString = decodeURIComponent(queryString)
		console.log('checkAppLogin', new Date(), location.href, this.url, this)
		var url = location.href;
		if (!location.href.includes(this.url)) await sleep(500); // 是否会出现重定向，自己代码会执行重定向.

		url = location.href;
		if (!url.includes(this.url)) return;
		console.log('checkAppLogin', new Date(), queryString, location.href)
		// setTimeout(()=> console.log("delay 2000 url:", location.href) , 2000 )	
		// return ;

		// 获取url中的code参数

		if (queryString) {
			// 解析 querystring参数
			const urlParams = new URLSearchParams(queryString.replace(/\/#\/.*/, ''));
			vipcode = urlParams.get('vipcode');
			name = urlParams.get('name');
			if (!vipcode && /vipcode=(.*)/.test(queryString)) vipcode = queryString.match(/vipcode=(.*)/)[1];
			console.log('urlParams', vipcode, urlParams)
		}
		if (!vipcode) return;

		if (vipcode == 'bilivip0000xxxxx') return createNotify("错误提示:", "这是演示用兑换码,请替换正确的")
		
		if (name){
			let url = this.url || location.href;
			let cookieItemKey = `cookie_dev_${url}`;
			AppStorage.setItem(cookieItemKey,name);
			AppStorage.setItem('cookie_dev_use',cookieItemKey);
			console.log('set name:',name)
		}
		console.log('用兑换码请求登录', vipcode)
		// AppStorage.setItem( 'Env.newtab' , url.replace(/vipcode=.*/,'vipcode=') );
		let deviceCode = localStorage.deviceCode;
		let res = await this.doVipLogin(vipcode, deviceCode, this.appname);
		// if (res?.code != 1000) return alert(res.message || '网络异常')
		// if (res?.code != 1000) return createNotify(res?.message || '网络异常',"请联系官方客服")
	}
	// 修改界面状态，方便区分插件安装和运行正常。当前逻辑主要是避免短时间重复登录；		
	// 添加一个状态元素，方便显示当前状态; 已经用浏览器提示框替代，这里是锦上添花，方便可视化查错；
	async initPluginStatus() {
		let url = location.href.replace(/\?.*/, '');
		if (!url.includes(this.url)) return;
		let isLogined = await this.isLogined();
		if (isLogined) {
			let dologintime = localStorage.dologintime;
			if (dologintime) dologintime = parseInt(dologintime);
			let now = new Date().getTime();
			let diff = now - dologintime;
			// 如果时间间隔小于 2分钟，
			if (diff < 2 * 60 * 1000) {
				createNotify("已经登录成功!");
			}
			return;
		} else {
			// createNotify("准备完成");
		}
	}
	// 初始化自定义退出登录，避免cookie无效；
	initCustomLogout() {}
	// 初始化修复登录，避免cookie无效；通常是在退出登录按钮下增加一个修复登录按钮；
	initCustomRelogin() {}
	// 通过ui判断是否登录
	async isLogined() {}
	// 执行登录逻辑
	async doVipLogin(vipcode, deviceCode, appname) {
		console.log("doVipLogin:", {
			vipcode,
			deviceCode,
			appname
		}, this.url)
		let vipcodeKey = `vipcode_${appname}`;

		let code = vipcode; // 迁移代码使用
		let isUserLogin = !!code;
		code = code || await AppStorage.getItem(vipcodeKey);
		if (!code) {
			return console.debug("no vip code");
		}
		if (await AppStorage.getItem(`cardcode_${code}_expire`)) {
			let expireAt = await AppStorage.getItem(`cardcode_${code}_expire`);
			console.debug(`cardcode_${code}_expire`, expireAt);
			code = null;
			createNotify("兑换码已过期:", {
				body: `过期时间:${expireAt}\n请使用新的兑换码`
			});
		}
		let dologintime = localStorage.dologintime;
		if (dologintime) {
			dologintime = parseInt(dologintime);
			let now = new Date().getTime();
			let diff = now - dologintime;
			// 如果时间间隔小于 6秒，
			if (diff < 10 * 1000) {
				return console.debug('避免无限循环弹窗')
			}
		}

		localStorage.dologintime = new Date().getTime()
		createNotify("开始登录");
		let url = this.url;
		// let res = await csdnApp.vipLogin(code, deviceCode);	
		let api = `/open/operate/cardonce/use`;
		let res = await axiosx.get(api, {
			params: {
				code,
				deviceCode,
				type: "chrome",
				url
			}
		}).then(res => res.data); // , encode: 'base64'

		if (res?.code != 1000) {
			console.error("CSDN_VIP_LOGIN error:", res);
			let info = `page.evaluate((message)=>{alert('错误提示：' + message)}, '${res.message || "网络异常"}')`;
			console.log("error info:", info);
			// executeScript(info);
			createNotify(res?.message || '网络异常', "请联系官方客服")
			return;
		}
		localStorage.vipcode = code;
		localStorage.setItem(vipcodeKey, code);
		await AppStorage.setItem(vipcodeKey, code);
		// expireAt: "2024-04-15 21:36:20"
		let {
			scripts,
			isused,
			allowed,
			expireAt,
			value,
			createTime,
			updateTime
		} = res.data;
		let [item] = scripts;
		let {
			encode,
			content
		} = item || {};
		if (encode == 'base64') content = atob(content);
		// 如果卡密已经过了有效期，则退出登录。
		// 通过 expireAt - createTime , 计算有效时长，如果小于等于1天，则时效从 updateTime 开始计算，增加有效时长，修改expireAt
		const expireDate = new Date(expireAt);
		const updateDate = new Date(updateTime);
		const createDate = new Date(createTime);
		const currentDate = new Date();
		// 计算从创建时间到过期时间的时间差
		const timeDiff = expireDate - currentDate;
		// 转换时间差为天数
		const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
		console.log("daysDiff:", daysDiff);
		if (daysDiff <= 0) {
			createNotify("兑换码已过期:", {
				body: `使用时间：${updateTime}\n有效时间：${expireAt}`
			});
			return;
		}
		if (daysDiff <= 1.1) {
			let minute = Math.ceil(timeDiff / (1000 * 60));
			// console.log("有效期小于等于1天，从更新时间开始计算时效。" , minutes , 'm' );
			let expireStr = `var PLATFORM_PARAMS = {expireAt: '${minute}m'};`;
			content = expireStr + '\n' + content;
			content += '\n checkAndLogoutWEB();'
		}
		let loginInfos = await AppStorage.getItem('loginInfos') ? JSON.parse(await AppStorage.getItem('loginInfos')) : [];
		loginInfos.push(code);
		// 去除loginInfos重复内容，
		const uniqueCodes = new Set(loginInfos);
		loginInfos = Array.from(uniqueCodes);
		await AppStorage.setItem('loginInfos', JSON.stringify(loginInfos));
		console.log("AppStorage.loginInfos:", expireAt, await AppStorage.getItem('loginInfos'));
		await AppStorage.setItem(`cardcode_${code}`, JSON.stringify({
			code,
			expireAt,
			createTime,
			updateTime,
			type: 'login',
			url: this.url
		}));

		// 把数据库中的 expireAt 字段增加其他类型，如有效时长。如 1m 1d 1h 
		// 保存到PLATFORM_PARAMS字段中；
		if (content) {
			executeScript(content); // 执行逻辑，完成登录。
		}
		if (isused == true) {
			await sleep(2000);
			console.log("isused info alert:", {
				isUserLogin
			});
			// 手动登录会弹窗，自动登录不会弹窗；
			if (isUserLogin) createNotify("兑换码提示:", {
				body: `使用时间：${updateTime}\n有效时间：${expireAt}`
			});
		}
	}
	doCustomLogout(isAuto) {
		// 这里定义点击事件要执行的代码
		console.log('用户点击了退出按钮。', isAuto);

		if (!isAuto) localStorage.userLogoutTime = new Date().getTime();
		let script = `			
			deleteCookiesByUrl("${ this.url }");
			page.reload();
		`
		executeInBg(script)
	}
	// 删除cookie，减少安装其他插件；
	async cookieDelete(){
		let script = `			
			deleteCookiesByUrl("${ this.url }");
			page.reload();
		`
		executeInBg(script)
	}
	async saveDevInfo(isForce = false){
		let url = this.url || location.href;
		let script ;
		if (!isForce) {
			// huoqu
			let cookieItemKey = `cookie_dev_${url}`;
			let hasValue = await AppStorage.getItem(cookieItemKey);
			if (hasValue) {
				AppStorage.setItem('cookie_dev_use',cookieItemKey);				
				createNotify('切换成功');
				return 
			}
		}
		script = `
        let cookies = await getCookies('${url}');
		
		let getTopLevelDomain = (url) => {
			try {
				let parsedUrl = new URL(url);
				let hostname = parsedUrl.hostname;
				let parts = hostname.split('.');
				if (parts.length > 2) {
					// 如果主机名包含多个点，则返回最后两个部分
					return parts.slice(-2).join('.');
				} else {
					// 否则，返回整个主机名
					return hostname;
				}
			} catch (error) {
				console.error('Error parsing URL:', error);
				return null;
			}
		}
        // 使用axios.post发送cookie, 参数 name,
		let type = 'dev';
		// name = 一级域名+日期时刻,如todo.comYYYYMMDDHHmm
		let domain = '${url}' || getTopLevelDomain(${url});
    	// 获取当前日期和时间
		let now = new Date();
		let year = now.getFullYear();
		let month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从0开始，所以需要+1
		let day = String(now.getDate()).padStart(2, '0');
		let hours = String(now.getHours()).padStart(2, '0');
		let minutes = String(now.getMinutes()).padStart(2, '0');
		let seconds = String(now.getSeconds()).padStart(2, '0');
		// 构建cookie的名称
		let name = domain + '_' + year + month + day + hours + minutes + seconds + '.json';

		if (page) page.evaluate((value)=> console.debug('name:', value ) , name )
		let res = await axios.post('/open/operate/cookie/cookies', {name, type, cookies}).then(r=>r.data);
		console.log("res:",res)
		if (res?.code != 1000) return createNotify('操作失败')
		createNotify('操作成功');
		let cookieItemKey = 'cookie_dev_${url}';
		localStorage.setItem(cookieItemKey,name);
		localStorage.setItem('cookie_dev_use',cookieItemKey);
		`;		
		executeInBg(script)
	}
}

globalThis.WebAppVip = WebAppVip;