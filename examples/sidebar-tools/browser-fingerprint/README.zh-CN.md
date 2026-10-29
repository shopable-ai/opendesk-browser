# 浏览器指纹 · Browser Fingerprint R2.1（正式 React）

**产品方向：** 选择环境预设 → 修改参数 → 保存 → 当前授权 Tab 应用 → 独立网页读回 → 停止并核对恢复。**只读检测是辅助工具，不是主产品。**

设计基线：`preview/r20-reference.html`，原始 SHA256：
`f9aaacc486311c8344a3e1128e060c32349301f67d8cb523ce9a1f52cbf0b2a8`。
这是独立的 R2.0 设计原型，含明确标注的模拟 Host，**不能作为生产运行时或真实网页验证证据**。
生产唯一 React 入口为 `src/App.jsx`，`preview/react/index.html` 从同一套 React 源码编译生成。

## 本轮实现的正式业务

- 默认环境设置；原始 / 美国 / 德国 / 日本；UA / 语言 / 时区 / 定位 / 视口；新建、修改、保存、删除自定义预设和草稿保护。
- 自有持久化：`fingerprint.r21.presets.v1`、`fingerprint.r21.runs.v1`；8 KiB 上限、ETag/CAS 和写后读回。旧快照键 `fingerprint.a.history.v1` 完全保留，未迁移或覆盖。
- 三个业务 Tab：环境设置、网页验证、运行记录。旧版只读检测、历史及对比收起在运行记录内。
- 严格区分 `idle/applying/applied_unverified/verified_limited/partial/blocked/denied/unknown/invalidated/restoring/restore_unknown/restored_verified`。应用回执不等于网页独立验证；不可验证字段不显示一致。

## 当前真实能力的阻断：高敏原生接口尚未审查

- 现有 Host 只提供 `browser.page.getContext`；`browser.fingerprint.apply/readback/restore` 目前仅是 `src/run-session.js` 内待审的最小接口名称，**没有加入 Host 的白名单，不存在原生实现**。
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
- `src/ReadOnlyDiagnostics.jsx`：R1.8 的只读诊断界面，保留在运行记录下方；原 `src/model.js`、`src/history.js` 及测试未重写。
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
