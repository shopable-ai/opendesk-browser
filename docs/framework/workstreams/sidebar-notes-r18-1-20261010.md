# OpenDesk Browser R18.1：网页笔记数据可靠性与 Side Panel 工具收口

记录日期：2026-10-10。基线：`8f6e5a3fcd13c17514ca08a54b9c7c72a05b732c`。本文件只记录 R18.1，不改写 R18/R19/R4.1 历史证据。

## 已确认的源码缺陷及本轮改动

1. v1.1.0 读取恢复未完成时可保存或新建，可能用空状态覆盖旧笔记。v1.1.1 在完整读取 `notes`、旧版 `note` 成功前锁定编辑，失败时禁止写入。
2. v1.1.0 删除旧数据先写 `notes`，再清理 `note`；第二次失败会误报整个删除失败。现先提交权威数组（`[]` 是永久删除标记），之后清理旧值，清理失败明确提示、下一次保存重试。
3. 原 R1 Web Lock 原本只串行化单个 `storage.set`。两个 Side Panel 同时基于旧版 `notes` 进行整数组写入仍会丢更新。宿主支持可选 `withEtag` / `ifMatch`，在既有 Web Lock 内以 SHA-256 内容标记执行条件写入；不改变旧工具的非条件请求格式，不添加存储字段或扩大权限。
4. 保存中多次点击、新建、切换和删除不再覆盖本次写入；发生错误保留编辑器文本，显示结果不确定或并发冲突的恢复办法。
5. 页面切换通知只发送到活跃工具 frame，经现有实例、toolId、source 条件校验在隔离桥中传递事件；保存 URL 关联之前主动复核。受限网页不阻断纯离线存储。
6. 复用 R19 控件 8px、表面 12px、4/8/12/16px 节奏。工具 iframe 的 78vh CSS 上限改为与原消息尺寸上限一致的 1600px，减少宿主与 iframe 的嵌套滚动；独立工具标签页保留既有 max-height:none。

## 改动与自动测试定位

- 网页笔记：`examples/sidebar-tools/quick-notes/src/main.js`、`tool.config.json`、正式 `quick-notes.opendesk-tool.json`、`README.md`。
- 宿主和桥：`src/ui/sidebar-tools.js`、`src/sidebar-tools/bridge.js`、`src/ui/tool-shell.css`。
- 回归：`tests/environment/sidebar-quick-notes.test.mjs`、`tests/environment/sidebar-tools-host.test.mjs`；官方构建 JSON 比较路径已更新至 v1.1.1。
- 官方打包合同：`npm run build:sidebar-tool -- examples/sidebar-tools/quick-notes --out examples/sidebar-tools/quick-notes/quick-notes.opendesk-tool.json`；正式 GitHub Actions 经官方打包器重建并通过 `cmp` 逐字节判等，版本 v1.1.1，PNG data URI 已校验。
- **CI_PASS（仅组件/构建）：** [Sidebar user tools R1 正式运行 #38064141768](https://github.com/shopable-ai/opendesk-browser/actions/runs/38064141768)，候选 SHA `ad66ff1eba0023fce70176267428c4a1dc65f603`，2026-10-10：相关环境套件 **104/104 PASS**，`npm run check`、官方工具打包/严格 `cmp`、React/Vue starter 编译、`npm run build`、`npm run build:dev`、`npm run verify` 全部 PASS。正式生产 packageHash `386929056fd2cad7490b572410bc19d5f7109774e913734a3f7ee61ac602d595`，开发 packageHash `174a6b7d91f241eefe2e7a2d58632ecc6ad508b9bba2bd1fcea884be140483a2`。此前两项回归测试断言/异步等待失败已保留在旧运行 #38063924344，并在最终候选修复验证。
- **STATIC_MARKUP_CHROME_PASS（不是 Native）：** [R19 静态页面布局 #38063797196](https://github.com/shopable-ai/opendesk-browser/actions/runs/38063797196)，对应 CSS 提交 SHA `2262779593f4198390c20583c1e09a5f6f21643c`，独立受控 Chrome 的真实 HTML/CSS 静态布局检查成功，不代表安装扩展/实际 Side Panel。
- 以上 CI 主线在证据采集时远端 `main` 相比组件候选 SHA 仅新增 `docs/framework/workstreams/r15-4-independent-libraries-20261010.md`，实际回归/构建输入未变化；每次后续写入仍须重新核对。

## 证据等级和缺口（不得冒充 Native）

本会话可操作 GitHub main 源码，但执行环境是 Linux 容器，不能读取或操作用户 Mac 的已安装 Chrome Profile，也不能确认扩展 ID、实际加载版本或原生安装流程。Mac Chrome 安装/更新/卸载/重启、真实网页标题、网络断开、实际 125%/200% 缩放、五个原生页签与独立工具页截图均为 **NATIVE_NOT_TESTED**；历史 R1 原生候选与 R19 STATIC_MARKUP_CHROME 结果只可有界复用。不存在当前版本 Native PASS 证明，不给出 95/100 的虚构评分。

## Mac 验收待办

使用独占 Chrome for Testing/Profile，绑定 main SHA、构建目录、manifest、扩展 ID 和截图元数据；核对旧 v1.0.0→v1.1.1 升级与中断恢复、双窗口冲突、限额/错误、真实受限页面及导航、展开/收起、320/360/400/600px 与 125%/200%、独立标签页、工具权限/撤销和 Task v1。按 `docs/framework/testing-guide.md` 保留原始结果并明确失败与 NOT_TESTED，完成才单独评分。
