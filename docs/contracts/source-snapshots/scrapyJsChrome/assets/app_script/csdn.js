
if (!globalThis.sleep) globalThis.sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));


var quasarApp ;

initApp()

async function initApp(){
	// 如果域名中不是 csdn.net 则不执行。
	if( location.hostname.indexOf('csdn.net') < 0 ) return ;

	console.log("csdn.js initApp")
	await sleep(100);
	try{
		await initData();
		initView();
		initEvent();
		initLogic();
	}catch(e){
		console.log("initApp error:",e)
	}
}
async function initData(){
	let fingerId ;
	let deviceCode = await AppStorage.getItem('deviceCode');
	if (!deviceCode){
		fingerId = await getFingerprint();
		AppStorage.setItem('deviceCode', fingerId);
	}
	localStorage.deviceCode = deviceCode || fingerId || localStorage.deviceCode || generateRandomString(16);
	// console.log("localStorage.deviceCode:", localStorage.deviceCode)
}
async function initView(){
	initPluginStatus();
	
	// jquery 替换界面上的 超级会员免费看 按钮
	var customVipButton = `
	<span id="q-appx">
		<a class="column-studyvip-bt custom-vip">
			<img class="column-studyvip-icon" src="https://csdnimg.cn/release/blogv2/dist/components/img/studyVipIcon.png">
			<span class="column-studyvip-tit" @click="onReadVip()">bilivip会员免费看</span>
		</a>
	</span>`;


	// <a class="column-studyvip-bt column-studyvip-pass" data-report-click="{&quot;spm&quot;:&quot;1001.2101.3001.6322&quot;}">
	//             <img class="column-studyvip-icon" src="https://csdnimg.cn/release/blogv2/dist/components/img/studyVipIcon.png">
	//             <span class="column-studyvip-tit">超级会员免费看</span>
	//         </a>
	var downloadButtonHtml = `
	<span id="q-appx">
		<button type="button" class="downloadBtn q-mr-sm  el-button relative el-button--warning el-button--medium"
		><span><span class="va-middle"  @click="onDownload()" >免积分下载</span></span></button>
	</span>
	` ;
	// jquery 替换页面上所有的 .column-studyvip-bt 元素
	// if ($('.column-studyvip-bt').length) $('.column-studyvip-bt').replaceWith(customVipButton);
	// document.querySelectorAll('.column-studyvip-bt').forEach(el => {
	// 	const wrapper = document.createElement('div'); // 创建一个包装 div
	// 	wrapper.innerHTML = customVipButton; // 将 HTML 字符串设置为这个 div 的内容
	// 	const newElement = wrapper.firstChild; // 获取新创建的元素
	// 	el.replaceWith(newElement); // 替换旧元素
	// });

	// 在#downloadBtn 内部中第一个位置添加按钮。downloadButton
	// if ($('#downloadBtn').length) $('#downloadBtn').prepend(downloadButtonHtml);
	const downloadBtn = document.getElementById('downloadBtn');
	if (downloadBtn) {
	// 使用 insertAdjacentHTML 将按钮直接插入到 downloadBtn 的开始位置
		// downloadBtn.insertAdjacentHTML('afterbegin', downloadButtonHtml);
	}
	// 如果原本就是超级会员，就不在替换按钮，否则导致无法正常使用。
	if ( globalThis.Vue ){
		quasarApp = Vue?.createApp({
			data() {
				return {
					inputText: ''
				};
			},
			methods: {
				async onReadVip() {
					let url = location.href.replace(/\?.*/,'')
					this.$q.notify('正在获取文章内容,大概5秒,请稍等...');
					let res = await doCsdnArticleRead(url);
					if (res?.code != 1000) return this.$q.notify({ message: res.message || '网络异常', type: 'negative', });
					let { code, message, data } = res;
					let { content, encode, length, useTime } = data || {};
					content = content || '';
					if (encode == 'base64') content = decodeURIComponent(escape(atob(content)));
					let done = content.length && document.querySelector('#content_views').innerHTML.length <= content.length;
					console.log("data:", data, content, { done });
					document.querySelector('#content_views').innerHTML = content;
					// if (done) document.querySelector('.hide-article-box').style.display = 'none';
					// else this.$q.notify('可能不完整.');
					this.$q.notify({ type: 'positive', message: `获取成功` });
				},
				async onDownload() {
					const extensionUrl = globalThis.CHROME_EXTENSION_URL || document.documentElement?.getAttribute('data-chrome-extension-url') || '';
					let url = location.href;
					this.$q.notify('正在下载文件,大概5秒,请稍等...');
					let res = await doCsdnDownload(url);
					if (res?.code != 1000) {
						if (res.message == '下载次数不足' || res.message == '请先购买下载次数') {
							// quasar 提示请处置，并显示确定按钮。点击后跳转到对应页面；
							this.$q.notify({
								message: '进入充值：更低的价格，更多的下载', color: 'primary', icon: 'paid', timeout: 20000, progress: true,
								actions: [
									{
										label: '确定', // Label for the action button
										color: 'white',
										handler: () => {
											if (extensionUrl) {
												window.open(extensionUrl); // This will open the specified URL
											}
										}
									}
								]
							});
						}
						return this.$q.notify({ message: res.message || '网络异常', type: 'negative', });
					}
					let { code, message, data } = res;
					let { url: link, count, total, useTime } = data || {};
					link = link || '';
					if (!link) return this.$q.notify('无法获取下载地址');
					this.$q.notify({ type: 'positive', message: `获取成功,剩余次数:${count}次` });
					let downloadUrl = decodeURIComponent(link);
					var filename = '';
					// download.csdn.net
					if (downloadUrl.indexOf('download.csdn.net') > -1) {
						var [_, filename] = /filename="(.*?)"/.exec(downloadUrl) || [];
						downloadFile(filename, link);
					} else {
						// http://xxx.xxx.com/public/operate/csdn/BookAdminister.zip   从网址中最后部分获取文件名
						var [_, filename] = /\/([^\/]+?)$/.exec(link) || [];
						downloadFile(filename, link);
					}
				}
			}
		})
		try{
			quasarApp.use(Quasar);
		}catch(e){
			console.error("initView quasarApp error:" , e)
		}
		quasarApp.mount('#q-appx');

		console.log("csdn.js ,", quasarApp, Quasar)
	}
	console.log("csdn.js init,")
}
function initEvent(){

}

