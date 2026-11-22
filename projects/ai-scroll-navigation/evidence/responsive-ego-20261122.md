# 2026-11-22 · 自适应导航验证

本项目拥有 Page USER_SCRIPT opendesk.ai-scroll-navigation。仍只在 ChatGPT、DeepSeek、Gemini 的顶层 document_idle 按已批准规则运行。导航按可见滚动区排布并避让页面控件；横排放不下时尝试竖排。自定义锚点保留原位置规则。

| 证据 | 结果 |
| --- | --- |
| ego(lite) 本地源码 fixture | 视口 1330 → 800 → 390 → 1330px，滚动区宽 1306 → 318 → 366 → 1306px。四键通过鼠标点击完成下一轮、上一轮、到底、回顶；下一轮落点 792px，窄视口不挡模拟输入框。 |
| ego(lite) 本地设置预览 | 320px 下实点进入导航设置，七个开关可见，切换轮次数字有效；返回后打开内置网站列表，检查 ChatGPT、DeepSeek、Gemini 条目。进入自定义网站编辑，填写测试域名和路径；展宽到 680px 后编辑页和路径仍保留。预览不写入正式设置或网站授权。 |
| 编译与 Page 包 | 0.4.25/r28 通过原构建器及打包器生成。包源码 SHA-256：a1549c30b432334a3c6a5bf1260231b3bc5eab0a2caa51659fc168d863a162e0。官方目录保持 blocked。 |
| 当前 ego Profile | 原产品接口返回已安装 0.4.24/r27，ready:false，waiting-user-scripts；扩展上下文未暴露 chrome.userScripts.getScripts。ego 的 GrayDove Developer 扩展详情实读到关闭的「允许运行用户脚本」开关，未改变权限。本轮打开先前专用 ChatGPT 对话，观察到四轮已完成问答。在 390px 用原生滚轮把会话从 249px 滚回顶部，未出现导航 Dock。实际滚动证明原生区域可用；导航按钮只在本地 fixture 实点通过。新候选未安装。 |
| 其他站点 | DeepSeek 跳到登录页；Gemini 打开输入页但无轮次。保留现有适配；未据此推断新选择器。 |

从仓库根目录启动本地服务，使用自己的 ego TaskSpace ID 替换下例的 15：

~~~sh
python3 -m http.server 62824 --bind 127.0.0.1 --directory .
sed 's/taskSpace(EGO_TEST_SPACE)/taskSpace(15)/' projects/ai-scroll-navigation/tests/responsive-ego.js | ego-browser nodejs
~~~

三站的候选安装、激活及实际会话导航为 NOT_TESTED。
