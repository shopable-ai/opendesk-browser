# ChatGPT Mind Map R3.8 · 正式安装前原生 Chrome 技术审计

> 2026-10-16 · `main` 增量实施。**仍非生产安装批准单**，设计状态 `PENDING_USER_CONFIRMATION`。每次按最新 commit 的真实 Actions Job/Artifact 核对，不继承历史 CI 的通过状态。

## 1. 用户验收状态（不混淆四层）

| 层次 | 状态 | 真实证据 / 尚需完成 |
| --- | --- | --- |
| R3.7 独立 Program、A/B/C、移动端与原文恢复 | `PASS`（历史固定模拟页） | [R3.7 原始 CI #38868806490](https://github.com/shopable-ai/opendesk-browser/actions/runs/38868806490)，不是本轮正式安装 |
| Program 编译、来源 Hash | `BUILD_PASS` / `BUILT_UNVERIFIED` | `scripts/audit-build.mjs` 精确审计；`installable:false` |
| WXT `dist/production` 真正 MV3 包 | `CI_RUNNING_OR_NOT_TESTED` | R3.8 新 CI Job 执行 `npm run build` / `verify-package`，Job 结果优先 |
| Chrome `userScripts.register/getScripts` 技术可行性 | `CI_RUNNING_OR_NOT_TESTED` | R3.8 临时扩展隔离探针，不等于安装 |
| 原始 4 份 XMind 在 `USER_SCRIPT` 实际运行 | `CI_RUNNING_OR_BLOCKED` | 临时测试世界，在浏览器验证资源和渲染；**不纳入发行包** |
| OpenDesk Page Program Verified → Available → Installed | `NOT_TESTED` | 原生实验不跳过正式 Broker 就无法标记通过 |
| 真实已登录 `chatgpt.com` DOM / SPA / BFCache | `REAL_CHATGPT_NOT_TESTED` | CI 使用本地提交的模拟 HTML，通过 Playwright 路由替换网页内容 |
| 第三方 XMind / Snowbrush / GSAP 生产许可证 | `BLOCKED` | 原始压缩文件所有权、传递依赖、确切许可证及再分发条款不完整 |
| Snowbrush `style#snowbrush_style` 回收 | `BLOCKED` | 已发现全局泄漏，尚无可信所有权/隔离证明 |
| 用户 Mac 已安装、撤权、停用后旧页面 | `NOT_TESTED` | 当前网页环境无法操作本地 Mac Chrome |
| 正式产品是否可用 | **`NO`** | 生产许可、固定 Runtime 准入与真实安装 E2E 缺失 |

**规则：未取得 Native Chrome Job 原始结果，不将上述 `CI_RUNNING_OR_NOT_TESTED` 转为 PASS。任何离线原始引擎截图都不代表真实登录 ChatGPT。**

## 2. 实际代码边界与修复

- 原产品 Program 保留在 `examples/programs/chatgpt-mindmap/`，不改 XMind Renderer、Icon 工具栏、独立 Answer Controller、320px 适配算法、A/B/C 转换。
- `src/scripting/user-scripts/installed-programs.js` 是唯一正式安装/启停/撤权/卸载记录与 `chrome.userScripts` 原生引导拥有者。真实安装必须先 `verifyPageCandidate`、`makePageAvailable`、`installPageProgram`，最后由 `reconcileOne` 取得 `getScripts` 注册一致性证明，并以精确文档标识派发 Program。
- 现有 `src/ui/page-program-library.js` 将 **持久授权成功** 和 **Chrome 原生注册成功** 分开显示：只有 `authorization.status=active` **且** `nativeState=registered` 才能显示「已授权 · Chrome 已注册」。否则显示「原生注册异常 · 自动运行未确认」。缺少 userScripts 时提示用户到 Chrome 扩展详情开启「允许用户脚本」。扩展和网页不能绕开 Chrome 138+ 用户开关。
- `tests/environment/page-program-library.test.mjs` 新增相应状态不冒充成功及恢复入口的 DOM 单元测试。

## 3. 真实 Chrome 原生实验范围（不越过许可证）

- `tests/framework/chatgpt-mindmap-r38-native-probe.mjs` 在隔离临时目录复制**实际** WXT `dist/production`，校验 `manifest_version=3`、`userScripts` 权限、真实 Service Worker、原生 `register/getScripts`、自动注入、USER_SCRIPT 和 MAIN 全局隔离、`unregister` 后刷新不再执行。
- **仅在该临时测试副本**将原先 Git-tracked 的四份预览 JS 按 `tests/xmind-provenance.json` 所列 SHA-256/精确字节复制到固定文件路径，经原生 `chrome.userScripts.execute` 在命名 `USER_SCRIPT` 测试世界顺序载入，随后执行**原始** `build:program` 输出 `program.js`，绝不手写第二个渲染器、伪造 `JSZip`/`Workbook`/`Topic`/`Dumper`。
- 网页为提交到 Git 的三条 ChatGPT 回复**离线模拟夹具**；浏览器 URL 被路由到 `https://chatgpt.com/__opendesk_r38_native_fixture`，因此验证的是 *真实 Chrome + 模拟 ChatGPT DOM*，而不是在线登录界面、真实服务器或用户内容。
- 测试完成自动关闭受控 Chrome、删除临时 Profile 和**含厂商 JS 的临时扩展**。Actions 仅可上传 JSON 结果/PNG/构建审计，**不上传厂商字节、Browser 测试副本或用户聊天内容**。
- 不调用正式安装的 `verifyPageCandidate` / `installPageProgram`，不写入 OpenDesk 持久安装数据库；此项是技术可行性探针，状态必须标记 **`TEMPORARY_USER_SCRIPT_FEASIBILITY`**，不能记为 `NATIVE_EXTENSION_E2E_PASS`。
- 所有步骤失败应退出非零并保留错误 JSON；不能通过跳过 Runtime 加载、关闭断言或使用 Mock 绘图令流水线虚假变绿。

专项 CI：[ChatGPT Mind Map original JS direct preview and browser proof](https://github.com/shopable-ai/opendesk-browser/actions/workflows/chatgpt-mindmap-preview.yml)。观察第三个 Job：`native-user-script-xmind-feasibility`，优先使用**最新提交**对应 Job，而不是旧 CI。上传证据 Artifact 逻辑名：`r38-real-chrome-temporary-extension-feasibility`。

## 4. 正式产品仍待解决的硬门槛

1. **License / provenance**：分别核实现有**精确** JSZip、polyfill、XMind SDK、Snowbrush、GSAP 压缩字节的上游仓库和版本、许可证、NOTICE、再分发许可与第三方清单。其他同名开源仓库拥有 MIT 许可证，不能代替本项目 3.44 MB 压缩包的合法性证明。
2. **可信资源准入**：证明通用 SDK 能从同一已安装 Browser Extension 的经过 SHA-256/版本/执行世界审计的固定资源加载依赖，不允许将 4 MB 依赖塞进 60KiB CSS 资产或 512KiB 编译入口来作弊，不借用 CDN、MAIN world、第二扩展或未验证脚本。
3. **Global CSS 所有权**：审查 Snowbrush 真实 `style#snowbrush_style` 创建、作用域、引用计数和释放时机，避免 A/B 共存的样式竞争及影响 ChatGPT 全局样式。没有证据不得声称 Stop 干净。
4. **真实 OpenDesk 安装链**：在正式 Browser UI 中从候选保存、真实 Page 预览回执、标 Available、用户网站授权、安装、原生注册、自动执行获得逐步骤凭证。不可仅在测试脚本直接 `chrome.userScripts.register` 后宣称产品已安装。
5. **真实 ChatGPT 和生命周期**：独立检测已登录页面、Streaming 和 SPA 更新，做 320/400/440/桌面、全屏、20 次开关、撤权、Worker 重启、BFCache、旧网页 Stop 与卸载等验收，保留失败回执。

当前任何一个硬门槛未关闭时，`E_XMIND_RUNTIME_UNAVAILABLE` 应继续 **fail closed**，`BUILT_UNVERIFIED` 继续 `installable:false`。不能为了 UI 看起来能安装而默认批准第三方代码。

## 5. 95+ 独立验收记录

正式安装体验 `BLOCKED`；生产 XMind Runtime `BLOCKED`；真实 ChatGPT `NOT_TESTED`；正式 Native 安装 E2E `NOT_TESTED`；R3.7 交互 `PASS (SIMULATION_ONLY)`；架构复用 `PARTIAL_PASS`；许可/样式 `BLOCKED`；生命周期 `NOT_TESTED`；正式打包 Hash `CI_RUNNING_OR_NOT_TESTED`；正式视觉截图 `NOT_TESTED`。**无证据维度不填写数字，整体质量门禁未达到 95 分。**

R3.7 的历史结果保持独立，用户尚未确认预览设计，`PENDING_USER_CONFIRMATION` 不变。