// 添加一个状态元素，方便显示当前状态;
async function initPluginStatus(){
	let url = location.href.replace(/\?.*/,'') ;
	if( !url.includes("www.csdn.net/vip") ) return ;

	// 找到目标元素
	var targetElement = document.querySelector("#csdn-toolbar div.toolbar-container-mini-middle > div");
	if (!targetElement) targetElement = document.querySelector(".header-bar .home-page-nav-bar nav");

	// 创建新的 <a> 元素
	var newLink = document.createElement("a");
	newLink.className = "custom_toolbar_content_nomoral custom_plugin_status";
	newLink.textContent = "插件就绪";
	newLink.style = 'vertical-align: unset;'
	check2CreateNotify("准备完成");

	// 将新的 <a> 元素添加到目标元素的子元素末尾
	if(targetElement) targetElement.appendChild(newLink);
 
}
async function initLogic(){
	// CHROME_BRIDGE_INTERFACE

	checkCsdnRelogin();
	checkCsdnLogin();
	autoGetArticle();
	document.addEventListener('DOMContentLoaded', function () {
		console.log('csdn.js Current URL:', location.href);
	});
	
}

// 自动获取文章内容
async function autoGetArticle(){
	let url = location.href.replace(/\?.*/,'') ;
	let reg = /https:\/\/(\w+\.)?blog\.csdn\.net(\/.*)?\/article\/details\/(\d+)/   ;
    let regDownloadBlog = /https:\/\/download.csdn.net\/blog\// ;
    let match = url.match(reg);
	console.log("autoGetArticle",url)
    if( !match && !url.match(regDownloadBlog) ) return console.debug("不是专栏文章，跳出");
    	let hasMask = !!document.querySelector('.hide-article-box') ; // 如果不是会员，会有遮罩
	let payColumnLock = document.querySelector('.competence .lock')
    	if (!hasMask && !payColumnLock ) return console.log('已经是会员')
	// if ( !document.querySelector('.lock') && !document.querySelector('.hide-article-box') ) return console.debug("没有找到锁的按钮，跳出");   // 没有找到锁的按钮，新版本页面已经没有了。
	// if( match && !document.querySelector('.lock') ) 
	// 如果是超级会员，已经登录状态。解锁按钮会消失，平时可以看见。

	// 如果已订阅，则跳出逻辑，否则会覆盖官方的程序；
	let subscribdItem = document.querySelector('.article-column-subscribe') 
	if (subscribdItem){
		let text = document.querySelector('.article-column-subscribe').innerText;
		if (text?.includes('已订阅')) return console.info('已订阅,跳出')
	}

	let deviceCode = localStorage.deviceCode ;
	let vipcode = localStorage.vipcode ;
	let res = await doCsdnArticleRead(url,deviceCode,vipcode);	
	if (res?.code != 1000) return console.log("autoGetArticle error:", res);
	// if (res?.code != 1000) return this.$q.notify({ message: res.message || '网络异常', type: 'negative', });
	let { code, message, data } = res;
	// let { content, encode, length, useTime } = data || {};
	setBlogContent(data);

}
async function setBlogContent(data){
	let { content, encode, length, useTime } = data || {};
	content = content || '';
	if (encode == 'base64') content = decodeURIComponent(escape(atob(content)));
	var isDone ;
	console.log("setBlogContent:",content.length, data, { isDone });
	let textBefore , textAfter ;
	// var isDone = content.length && document.querySelector('#content_views').innerHTML.length <= content.length;
	if( !content ) return ;

	let url = location.href.replace(/\?.*/,'') ;	
	let isBlog = url.includes('blog.csdn.net');
	let isDownloadBlog = url.includes('download.csdn.net/blog');
	if(isDownloadBlog){ //专栏
		textBefore = document.querySelector('.blog-column-content-paper').innerText ;
		document.querySelector('.blog-column-content-paper').innerHTML = content;
		textAfter = document.querySelector('.blog-column-content-paper').innerText ;
		isDone = !textAfter.endsWith(textBefore.substr(0,200) )
		if( isDone && document.querySelector('.competence')) document.querySelector('.competence').style.display = 'none';
	}else if(isBlog){
		let container ;
		if ( url.includes('.blog.csdn.net') ){ //专栏
			container = document.querySelector('#content_views');
		}else{
			container = document.querySelector('.blog-content-box') || document.querySelector('#content_views'); // 
		}
		
		textBefore = container.innerText ;
		container.innerHTML = content;
		textAfter = container.innerText ;
		isDone = !textAfter.endsWith(textBefore.substr(0,200) )

		let articleItem = document.querySelector('#article_content');
		if (articleItem) {
		    articleItem.style.height = 'unset';
		    articleItem.style.overflow = 'unset';
		}

		if( isDone &&document.querySelector('.hide-article-box')) document.querySelector('.hide-article-box').style.display = 'none';
	}
	setTimeout(()=>{
		let elements = document.querySelectorAll('pre');

		// 遍历这些元素并将它们的类名改为 'pre.set-code-show'
		elements.forEach(function(element) {
		    element.className = 'prettyprint set-code-show';
		});
	},500)
	console.log("isDone:",isDone)
}

