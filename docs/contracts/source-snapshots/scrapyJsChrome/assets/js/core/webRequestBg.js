const WebRequestFramework = (function () {
    let rules = [];
    let handlers = {
        onBeforeRequest: [],
        onCompleted: []
    };

    // 注册拦截规则和处理程序
    function registerWebRequest(rulesConfig, onBeforeRequest, onCompleted) {
        rulesConfig.forEach(newRuleConfig => {
            // 查找是否存在具有相同 selector 的规则
            const existingRuleIndex = rules.findIndex(rule => 
                JSON.stringify(rule.selector) === JSON.stringify(newRuleConfig.selector)
            );

            // 如果存在相同 selector 的规则，移除旧规则和其对应的处理程序
            if (existingRuleIndex !== -1) {
                rules.splice(existingRuleIndex, 1);

                // 移除与该规则对应的处理程序
                handlers.onBeforeRequest = handlers.onBeforeRequest.filter(handler => 
                    JSON.stringify(handler.ruleConfig.selector) !== JSON.stringify(newRuleConfig.selector)
                );
                handlers.onCompleted = handlers.onCompleted.filter(handler => 
                    JSON.stringify(handler.ruleConfig.selector) !== JSON.stringify(newRuleConfig.selector)
                );
            }

            // 添加新规则和处理程序
            rules.push(newRuleConfig);

            if (onBeforeRequest) {
                handlers.onBeforeRequest.push({ ruleConfig: newRuleConfig, handler: onBeforeRequest });
            }
            if (onCompleted) {
                handlers.onCompleted.push({ ruleConfig: newRuleConfig, handler: onCompleted });
            }
        });

        updateListeners();
    }

    // 更新拦截监听器
    // 注意：Manifest V3 不支持 webRequest blocking 模式
    // 如需拦截/修改请求，请使用 chrome.declarativeNetRequest API
    function updateListeners() {
        chrome.webRequest.onBeforeRequest.removeListener(chrome_webrequest_begun);
        chrome.webRequest.onCompleted.removeListener(chrome_webrequest_done);

        if (handlers.onBeforeRequest.length > 0) {
            // MV3: 移除了 ["blocking"] 选项，现在只能监听，不能修改请求
            // 如需拦截/修改请求，请迁移到 chrome.declarativeNetRequest
            chrome.webRequest.onBeforeRequest.addListener(
                chrome_webrequest_begun,
                { urls: ["<all_urls>"] }
                // ["blocking"] // MV3 不支持
            );
        }

        if (handlers.onCompleted.length > 0) {
            chrome.webRequest.onCompleted.addListener(
                chrome_webrequest_done,
                { urls: ["<all_urls>"] }
            );
        }
    }

    // 清空规则和处理程序
    function clear() {
        rules = [];
        handlers = {
            onBeforeRequest: [],
            onCompleted: []
        };
        updateListeners(); // 更新监听器以移除所有拦截
    }

    // 默认的请求开始处理函数
    // 注意：MV3 中 onBeforeRequest 无法返回 blocking 结果（cancel/redirect）
    // 仅用于监听和记录请求
    async function chrome_webrequest_begun(details) {
        let url = details.url;
        for (let { ruleConfig, handler } of handlers.onBeforeRequest) {
            if (matchesRule(url, ruleConfig.selector)) {
                let action = ruleConfig.action;

                // MV3 警告：cancel 和 redirect 在非 blocking 模式下不生效
                // 如需这些功能，请使用 chrome.declarativeNetRequest
                if (action === 'cancel') {
                    console.warn('[MV3 Warning] cancel action requires declarativeNetRequest in MV3');
                } else if (typeof action === 'object' && action.redirect) {
                    console.warn('[MV3 Warning] redirect action requires declarativeNetRequest in MV3');
                }

                // 触发回调用于监听
                handler('Request intercepted', ruleConfig, details);
            }
        }

        // MV3：不再返回 blocking 结果
        return {};
    }

    // 默认的请求完成处理函数
    function chrome_webrequest_done(details) {
        let url = details.url;

        for (let { ruleConfig, handler } of handlers.onCompleted) {
            if (matchesRule(url, ruleConfig.selector)) {
                handler(ruleConfig, 'Request completed', details);
            }
        }
    }

    // 检查请求是否匹配规则    
    function matchesRule(url, selector) {
        if (typeof selector === 'string') {
            try {
                const regexPattern = selector.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*');
                const regex = new RegExp(`${regexPattern}`);

                return regex.test(url);
            } catch (e) {
                console.error('Invalid selector regex:', e);
                return false;
            }
        } else if (typeof selector === 'object') {
        	// 需要完善逻辑，这里应该包含regex，而不是字符串
            let include = selector.include || '*';
            let exclude = selector.exclude || '';
            return url.includes(include) && !url.includes(exclude);
        } else if (selector.match) {
            return new RegExp(selector.match).test(url);
        }
        return false;
    }

    // 获取重定向的 URL
    function getRedirectUrl(url, redirect) {
        if (typeof redirect === 'string') {
            return redirect;
        } else if (typeof redirect === 'object') {
            let fromRegex = new RegExp(redirect.from);
            return url.replace(fromRegex, redirect.to);
        }
        return url;
    }

    // 公共接口
    return {
        registerWebRequest,
        matchesRule,
        clear
    };
})();

