// AppInterface 代码在 app_base.js中；

if (!globalThis.WebAppVip) {
	createNotify('框架初始化失败','框架未完成加载');
	console.error('框架初始化失败.')
}else{
	console.log('框架初始化成功.')
}

// 创建一个实现该接口的对象
var appVip = new WebAppVip("csdn.net");

// 添加一个状态元素，方便显示当前状态;
// appVip.initPluginStatus = async ()=>{
// 	// 找到目标元素
// 	var targetElement = document.querySelector("#csdn-toolbar div.toolbar-container-mini-middle > div");

// 	// 创建新的 <a> 元素
// 	var newLink = document.createElement("a");
// 	newLink.className = "custom_toolbar_content_nomoral custom_plugin_status";
// 	newLink.textContent = "准备就绪";

// 	// 将新的 <a> 元素添加到目标元素的子元素末尾
// 	if (targetElement) targetElement.appendChild(newLink);
// }

// 通常不需要重定义
// appVip.checkRelogin = async ()=>{   
// }

// 通过ui判断是否登录，
appVip.isLogined = async ()=>{    
    	executeScript(`globalThis.csdnCookie = await getCookies('csdn.net')`);
	await sleep(100);
	let cookie = await AppLocal.getItem('csdnCookie');
	const res = await axiosx.post('/app/operate/csdn/username',{cookie}).then(r=>r.data);
	let userInfo = res.data;
	// const userName = JSON.parse(userInfo).data.nickName;
	let username = userInfo?.nickName || userInfo?.nickname;
	let isLogin = !!username ;
	console.log('getUserInfoSimple userInfo:', {isLogin}, userInfo);
	return isLogin;
}


// appVip.checkLogin = async ()=> {
    
	
// }

// 替换官方退出登录，避免cookie无效
appVip.initCustomLogout = async ()=>{
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

	} else {
		// 如果元素不存在，可以输出日志或者进行其他操作
		console.log('未找到退出按钮。');
	}
}

//  初始化修复登录，避免cookie无效；通常是在退出登录按钮下增加一个修复登录按钮；
appVip.initCustomRelogin = async ()=>{
    
	// 获取目标元素
	var logoutButton = document.querySelector("#csdn-toolbar-profile .csdn-profile-logout");

	// 如果元素不存在，可以输出日志或者进行其他操作
	if (logoutButton) return  console.log('未找到退出按钮。'); 
		
	
        // 创建重新登录按钮
        var reloginButton = logoutButton.cloneNode(true);
		reloginButton.querySelector('a').lastChild.textContent = '修复登录';
        reloginButton.classList.add('custom-relogin');

        // 为重新登录按钮添加点击事件
        reloginButton.addEventListener('click', function(){ doCustomLogout(true) } );

        // 将重新登录按钮插入到退出按钮后面
        newButton.parentNode.insertBefore(reloginButton, newButton.nextSibling);
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

function check2CreateNotify(title,body){
	let url = location.href ;
	if ( !url.includes('www.csdn.net/vip') ) return ;
	createNotify(title,body)
}
// 运行项目，项目入口
appVip.initApp()

