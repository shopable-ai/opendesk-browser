// https://www.taobao.com/?tool

if (!globalThis.sleep) globalThis.sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

var AppTaobao = {
    // 检查当前URL是否匹配目标页面
    checkUrl() {
        let url = window.location.href ;
        url = decodeURIComponent(url)
        return url.includes('https://www.taobao.com/?tool') && !url.includes('login.taobao.com') ;
    },

    // 检查是否已登录
    checkLogin: async () => {
        const navHtml = document.querySelector('.site-nav').outerHTML;
        const needLogin = navHtml?.includes('请登录');
        return !needLogin;
    },

    // 添加登录按钮
    addLoginBtns: async () => {
        // 可以在页面添加自定义登录按钮
        const loginBtn = document.createElement('button');
        loginBtn.innerText = '自动登录淘宝';
        loginBtn.onclick = AppTaobao.autoLogin;
        document.body.appendChild(loginBtn);
    },

    // 自动登录流程
    autoLogin: async () => {
        const loginUrl = 'https://login.taobao.com/member/login.jhtml?&redirectURL=https%3A%2F%2Fwww.taobao.com%2F%3Ftool';
        window.location.href = loginUrl;
    },

    // 检查登录状态并发送Cookie
    checkAndSend: async () => {
        if (AppTaobao.checkUrl()) {
            const isLoggedIn = await AppTaobao.checkLogin();
            console.log('是否登录?' , isLoggedIn)
            if (isLoggedIn) {
                await AppTaobao.sendCookie();
            } else {
                await AppTaobao.autoLogin();
            }
        }
    },

    // 发送Cookie到服务器
    sendCookie: async () => {
        try {
            // 获取淘宝域名下的所有cookie
            await executeScript(`globalThis.taoCookie = await getCookies('.taobao.com')`);
            await sleep(100);
            let cookies = await AppLocal.getItem('taoCookie');
            let cookie = cookies?.map(cookie => `${cookie.name}=${encodeURIComponent(cookie.value)}`).join('; ');
            let nickname = AppTaobao?.getNickName(); 

            createNotify('自动登录', '开始上号：'+ nickname )
            // 发送cookie到服务器
            const res = await axiosx.post('http://192.168.2.213:8001/app/operate/buyer/add', {
                nickname, cookie
            }).then(r=>r.data).catch(e => { });
            console.log('taobao sendCookie:' , res)
            if (res?.code == 1000) {
                createNotify('自动登录', '上号成功，开始换下个账号')
                // alert('上号成功，开始换下个账号')
                await AppTaobao.reLogin();
                return ;
            }else{
                console.error("taobao淘宝登录错误", res);
                createNotify('自动登录', '登录错误,可能是服务器问题：' + res?.message)
            }
        } catch (error) {
            console.error('处理cookie时出错:', error);
        }
    },

    // 重新登录
    reLogin: async () => {
        try {
            // 清除现有cookie
            // await executeScript(``);
            cookieDelete();
            await sleep(100);
            createNotify('自动登录', '清空登录状态，重新登录')
            // 重定向到登录页面
            await AppTaobao.autoLogin();
        } catch (error) {
            console.error('重新登录失败:', error);
        }
    },

    getNickName: () => {
        // 查找登录信息元素
        const loginInfoElement = document.querySelector('.site-nav-login-info-nick');
        
        // 获取昵称文本
        const nickName = loginInfoElement?.textContent.trim();
        return nickName;
    },

    // 初始化
    init: async () => {
        let isTaobao = window.location.href.includes('https://www.taobao.com');
        if (!isTaobao) return console.log('不是淘宝首页，跳出逻辑')
        if (AppTaobao.checkUrl()) {
            console.log('taobao淘宝自动登录上号，扫码开始')
            await AppTaobao.checkAndSend();
        } else{
            console.log('taobao login info' , window.location.href.includes('https://www.taobao.com/?tool') , window.location.href )
        }
    }
};
console.log('taobao auto login')
// 自动初始化
// 
setTimeout( ()=> { AppTaobao.init(); } , 1000 )