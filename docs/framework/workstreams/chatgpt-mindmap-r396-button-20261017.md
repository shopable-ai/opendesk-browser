# ChatGPT Mind Map R3.9.6：真实回复按钮续接

负责人：本对话 Codex；2026-10-17，本地 Mac，main。

目标：在独立 CFT/Profile 的新 ChatGPT 测试会话中，验证真实回复的“思维导图”按钮及真实点击流程。测试内容为周末城市公园活动计划，包含准备、路线、活动、收尾和中文、English、数字、链接及三级列表。缺少厂商引擎时准确提示并保留原文。

写入范围：`examples/programs/chatgpt-mindmap/src/chatgpt-adapter.js`、`src/answer-registry.js`、对应业务定向测试、README/本记录及本任务专属原始证据。按实际复现最小修改。框架 src 默认只读；既有未提交框架补丁不重建、不覆盖。

交接历史身份：HEAD `8530dcefc93fb259474ebeb75ddc2f3dac15ba4b`；origin/main `2d02020c6b84792f2e160b2b440a5457e8ce0e11`，不是本轮最终观察值。本轮提交前只读复核：main HEAD 与 origin/main 均为 `abf341448244c9682d21dc2bace2d4d835b9c081`；共享索引为空。保留所有其他任务未提交改动。禁止分支/worktree/PR/推送/reset/clean；提交仅指定本任务路径并复核索引。

资源：沿用 `artifacts/chatgpt-mindmap-r396-mac-20261017/loader/build-snapshot/dist/production` 独立静态 production 候选，packageHash `dd540e77a55c82375d55633f6f4ad723963c1dee3de2e9b6aad596df36afbe9b`；专属 `.runtime/mindmap-r396-cft/Google Chrome for Testing.app`，由 chrome-testing-keychain 启动新临时 Profile/mock keychain。仅本任务持有启动器进程及 Profile。日常 `dist/development`、已有 npm run dev watcher 不变；不启动第二 writer。

证据复用：读取 `HANDOFF-button-first-20261017.txt` 与 testing-guide。通用 loader 样例、已排除 Blob、injectImmediately 及 CSP 修复不重测全链。仅验证受影响业务步骤；组件、业务原生、正式安装分开报告。

授权与边界：本程序是 ChatGPT 顶层 USER_SCRIPT Page Program，业务留在 examples/programs。只用现有开发/预览产品入口及真实原生输入；不注入临时扩展、不操作私人对话、不伪造事件/ack。许可缺口沿用交接，禁止加入未授权生产厂商资源、改批准字段、换引擎或提升 installable。

状态：真实 ChatGPT 回复按钮与原生点击的公开开发预览 PASS；真实 XMind 转换 BLOCKED；正式安装 NOT_TESTED，仍 BUILT_UNVERIFIED / installable:false。

## 实际结果

- 匿名新测试会话 `https://chatgpt.com/uc/6ad32e2e-9f18-83ea-9a63-a4239817efc7`，最后回复 `b534544a-c6d2-4ff3-b7ca-0d0555df90ab`。真实二级标题为准备、路线、活动、收尾；实际 DOM 存在 `ul ul ul`，含中文、English、数字和链接。三条实际回复各一个按钮，位于原操作栏旁；原生点击最终符合内容要求的回复按钮。
- 当前网站 DOM 使用 `li[data-message-role="assistant"]`、`[data-assistant-markdown-root]`、`[data-assistant-message-actions]`、`button[data-copy-message]`；补充这些选择器、流式完成标记与回复 id 身份。未更换引擎。
- 点击实际得到 `E_FRAME_UNAVAILABLE`，显示当前预览无授权 XMind 固定资源入口。原回复同一节点，完整 HTML SHA 相同，恢复后无额外空 style/aria-hidden、无查看器残留。不能将这次开发预览当作安装或转换成功。
- 同一最终无厂商构建 59828 B / `1b63ecc6852b00d720a60b20d815b3f724dc6e9843fea5ef2f6dd8c92633661d`。原生复制仅去末尾 LF，实际预览 59827 B / `6d38b46880a370fd18055eb5baf36cf0daf14dff1b46ac56791be4a45e6e7d78`，与真实 document/world/receiptNonce/sourceHash 回执一致。
- 真实 OpenDesk ID `ghphiepbcmidcbmaeaioolbjgjnbeoma`，CFT `155.0.8059.39`，加载路径与 packageHash 同上。14 个平台输入和当前候选快照逐字节相同。日常开发 watcher 保留。

