# AI 求职助手 · Job Assistant R1

项目 owner：projects/job-assistant/；产品 ID：job-assistant；当前目标站点：BOSS 直聘（www.zhipin.com）。
工作分支：main。状态：SOURCE_WIRED；未构建正式工具包，未安装，未在真实 Chrome/BOSS 页面验收。

## 解决什么问题

把“打开职位 → 阅读要求 → 过滤不合适的岗位 → 判断自己是否匹配 → 准备有针对性的沟通”从重复手工整理改成可解释、可审核的流程。初版不做全自动海投或绕过网站限制。

首个真实链路：用户已登录 BOSS 并打开职位列表 → 明确授权安装组合应用 → 在侧栏点击“扫描当前页面” → 已安装 Page 模块仅读取当前 DOM 已加载卡片 → 侧栏用本地规则排序、显示理由 → 手动加入待审核清单 → 打开沟通草稿，人工核对后复制。**没有任何自动点击“立即沟通”、发送消息、投简历或切换职位页的代码。**

如果未安装/未授权/页面已切换/页面改版，必须保守失败，不显示伪造岗位/成功投递。

## 从哪些开源项目汲取设计思路

- AutoCast-Boss海投助手：https://github.com/gstranded/autocast-boss-assistant （职位筛选、去重、回执/暂停；MIT；仅作为对照）
- BossAutoApply：https://github.com/FanzhiZeng/BossAutoApply （轻量 Manifest V3 的 content/background 分工；MIT）
- boss-zhipin-helper：https://github.com/ConsoleSun/boss-zhipin-helper （DOM 监听、简历信息、AI 草稿；MIT）
- smart-job：https://github.com/DINQ-labs/smart-job （多平台 adapter 和 Agent 规划；MIT）
- joohw/boss-cli 等 HR 端自动招聘项目不是求职者端实现，不直接复用。

本项目新写原始代码，不复制第三方源文件。任何未来导入第三方代码需记录 LICENSE、来源版本与修改范围。

## 目录与权限边界

- tool.config.json：v2 Sidebar Tool；storage.local、page.module、user.export；同一项目打包。
- package.json：app.job-assistant 的 page-userscript 源，授权范围仅 www.zhipin.com；顶层 USER_SCRIPT。
- src/page/main.js：通过 OpenDeskAppPage 接收 jobs.scan；**只读已加载 DOM**，不给侧栏暴露任意脚本执行接口。
- src/main.js：侧栏偏好、规则匹配、待审清单、人工编辑草稿与复制；通过原 OpenDeskTool.request 调用，不使用 chrome.* 或任意网络请求。
- src/index.html + style.css：Side Panel 紧凑界面；复用主宿主 od-* 样式。
- REQUIREMENTS.zh-CN.md：需求树、验收与后续安全门禁。

OpenDesk 公开试点：docs/api/sidebar-tool-page-module.zh-CN.md。暂不改 Browser Framework 的 src/、manifest、Catalog、全局 SDK。Page API 和用户授权的真实可用性须本机验收，不能据源码推断正式可用。

## 开发与验证

在仓库根目录按既有命令构建到忽略的候选路径，不直接生成正式包：

    node scripts/build-sidebar-tool.mjs projects/job-assistant --out artifacts/sidebar-tools/job-assistant/candidate.opendesk-tool.json

先执行 JavaScript 语法/定向构建与页面 fixture 测试，再在已授权的真实 Chrome 上安装候选、刷新 BOSS 搜索列表，核对 Page module 的扫描结果。确认稳定才按既有打包 Skill 晋升唯一 job-assistant.opendesk-tool.json；不要因本说明直接认定安装已完成。

**已知未完成**：真实 BOSS DOM 选择器覆盖验证、登录和授权实测、页面动态更新处理、AI 简历语义匹配、正式任务执行/Stop/回执、跨网站平台适配、历史已沟通检测、运行队列与简历上传。这些不得标为 PASS。自动发送和账号限制处理属于下一阶段独立审查。
