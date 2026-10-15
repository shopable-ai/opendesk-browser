> **R5 跨域 UserScript 发现（2026-10-15）**：从 [24 领域 × 网站页面任务](domain-relevance-universe-r5.zh-CN.md) 和 [脚本/竞品具体 ID、版权及适配判定](script-market-discovery-r5.zh-CN.md) 开始；本文件 G0–G3 是功能分级规划，绝非全量 GM 通过。任何“直接运行/授权适配”都须重新核验 `@match/@grant/@license`、依赖锁、真实 Chrome、源码/权限世界；不把热门脚本改名即分发。

# UserScript / Website Tools 生态：真实基础与优先缺口

> 2026-10-12 审计基于远端 `main` 的指定文件、R8 原始 188 项和 GM 矩阵。不是“全面 Tampermonkey 兼容”声明。

## 一、目标体验与功能树

```text
按网站发现 → 新建 JS/React/Vue → 可信本地编译 → 当前页面真实调试
             ↓
      固定源码哈希 / 依赖锁 / 权限
             ↓
        验证候选 → 发布本机可用版 → 安装 / 自动运行
             ↓
       禁用 / 日志 / 逐项授权 / 更新预览
             ↓
       版本 diff → 用户确认 → 切换或回滚 → 可选脚本市场
```

**页面脚本不是 Controller**：USER_SCRIPT 只获得按脚本与网站批准的运行时能力。Controller 的零参数 `main()` 词法 `page/params/_/dayjs` 不代表 Page `window.page` 或具备 `chrome.cookies`；详情见[`src/libs` 执行世界合同](../../api/runtime-globals-and-preinstalled-libraries.zh-CN.md)。

## 二、源码级审计与 R8 差分

| 能力 | 2026-10-12 状态（证据级别） | 源码/权威 | 下一关口 |
| --- | --- | --- | --- |
| 元数据解析、匹配、排除、依赖锁 | SOURCE_IMPLEMENTED 部分语义；GM 扩展语法仍须按矩阵拒绝/适配 | src/scripting/user-scripts/dependency-metadata.js、dependency-manager.js、page-program-rules.js | @include/exclude、@connect、@resource 分别审计 |
| 安装版本与用户授权 | SOURCE_IMPLEMENTED 受信安装与候选 API | src/scripting/user-scripts/installed-programs.js、page-install-authorization.js | 逐候选证明安装/撤销/升级用户体验 |
| Chrome 原生注册及对账 | SOURCE_IMPLEMENTED：见 register/unregister/getScripts/reconcile/boot | src/scripting/user-scripts/installed-programs.js | 需与同一 HEAD 的真实 Chrome 原生 E2E 绑定 |
| 网页组件 React/Vue | SOURCE_IMPLEMENTED 固定扩展 Worker/打包来源；已有部分历史 CI/原生证据 | src/ui/page-component-preparer.js、page-component-compiler-worker.js | R24.4 最终完整运行/样式/重启仍 NOT_TESTED |
| Sidebar Script 管理展示 | SOURCE_IMPLEMENTED：列表、当前状态、启用停用入口 | src/ui/installed-page-tools.js、tool.html | 普通用户可发现性、独立管理页及更新差异完善 |
| GM G0/G1/G2 完整适配 | R8 GM 矩阵标记缺失；本轮未获得同候选逐方法完整通过证据 | docs/architecture/browser-framework/userscript-compatibility-matrix-r8.zh-CN.md | 每方法独立参数/回调/世界/失败测试 |
| 脚本市场作者发布 | 现有受限市场安装 Intent；独立作者签名/审核后台非同一功能 | src/marketplace、src/market-site | 作者、许可证、撤销与可信源流程 |
| 定时/后台 UserScript | 现有 alarms/Task 能力不自动等于 @background/@crontab ScriptCat 语义 | src/platform/tasks、当前独立任务工作流 | 单独设计并验证，不复刻 Sandbox timer |