## 验证与原始证据

`artifacts/chatgpt-mindmap-r396-mac-20261017/button-native/evidence-manifest.json` 保存 16 项原始文件的 SHA 与路径；可跟踪机器索引为 `examples/programs/chatgpt-mindmap/tests/mac-button-r396-20261017.json`。真实截图、回复 DOM、点击前后、原生预览技术回执、构建与加载包身份均分别保存。前序失败及旧 receipt 未覆盖。

受影响业务组合测试 50 项：47 PASS、0 FAIL、3 SKIP（真实 SDK 目录未提供，不能提升为 SDK PASS）；定向 adapter/registry/installed-frame 13 PASS。两个业务 JS 的 node --check、项目 validate 与 diff --check PASS。根目录 webpack 安装不完整，初次构建失败保留；改用字节一致的既有独立快照打包器构建同一业务，未安装依赖、未运行新的扩展全量 build。复用前序相同输入的框架测试和已冻结包，不重跑通用样例或扩充矩阵。

## 本地保存范围

为避免只提交业务 main 却遗漏其已完成依赖，本地保存交接中既有的固定资源合同、Broker/Authority 精确准入及受管清理补丁；本轮未重建或另写平台实现。源码范围：

- `src/scripting/user-scripts/{page-ui,page-frame-resources,page-frame-runtime,page-bundle,preview,preview-worlds,installed-programs}.js`
- `src/libs/page-frameworks/{page-ui-helper-r243,contract}.js`
- `src/platform/host/preview-admission.js`、`src/ui/program-source.js`
- `scripts/{build-program-project,validate-program-project}.mjs`、`schemas/opendesk-program-project.v1.schema.json`
- `examples/programs/chatgpt-mindmap/src/{main,xmind-installed-frame,chatgpt-adapter,answer-registry}.js`
- 对应 `tests/environment/page-{frame-resources,frame-runtime,frame-admission,installed-managed-lifecycle,installed-programs}.test.mjs`，`tests/environment/chatgpt-mindmap-r1.test.mjs` 及业务 adapter/registry/installed-frame 测试。
- 本任务 README、公开 Page 文档、本记录、机器索引；保留交接已有 R396 许可审计入口、测试、22 份材料索引和新增参考材料及原始旧验收文档。许可批准字段未改；未重新搜索许可。

不包含广告拦截、快捷提示词、`scripts/bundle-provenance.mjs` 的他人补丁；共享索引/HEAD 写入串行，仅指定任务路径，不推送。未使用的 `xmind-installed-child.js` 与通用原生驱动保持原有工作区状态，不作为转换可用证据。

## 精确阻塞

当前公开开发预览没有授权的 XMind 固定资源入口；正式厂商资源仍缺 SDK 精确构建映射、Snowbrush 精确构建及再分发授权、GSAP 历史条款、内嵌 Pako 映射与完整 NOTICE 闭包。许可阻塞不能绕过，不能加入厂商 production 字节或改批准/installable。真实转换、导图交互及转换后原文恢复未完成；本轮仅证明资源缺失失败后的原文完整恢复。前序停用 messaging 修复虽在候选中，本轮未原生复验；正式安装、自动运行、停用、撤权/卸载不能登记 PASS。


证据保存后已关闭本任务 PID 56004 的专属 CFT，启动器正常退出并删除自己的临时 Profile；未关闭日常 Chrome 或其他会话 watcher。
