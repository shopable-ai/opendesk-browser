# 浏览器指纹 · Browser Fingerprint R2.1（正式 React）

**产品方向：** 选择环境预设 → 修改参数 → 保存 → 当前授权 Tab 应用 → 独立网页读回 → 停止并核对恢复。**只读检测是辅助工具，不是主产品。**

设计基线：`preview/r20-reference.html`，原始 SHA256：
`f9aaacc486311c8344a3e1128e060c32349301f67d8cb523ce9a1f52cbf0b2a8`。
这是独立的 R2.0 设计原型，含明确标注的模拟 Host，**不能作为生产运行时或真实网页验证证据**。
生产唯一 React 入口为 `src/App.jsx`，`preview/react/index.html` 从同一套 React 源码编译生成。

## 本轮实现的正式业务

- 默认环境设置；原始 / 美国 / 德国 / 日本；UA / 语言 / 时区 / 定位 / 视口；新建、修改、保存、删除自定义预设和草稿保护。
- 自有持久化：`fingerprint.r21.presets.v1`、`fingerprint.r21.runs.v1`；8 KiB 上限、ETag/CAS 和写后读回。旧快照键 `fingerprint.a.history.v1` 完全保留，未迁移或覆盖。
- 三个业务 Tab：环境设置、网页验证、运行记录。只读六字段检测收起在运行记录内；旧历史及对比实现保留，默认核心诊断不访问旧历史。
- 严格区分 `idle/applying/applied_unverified/verified_limited/partial/blocked/denied/unknown/invalidated/restoring/restore_unknown/restored_verified`。应用回执不等于网页独立验证；不可验证字段不显示一致。

## 当前真实能力的阻断：高敏原生接口尚未审查

- 现有 Host 提供 `browser.page.getContext` 和只读 `browser.page.readEnvironment`（UA、语言、时区、视口、屏幕、像素比）；`browser.fingerprint.apply/readback/restore` 目前仅是 `src/run-session.js` 内待审的最小接口名称，**没有加入 Host 的白名单，不存在原生实现**。
- Chrome Manifest 当前**没有** `debugger` 权限。应用前先通过可信 `browser.capabilities.getStatus` 检测；没有受审的 Host 接口则返回 **BLOCKED**，不操作当前网页，不伪造任何成功。
- 当前版本不修改公网 IP、代理、物理屏幕、独立 Profile；不承诺防关联、WebRTC/Canvas/WebGL 指纹隔离。

要让 P1 真正生效，必须先完成权限与生命周期审计：

1. 经明确授权仅绑定当前 HTTP(S) 活动 Tab 的原生调试权限；Host 复核安装包 hash、epoch、Chrome 原生权限与一次点击；绝不信任 Sandbox 传入的任意 CDP 指令或 tabId。
2. 最小命令白名单只覆盖 UA/UA-CH、JS 语言与请求语言、时区、Geolocation、视口设备指标；每项实际执行与独立读取分开。
3. 受信 Session 绑定固定 TabRef+DocumentRef；导航、Tab 关闭、撤权、DevTools 接管、Host 重启即失效；不重放未知副作用。
4. 真实基线必须先采集；恢复后再次独立采集。不能因 debugger.detach 成功就宣布已恢复。
5. 高敏 debugger 权限及相应 Chrome 官方提示需要专门审查；**不得未经审批扩大 Manifest 或将此版提升官方 Catalog**。

## 保留与新增文件

- `src/App.jsx`：已确认 R2.0 三个业务 Tab 的正式 React。
- `src/ReadOnlyDiagnostics.jsx`：合入 R1.9 的真实六字段只读诊断，保留在运行记录下方；原 `src/model.js`、`src/history.js` 及测试未重写。
- `src/env-config.js`：R2.0 预设与可验证字段模型。
- `src/presets.js`：预设与运行记录 CAS 持久化。
- `src/run-session.js`：严格的 Host 预检查、当前文档一致性、独立读回与恢复状态。
- `preview/react/sdk-preview.js`：离线测试替身，所有真实 Chrome 环境修改一律拒绝。
- `tests/r21.test.mjs`：新增预设、CAS、状态、报告来源拒绝测试。

## 本地增量核验命令

```sh
npm --prefix examples/sidebar-tools/browser-fingerprint test
npm --prefix examples/sidebar-tools/browser-fingerprint run build
npm --prefix examples/sidebar-tools/browser-fingerprint run preview:build
npm --prefix examples/sidebar-tools/browser-fingerprint run preview:check
```

**不要虚报：** Mac Chrome 安装/权限/真实环境修改/恢复依然 NOT_TESTED，P1 Chrome Native 环境修改 BLOCKED。开发测试（Node/BUILD/Chromium）也必须按本轮实际运行记录另行给出，旧 R1.8 PASS 不等于 R2.1 PASS。

## 合并前 R1.9 只读诊断的既有记录