Chrome 138+ 需要用户针对每个扩展开启 **Allow User Scripts**；默认新安装扩展不自动开放。见[Chrome 官方说明](https://developer.chrome.com/blog/chrome-userscript)及[API](https://developer.chrome.com/docs/extensions/reference/api/userScripts)。

## 三、GM 分级能力（不复制第二个 Browser SDK）

| 阶段 | 方法/能力 | 技术复用 | 阻断条件 |
| --- | --- | --- | --- |
| G0 优先 | GM_info / GM.info、GM_addStyle、GM_log | 现有真实脚本身份、Page UI CSS、受限日志 | 脚本世界身份校验、撤销和配额 |
| G1 第二批 | GM.getValue/setValue/deleteValue/listValues、资源 Text/URL、Menu、Change Listener | 存储和消息 Broker 的底层组件，不复用跨作者授权 | 脚本 namespace + 用户许可 + 版本；同步旧 API 未证明不要暴露 |
| G2 需求驱动 | GM_xmlhttpRequest、download、notification、openInTab | 受控 NetworkService、Tabs、Downloads adapter | @connect×Chrome host grant×脚本 grant×用户许可；二进制、abort 回调等需新测试 |
| G3 延后/可拒绝 | GM_cookie、unsafeWindow、MAIN 共享与高权限操作 | 仅政策评估，无默认开关 | 敏感 Cookie/跨网站读取与不可信页面代码 |

**高风险误区**：`@grant none` 不是把 Page JS 升权到 MAIN；`GM_xmlhttpRequest` 不是现有 `axiosx` 的改名；`@crontab` 不是在 SW 内放一个 setInterval。异步存储不能假冒 Tampermonkey 传统同步 GM API 的返回语义。

## 四、脚本管理最低可用功能

- `.user.js` 安全导入/导出；URL 识别和来源记录；`@name/@namespace/@version/@match/@exclude-match/@run-at/@noframes/@grant/@require` 语义差异提示。
- 脚本安装确认：网站、Frame、权限、版本、固定哈希、许可证及外部依赖。设置网站例外和按脚本开关；停用后不再在**新文档**执行，但不谎称回滚已经改变的网页 DOM。
- 自动/手动版本检查：只下载候选字节；`sourceHash`、依赖锁、元数据及新增网站/权限与旧版 diff；有风险需人工确认；失败旧版仍能运行，恶意版本可紧急撤销。
- 运行日志：脚本 ID、版本、URL 模式、tab/frame/document/run identity、错误、源映射；有限留存与脱敏。SPA/BFCache/iframe/多脚本冲突是原生测试专章。
- 默认控制台可完成轻量操作；源码/依赖 diff、GM 调试、完整项目编辑可使用独立编辑视图，**不强加新 Sidebar 一级 Tab**。

## 五、React/Vue 自动准备与第三方依赖

现有 `page-component-preparer.js` 使用固定资源的 Worker 进行有限 JSX/SFC 转换：普通用户无需自行手动复杂打包，但不保证任意 npm 包、TSX、Vue 预处理器都能运行。正确链路是 **作者源码 → 受信准备器 → 检查资源预算/依赖锁 → 受控 Page USER_SCRIPT**，而不是目标网页通过 `import('https://vendor/xxx.js')` 获得任意执行权。

受信 SW/Side Panel、第三方工具 iframe、Page USER_SCRIPT、Controller 各有自己的模块环境。远端 `.user.js` 只有在 User Scripts API 允许的用途及安全授权边界内执行；任何远程代码不得当做新增 Chrome 特权功能的通道。见[MV3 远程代码限制](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)。

## 六、作者和发布治理（先小型精选市场）

```text
Author identity + license + repo URL
→ 发布请求 / 源码和依赖检查 / 静态规则 / 风险标记
→ 非上架预览 / 用户许可差分 / 人工审核（高风险）
→ 只读发行版本 + 签名/哈希 + 启用范围
→ 网页/网站 → Intent → 扩展内再次确认
→ 自动更新检查只提示候选，不暗中扩大授权
→ 用户反馈 / 站点失效 / 安全撤销 / 版本回滚
```

从现有 `src/marketplace/intent.js` 的有限交接语义扩展 `script` Subject 需要新协议版本及兼容性测试，不能随意将网页消息当授权。建议首批 10–20 个经过人工复核的脚本，先证实从发布到更新再到失效回滚的可靠性，之后才开放自助提交。

## 七、网站适配工厂

按 `行业 → 网站页面类型 → 可复用功能 → 适配器 → Fixtures → 安装版本` 组织。每个适配器维护 `sitePattern / matcherVersion / selectors / featureIds / lastGreenTest / fallback / owner`；SPA 导航只触发 opt-in 更新，不盲目重复整个脚本；DOM 变化进入 fail-closed 并生成错误报告，不在后台循环重试造成网站负载。

脚本冲突按 `documentId + scriptId + revision` 幂等；权限因网站、Frame、用户开关和宿主 Browser SDK 而变化。人工验证网站条款、登录与数据使用，不默认绕过访问控制、反自动化策略或隐私保护。

## 八、购物优惠专项边界

支持阶段：`购物清单/商品规格记录/到手价计算`（本地、低风险）→ `公开合法价格 API+历史价`（需 SaaS、授权和成本）→ `用户主动验证优惠码`（每次有直接用户利益和相关操作、独立 CWS 政策审查）→ `透明联盟/返利`（最后考虑）。不得隐藏插入 cookie、自动抢最后点击归因、在无折扣时添加联盟链接、静默替换第三方链接。见[官方 Affiliate Ads](https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads)及[FAQ](https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads-faq)。