function generateRandomString(length) {
	let result = '';
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const charactersLength = characters.length;

	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}

	return result;
}

// 鼠标没有经过，状态一直都没有变化。会获取到错误的条件；
async function checkExpired(){
	let hasLoginExpire = !!document.querySelector('.csdn-profile-nickName') && document.querySelector('.csdn-profile-nickName').innerText == '--'
	if (hasLoginExpire) {
		console.debug("登录已失效")
		doCustomLogout()  // 可能需要true = isAuto 自动退出
		return ;
	}    
}
async function checkCsdnRelogin(){
	if ( /vipcode=(.*)/.test(location.href) ) return console.debug('使用新的卡密，跳出relogin')
		
	let vipcode = localStorage.vipcode ;
	// if( !vipcode ) return ;		
	// setTimeout(checkExpired,8000); 
	// 设置运行时间，避免频繁调用。10秒调用一次。把上次运行时间保存到localstorage
	let lastRunTime = localStorage.lastRunTime ? parseInt(localStorage.lastRunTime) : 0;
    let now = new Date().getTime();

    // 如果距离上次运行时间不足10秒，则不执行
    if (now - lastRunTime < 10000) return;

	let isLogin = await checkUserStatus()
	if(isLogin) return  console.debug('判断已经登录,跳出逻辑') ;
	let filename = await AppStorage.getItem('cookie_file_csdn');
	if (filename?.includes('fail.json')) {
		// 未登录状态，需要修改界面按钮，让他看起来登录成功，可以识别状态。
		if ( window.location.href.includes( 'https://www.csdn.net/vip' ) ) {
			let vipBtn = document.querySelector("#pageNavBar > header > div > div"); 
			if (vipBtn) vipBtn.innerText = '已是会员,可直接访问文章';
			else alert('已是会员权限,可直接访问文章');
		}
		return console.debug('特定无效json，不在自动登录;');
	}

    // 更新上次运行时间
    localStorage.lastRunTime = now;

	let userLogoutTime = localStorage.userLogoutTime ;
	// 如何  userLogoutTime 距离现在小于 1分钟，则跳出逻辑。
	if (userLogoutTime) {
		const logoutTime = new Date(parseInt(userLogoutTime));
		const currentTime = new Date();
		const timeDifference = (currentTime - logoutTime) / 1000; // 时间差异，以秒为单位
	  
		if (timeDifference < 60) {
		  // 如果 userLogoutTime 距离现在小于1分钟，执行以下逻辑
		  console.log("距离上次登出时间小于1分钟");
		  return ; // 不需要自动登录，否则永远无法退出登录.
		}
	}
	check2CreateNotify("开始登录");
	let statusEle = document.querySelector(".custom_plugin_status")
	if(statusEle) statusEle.innerText = "请求开始";

	let deviceCode = localStorage.deviceCode;
	console.log("checkCsdnRelogin", vipcode,deviceCode);
	let res = await doCsdnVipLogin(vipcode,deviceCode);
	
	if(statusEle) statusEle.innerText = "请求完成";
	await sleep(1000);
	isLogin = await checkUserStatus()
	if (isLogin) check2CreateNotify("已经登录成功!");
	else check2CreateNotify("试试直接访问文章");
}
async function checkUserStatus(){
	// let cookie = document.cookie ;
	let isLogin = await isUserLogin()
	return isLogin ;
}