以下保留原只读诊断的安装方式与验证记录；它们不证明合并后的 R2.1 组合已通过构建或原生验收。保存、历史、对比与导出仍为该诊断的延期项。

## 运行与授权

唯一可导入文件为 [browser-fingerprint.opendesk-tool.json](browser-fingerprint.opendesk-tool.json)，工具版本 `0.2.1`。需要同时包含新 SDK 的 OpenDesk Browser；只导入工具 JSON 不能升级 Browser 的可信 Host。当前开发扩展使用本仓库 `dist/development` 与 `npm run dev`。

通过「扩展 → 更多 → 导入」审阅安装后打开应用，在普通 HTTP(S) 网页点击检测。首次使用某个网站时，由可信 Host 审阅六字段读取授权；同一安装和网站后续复用授权。Chrome 网站访问权限仍须有效；拒绝、撤权、停用或卸载后不能继续采集。

- `browser.page.getContext`：取得可信 Host 核验的网页上下文与 opaque 文档引用。
- `browser.page.readEnvironment({tabRef,documentRef})`：固定六字段白名单，只读目标顶层文档 `MAIN` 世界；不接收脚本、URL 或原生 Tab ID。
- 来源标记为「目标网页 JS · MAIN · 顶层文档」，表示网页观察到的 JS 环境值，不是硬件认证或 HTTP 请求头。
- 正常值、不可用与未知分别展示；整次未授权或身份失效则拒绝并清除结果。导航和标签切换后，界面在下一次身份检查时清除旧值（约 2.5 秒）。每次检查的两次 SDK 查询留出宿主请求预算，避免窗口持续打开后因限流清空读数。
- 原生采集限时 3 秒、回执最多 8 KiB；首次可信授权另有等待预算。迟到或其他文档的回执不采用。

## 已验证的当前核心链

真实 Mac Chrome for Testing `154.0.8037.92` 的 headless 与有界面窗口均通过实际 Chrome `SIDE_PANEL` 和原安装审阅 UI 完成八项检查：安装、拒绝授权无值、等待超过旧 8 秒限制后授权读取、六值与独立目标读取一致、再次检测无需重复授权、导航清除、重新检测新文档、切换 Tab 清除。有界面续测后保留检测结果；系统窗口列表确认该任务窗口在屏幕上且位于前台，开发服务已连接。

本轮定向 Node 测试 120/120、React 构建、同源预览与正式 JSON 同源检查 PASS。Node 中另覆盖文档/安装身份、撤权/卸载、跨站拒绝和超时。证据与边界见 [核心开发结果](evidence/r19-core-development.zh-CN.md)；初次能力缺口保留在 [历史 SDK 审计](evidence/r19-sdk-admission.zh-CN.md)。

这是独立 CFT Profile 的开发阶段真实核心证据。个人日常 Chrome、production 候选完整验收、保存/历史/比较/报告闭环及官方 Catalog 发布仍未执行，不宣称完整 R1.9 `READY_FOR_LOCAL_CODEX`。

## 源码与定向复现

`src/ReadOnlyDiagnostics.jsx` 为只读诊断 React UI，`src/adapter.js` 只调用公开 SDK；`src/model.js` 严格校验实时 v2 回执，并禁止其静默进入旧 v1 历史。`preview/react/sdk-preview.js` 仅为显式离线演示替身，不产生真实网页证据。

```sh
node --test tests/environment/browser-page-environment.test.mjs tests/environment/browser-page-environment-host.test.mjs tests/environment/browser-sdk-r124-current-page.test.mjs examples/sidebar-tools/browser-fingerprint/tests/environment.test.mjs
npm --prefix examples/sidebar-tools/browser-fingerprint run build
npm --prefix examples/sidebar-tools/browser-fingerprint run preview:build
npm --prefix examples/sidebar-tools/browser-fingerprint run preview:check
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/browser-fingerprint --check-project
```

真实核心脚本复用仓库原 launcher/transport，需要既有 CFT 154、开发扩展及标准演示页面服务；使用独立临时 Profile，不操作个人 Chrome 数据。默认无界面，完成后清理浏览器：

```sh
node examples/sidebar-tools/browser-fingerprint/tests/native-core.mjs
```

需要用户实际查看和操作时，在保留 stdin 的终端运行：

```sh
node examples/sidebar-tools/browser-fingerprint/tests/native-core.mjs --headed --keep-open
```

`--headed` 通过 Chrome 自身 UI 开启该临时 Profile 的开发者模式，加载固定 `dist/development`；安装与网站授权仍走原产品审阅 UI。`--keep-open` 必须与 `--headed` 一起使用，结束后保留成功结果（失败时保留现场），不会自动关闭窗口。证据目录的 `session.json` 记录本任务进程与 Profile。终端输入 `close` 或向记录的 `driverPid` 发送 `SIGTERM`，由原 launcher 关闭所属浏览器并清理临时 Profile；保留期间不要手动删除该 Profile。
