// AppInterface 代码在 app_base.js中；

if (!globalThis.WebAppVip) {
	createNotify('框架初始化失败','框架未完成加载');
	console.error('框架初始化失败.')
}else{
	console.log('框架初始化成功.')
}

var appKey = "baidu.com";
initApp(appKey);

function initApp(appKey){

	if ( !window.location.href.includes(appKey) )  return console.log('not in target url:', appKey);
	console.log('initApp:' , appKey)

	// 创建一个实现该接口的对象
	var appVip = new WebAppVip(appKey);

	// 通常不需要重定义
	// appVip.checkRelogin = async ()=>{   
	// }

	// 通过ui判断是否登录，也可以通过协议判断。如果是协议，则需要找到协议的接口，通常是获取用户信息接口
	appVip.isLogined = async ()=>{    
	    const loginButton = document.querySelector('button[data-testid="login-button"]');
	    return !loginButton;
	}


	// appVip.checkLogin = async ()=> {
	    
		
	// }

	// 替换官方退出登录，避免cookie无效
	appVip.initCustomLogout = async ()=>{
		// 获取目标元素
		var logoutButton = document.querySelector("#csdn-toolbar-profile .csdn-profile-logout");

		// 如果元素不存在，可以输出日志或者进行其他操作
		if (!logoutButton) return  console.log('未找到退出按钮。'); 

		let vipcode = localStorage.vipcode;
		if (!vipcode) return ;

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
		newButton.addEventListener('click', function(){ appVip.doCustomLogout() } );		

	}

	//  初始化- 自定义增加修复登录，避免cookie无效；通常是在退出登录按钮下增加一个修复登录按钮；
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
		reloginButton.addEventListener('click', function(){ appVip.doCustomLogout(true) } );

		// 将重新登录按钮插入到退出按钮后面
		newButton.parentNode.insertBefore(reloginButton, newButton.nextSibling);
	}


	// 运行项目，项目入口
	appVip.initApp()

}