async function isUserLogin(){
	// const userInfoUrl = "https://g-api.csdn.net/community/toolbar-api/v1/get-user-info";
	// const cookieHeader = document.cookie;
	// const res = await axiosx.get(userInfoUrl, {headers: { 'Cookie': cookieHeader }}).then((response) => response.data);
	// executeScript(`globalThis.csdnCookie = await getCookies('csdn.net')`);
	// await sleep(100);
	// let cookie = await AppLocal.getItem('csdnCookie');
	// const res = await axiosx.post('/app/operate/csdn/username',{cookie}).then(r=>r?.data).catch(e=>{});
	// if (!res) return console.error('网络异常', '请检查协议')

	var cookie = document.cookie ;
	let data = await axios.get( "https://bizapi.csdn.net/community-personal/v1/get-personal-info" , {
	        headers: {
	          'cookie': cookie,
	          accept: "application/json, text/plain, */*",
	          "x-ca-key": "203796071",
	          "x-ca-nonce": "dfd7ffb7-c0ca-42f3-838c-d5e07c62b18d",
	          "x-ca-signature": "U2K9uoInl//6cm3quOpuTWAu7xSufJsr4UpkNBOU7k0=",
	          "x-ca-signature-headers": "x-ca-key,x-ca-nonce",
	        }
	      }).then((response) => response.data);
	let userInfo = data.data ;

	// let userInfo = res.data;
	// const userName = JSON.parse(userInfo).data.nickName;
	let username = userInfo?.nickName || userInfo?.nickname || userInfo?.basic?.nickname;
	let isLogin = !!username ;
	console.log('getUserInfoSimple userInfo:', {isLogin}, userInfo);
	return isLogin;
}