// 测试
// const testUrls = [
//     "https://passport.csdn.net/v1/service/loginLog/queryLoginLog?pageIndex=1&pageSize=20",
//     "https://passport.csdn.net/v1/service/loginLog/queryLoginLog?pageIndex=1&pageSize=20",
//     "https://eva2.csdn.net/v3/06981375190026432f77c01bfca33e32/lts/groups/dadde766-b087-42da-8e67-d2499a520ee7/streams/a0119567-bf91-4314-ab75-f683ba6c0c0a/logs",
//     "https://cancel.me/path"
// ];

// const testSelectors = [
//     "passport.csdn.net/v1/service/loginLog/queryLoginLog*",
//     "*://passport.csdn.net/v1/service/loginLog/queryLoginLog*",
//     "https://eva2.csdn.net/v3/*/lts/groups/*/streams/*/logs",
//     "*cancel.me/*"
// ];

// testUrls.forEach(url => {
//     testSelectors.forEach(selector => {
//         const result = WebRequestFramework.matchesRule(url, selector);
//         console.log(`URL: ${url} | Selector: ${selector} | Match: ${result}`);
//     });
// });

// 在初始化时，自动注册一个示例插件
// WebRequestFramework.registerWebRequest(
//     [
//         { selector: '*cancel.me/*', action: 'cancel' },
//         { selector: { include: '*', exclude: 'http://exclude.me/*' }, action: { redirect: 'http://new_static.url' } },
//         { selector: { match: '*://match.me/*' }, action: { redirect: { from: '([^:]+)://match.me/(.*)', to: '$1://redirected.to/$2' } } }
//     ],
//     function (info, message, details) {
//         console.log('Request intercepted:', info, message, details);
//     },
//     function (info, message, details) {
//         console.log('Request completed:', info, message, details);
//     }
// );

// 注册 GM_webRequest 插件以取消匹配特定 URL 模式的请求
// 实际项目测试用，
// WebRequestFramework.registerWebRequest(
//     [
//         {
//             selector: '*://passport.csdn.net/v1/service/loginLog/queryLoginLog*', 
//         },
//         {
//             selector: 'https://eva2.csdn.net/v3/*/logs', // 匹配 URL 开头部分
//             action: 'cancel'  // 取消该请求
//         },
//         { selector: 'https://profile-avatar.csdnimg.cn/default.jpg*', action: { redirect: 'https://img1.baidu.com/it/u=3919864898,2468755943&fm=253&fmt=auto&app=120&f=JPEG?w=500&h=661' } },
//     ],
//     function (info, message, details) {
//         console.log('Request intercepted in begin:', info, message, details);
//     },
//     function (info, message, details) {
//         console.log('Request completed for specific URL:', info, message, details);
//     }
// );

//  todo
// 可以增加拦截协议，增加自定义请求和返回。可以监听协议返回结果。
// 增加网络拦截功能，参考篡改猴。完善框架中网页调用的接口 th4