function isUserLoginByUI(){
    let hasLoginBtn = !!document.querySelector(".toolbar-btn-loginfun")
    return !hasLoginBtn;
}
// isUserLoginByUI()


async function checkCsdnLogin() {
    var cardcode = '' ;
	var name ;
	const queryString = location.href.includes('?') ? location.href.replace(/.*\?/, '?') : '';
	console.log('checkCsdnLogin',new Date(),location.href)
	let url = location.href;
	if( !location.href.includes('csdn.net') ) await sleep(1000);
	url = location.href;
	console.log('checkCsdnLogin', new Date(),queryString,location.href)
	setTimeout(()=> console.log("delay 2000 url:", location.href) , 2000 )	
	// return ;

	// 获取url中的code参数

	if (queryString) {
		//  /?code=xBhHhqTf/#/common/invite 或 /#/common/invite?code=xBhHhqTf
		// 解析 querystring参数
		const urlParams = new URLSearchParams(queryString.replace(/#.*/, ''));
		cardcode = urlParams.get('vipcode') ;
		if (cardcode) cardcode = cardcode.trim();
		name = urlParams.get('name');
		let isPay = urlParams.get('isPay') || urlParams.get('ispay');
		if (isPay) {
			// https://download.csdn.net/blog/column/12276052/
			// 使用reg读取出 columnId ，
			let url = location.href;
		      	let [, columnId] = url.match(/column\/(\d+)/) || [];
			localStorage.isPay = columnId ;
		} 
		console.log('urlParams', cardcode,urlParams)
		if(!cardcode){

		}
	}

	if( cardcode == 'bilivip0000xxxxx' ) return alert('这是演示的兑换码,请使用正确')

	if (cardcode) {
		console.log('用兑换码请求登录',cardcode)		
		// AppStorage.setItem( 'Env.newtab' , url.replace(/vipcode=.*/,'vipcode=') );
		let deviceCode = localStorage.deviceCode;
		cardcode = cardcode.replace(/#.*/, '') ;
	    	let res = await doCsdnVipLogin(cardcode,deviceCode);
		console.log("doCsdnVipLogin res",res);
		// if (res?.code != 1000) return this.$q.notify({ message: res.message || '网络异常', type: 'negative', });
		if (res?.code != 1000) return check2CreateNotify(res?.message || '网络异常');

		let { code, message, data } = res;
		let { isused, scripts, updateTime, expireAt, allowed, home } = data || {};

		if( !scripts || !scripts.length ) return ;
		// Assuming 'scripts' is an array of command objects
		scripts.forEach(item => {
			let { content, init , encode } = item;

			if (content && content.trim() !== "") {
				// Display a toast message (mocked since actual toasts aren't available in web environments)
				console.log("Command: Executing command");

				if( encode == 'base64') content = atob(content);

				let initUrl = init?.url;
				let save = init?.save;

				// Load a new URL if it's provided and different from the current one
				// if (initUrl && initUrl !== window.location.href) {
				// 	window.location.href = initUrl;
				// }
				// eval(content)

				// console.log(`script content: ${content.length }`);

				if (save) {
					// 在app中是保存脚本和初始化相关
				}
			}
		});

	}

	initCustomLogout();
}

async function initCustomLogout(){
	// 获取目标元素
	var logoutButton = document.querySelector("#csdn-toolbar-profile .csdn-profile-logout");

	// 判断元素是否存在
	if (logoutButton) {
		// 克隆一个新节点
		// 在按钮文本中增加 "x" 字符
        var newButton = logoutButton.cloneNode(true);
        
        // 查找按钮内的链接元素，假设文本是在 <a> 标签内
        var link = newButton.querySelector('a');
        if (link) {
            // 如果链接内有<i>标签或其他标签，我们要确保只修改文本部分
            // 假设文本紧跟在最后一个内部元素后面
            if (link.lastChild.nodeType === Node.TEXT_NODE) {
                // 直接在文本节点上增加 "x"
                link.lastChild.textContent += "•";
            } else {
                // 如果没有文本节点，添加一个新的文本节点
                link.appendChild(document.createTextNode("•"));
            }
        }

		// 为新节点添加新的 class
		newButton.classList.add('custom-logout');

		// 替换旧节点
		logoutButton.parentNode.replaceChild(newButton, logoutButton);

		// 为新节点添加点击事件
		newButton.addEventListener('click', function(){ doCustomLogout() } );

		
        // 创建重新登录按钮
        var reloginButton = logoutButton.cloneNode(true);
		reloginButton.querySelector('a').lastChild.textContent = '修复登录';
        reloginButton.classList.add('custom-relogin');

        // 为重新登录按钮添加点击事件
        reloginButton.addEventListener('click', function(){ doCustomLogout(true) } );

        // 将重新登录按钮插入到退出按钮后面
        newButton.parentNode.insertBefore(reloginButton, newButton.nextSibling);
	} else {
		// 如果元素不存在，可以输出日志或者进行其他操作
		console.log('未找到退出按钮。');
	}
}

// 自动退出前的钩子，回调。主要减少重写doCustomLogout
async function doCustomLogoutBefore(){
	let error = document.querySelector("#csdn-toolbar-profile > div.csdn-profile-top > p").innerText == "--";
	if(error) {
		console.log("cookie_file_csdn_status:", true)
		// 每天24点countError清零，还需要保存countError的日期，如果日期不一样，则清零
		let date = new Date();
		let dateStr = date.toLocaleDateString();
		let dateStrOld = await AppStorage.getItem("cookie_file_csdn_date") || "";
		if(dateStr != dateStrOld) {		    
			AppStorage.setItem("cookie_file_csdn_date", dateStr);
			await AppStorage.setItem("cookie_file_csdn_countError", 0);
		}
		let countError = await AppStorage.getItem("cookie_file_csdn_countError") ;
		countError = parseInt( countError || 0 ) ;
		countError +=1 ;
	    	await AppStorage.setItem("cookie_file_csdn_countError", countError );
		
		await AppStorage.setItem("cookie_file_csdn_status","error") ;
	}else{
		console.log("cookie_file_csdn_status:", false)
		await AppStorage.removeItem("cookie_file_csdn") ;
		await AppStorage.removeItem("cookie_file_csdn_status") ;
		// 不能删除cookie_file_csdn_countError。删除会导致一直是0，数字增加不上去
	}	
}
// function doCustomLogout(isAuto 默认参数为false) {
async function doCustomLogout(isAuto){
	// 这里定义点击事件要执行的代码
	console.log('用户点击了退出按钮。',isAuto);
	if(isAuto) await doCustomLogoutBefore();

	// alert("doCustomLogout: " + isAuto);
	// return ;
	deleteAllCookies();
	if(!isAuto) localStorage.userLogoutTime = new Date().getTime();
	let script = `			
	deleteCookiesByUrl("https://www.csdn.net/");
	localStorage.cookie_file_csdn = '';
	page.reload();
	`
	executeInBg(script)
}

// 并没有成功，还需要优化。
function deleteAllCookies() {
	var cookies = document.cookie.split(";");

	for (var i = 0; i < cookies.length; i++) {
		var cookie = cookies[i];
		var eqPos = cookie.indexOf("=");
		var name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
		
		// 尝试删除cookie，设置不同的路径和域
		document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
		document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + window.location.hostname;
		document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.' + window.location.hostname; // 包含子域
	}
}

function check2CreateNotify(title,body){
	let url = location.href ;
	if ( !url.includes('www.csdn.net/vip') ) return ;
	createNotify(title,body)
}

async function doCsdnVipLogin(code,deviceCode){
	// if (!globalThis.callChromeBridgeInterface) return this.$q.notify('framwwork file not found!');
	// return callChromeBridgeInterface('CSDN_VIP_LOGIN', { code,deviceCode })
	let appname = 'csdn';
	let vipcodeKeyOld = `${appname}_vipcode` ;
	let vipcodeKey = `vipcode_${appname}` ;	 

	let isUserLogin = !!code;
	code = code || await AppStorage.getItem(vipcodeKey) || await AppStorage.getItem(vipcodeKeyOld);
	if (!code) {
		return console.debug("no vip code");
	}
	if (await AppStorage.getItem(`cardcode_${code}_expire`)) {
		let expireAt = await AppStorage.getItem(`cardcode_${code}_expire`);
		console.debug(`cardcode_${code}_expire`, expireAt);
		code = null;
		check2CreateNotify("兑换码已过期:", { body: `过期时间:${expireAt}\n请使用新的兑换码` });
	}
	// let res = await csdnApp.vipLogin(code, deviceCode);	
	let api = `/open/operate/cardonce/use`;
	// let encode ;
	//  ;
	let res = await axiosx.get(api, { params: { code, deviceCode, type: "chrome", encode : 'base64'} }).then(res => res.data);  // 

	if (res?.code != 1000) {
		console.error("CSDN_VIP_LOGIN error:", res);
		let info = `page.evaluate((message)=>{alert('错误提示：' + message)}, '${res.message || "网络异常"}')`;
		console.log("error info:", info);
		executeScript(info);
		return;
	}
	await AppStorage.setItem(vipcodeKey, code);
	// expireAt: "2024-04-15 21:36:20"
	let { scripts, isused, allowed, expireAt, value, createTime, updateTime } = res.data;
	let [item] = scripts;
	let { encode, content } = item || {};
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
		check2CreateNotify("兑换码已过期:", { body: `使用时间：${updateTime}\n有效时间：${expireAt}` });
		return;
	}
	if (daysDiff <= 1.1) {
		let minute = Math.ceil(timeDiff / (1000 * 60));
		// console.log("有效期小于等于1天，从更新时间开始计算时效。" , minutes , 'm' );
		let expireStr = `var PLATFORM_PARAMS = {expireAt: '${minute}m'};`;
		content = expireStr + '\n' + content;
	}
	let loginInfos = await AppStorage.getItem('loginInfos') ? JSON.parse(await AppStorage.getItem('loginInfos')) : [];
	loginInfos.push(code);
	// 去除loginInfos重复内容，
	const uniqueCodes = new Set(loginInfos);
	loginInfos = Array.from(uniqueCodes);
	await AppStorage.setItem('loginInfos', JSON.stringify(loginInfos));
	console.log("AppStorage.loginInfos:", expireAt, await AppStorage.getItem('loginInfos'));
	await AppStorage.setItem(`cardcode_${code}`, JSON.stringify({ code, expireAt, createTime, updateTime, type: 'login', url: 'https://csdn.net' }));

	// 把数据库中的 expireAt 字段增加其他类型，如有效时长。如 1m 1d 1h 
	// 保存到PLATFORM_PARAMS字段中；
	if (content) {
		let info = `page.evaluate((updateTime)=>{
			if (location.host.includes('www.csdn.net')) localStorage.vipcode='${code}';
		})`;
		console.log("isused info vipcode:", info);
		executeScript(info);  // 弹窗过后似乎导致登录失效		
		executeScript(content);  // 执行逻辑，完成登录。
	}
	if (isused == true) {
		await sleep(2000);
		console.log("isused info alert:", { isUserLogin });
		// 手动登录会弹窗，自动登录不会弹窗；
		if (isUserLogin) check2CreateNotify("兑换码提示:", { body: `使用时间：${updateTime}\n有效时间：${expireAt}` });
	}
}

async function doCsdnArticleRead(url,deviceCode,vipcode) {
	// if (!globalThis.callChromeBridgeInterface) return check2CreateNotify('framwwork file not found!');
	// return callChromeBridgeInterface('CSDN_ARTICLE_READ', { url,deviceCode,vipcode })

	let api = '/app/operate/csdn/read';
	// let api = 'http://apidev.todo6.com/app/operate/csdn/read';
	let api_key, token;
	// token = "${token}";
	// api_key = 'b48fac8f-3216-45cc-96f2-68d53182e7b2';  // dev
	let isPay ;
	// let isPay = !!localStorage.isPay ? true : null ;
	if (localStorage.isPay){
		let url = location.href;
	      	let [, columnId] = url.match(/column\/(\d+)/) || [];
	      	isPay = localStorage.isPay == columnId ? true : null ;
	      	console.debug('doCsdnArticleRead isPay:', localStorage.isPay == columnId , localStorage.isPay , columnId)
	}
	let code =  vipcode || await AppStorage.getItem('vipcode_csdn')
	let encode ;
	// encode = 'base64' ;
	let res = await axiosx.get(api, { params: { isPay, url,  deviceCode, code, token, api_key, encode } }).then(r=>r.data)

	return res;
}

async function doCsdnArticleSave(url,content,encode){	
	if(encode == 'base64') content = btoa(encodeURIComponent(content));

	if (!globalThis.callChromeBridgeInterface) return check2CreateNotify('framwwork file not found!');
	return callChromeBridgeInterface('CSDN_ARTICLE_SAVE', { url,content, encode })
}

async function doCsdnDownload(url) {
	if (!globalThis.callChromeBridgeInterface) return this.$q.notify('framwwork file not found!');
	return callChromeBridgeInterface('CSDN_DOWNLOAD', { url })
	
	let api = '/app/operate/csdn/download';
	// let api = 'http://apidev.todo6.com/app/operate/csdn/download';
	let api_key, token;
	token = "${token}";
	// api_key = 'b48fac8f-3216-45cc-96f2-68d53182e7b2';  // dev
	// token = localStorage.token ;
	let res = await axiosx.get(api, { params: { url, token, api_key } }).then(r=>r.data)
	return res;
}

const downloadFile = (filename, url) => {
	filename = decodeURIComponent(filename)
	let a = document.createElement('a')
	a.href = url
	// a.setAttribute('target', '_blank');
	a.setAttribute('download', filename)
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
}
async function getFingerprint() {
    // 初始化 FingerprintJS API
    const fp = await FingerprintJS.load();

    // 获取访客标识符
    const result = await fp.get();

    // 这个值是访客的唯一指纹
    const visitorId = result.visitorId;
    console.log("visitorId",visitorId);

    // 你可以使用 visitorId 做进一步的处理，例如发送到服务器或用于跟踪用户
	return visitorId ;
}

// 
async function checkInfoError(){
	let script = `let cookie = await getCookies('csdn.net')
	let prefix = 'ddos';
	var res = await axios.post('/open/operate/csdncrawl/log' , { cookie,prefix }).then(r=> r.data);
	if (res?.code != 1000) createNotify('错误信息',{body: res?.message ||'网络异常' });
	else createNotify('成功信息',{body: '操作成功' });
	console.log('request res:',res);
	`
	executeScript(script)
}
