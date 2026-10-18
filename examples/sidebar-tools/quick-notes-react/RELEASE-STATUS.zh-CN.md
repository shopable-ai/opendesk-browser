# Quick Notes React 独立发布证据与阻断记录

> 状态快照：2026-10-19（Asia/Tokyo）。本文件是工程验收记录，不是安装成功声明；状态必须以对应 Commit 的 GitHub Actions 结果为准。

## 产品边界

- 独立身份：`quick-notes-react`，正式目标包为本目录 `quick-notes-react.opendesk-tool.json`。
- 原生 `../quick-notes/` 身份为 `quick-notes`；不可改其源码、覆盖其安装或读取现存用户数据。
- Quick Notes React 的 App、Model、CSS 均由本目录维护；只通过 `OpenDeskTool.request` 调用既有 Host；React Runtime 与 `@opendesk/ui` 是宿主已有的通用资源。
- 静态测试扫描框架 `src/` 中的业务源码 import，禁止 Quick Notes React 业务进入主框架。
- 仅在隔离测试 Profile 内，通过真实安装界面构造两版本测试数据和检查工具 ID 命名空间。

## 当前可证实结果

| 项目 | 证据状态 | 依据 |
| --- | --- | --- |
| 原生/React 工具 ID、权限和 Runtime 声明 | SOURCE_PASS | `tool.config.json` 和已有纯模型测试 |
| 源码业务归属、框架不能 import App/Model | SOURCE_PASS | `sidebar-quick-notes-react-r21.test.mjs`；最新运行单元测试通过 |
| React 编译、打包和 CSS Hash 回执 | 历史 CI PASS；**最新 main NOT_TESTED** | 新的共享宿主构建提前失败，不可复用过期 Hash |
| 真正 Chrome Host 双安装与存储隔离 | NOT_TESTED | 新版验收脚本尚未到达这一阶段 |
| React 编辑、删除、停用、恢复与卸载 | NOT_TESTED | 已添加真实宿主 E2E 操作及持久化读回断言，等待执行 |
| 同 ID 更新、数据保留 | NOT_TESTED | E2E 使用相同正式编译代码的受控版本测试夹具；仅证明真实 Host 更新机制，不代表历史版本发布 |
| Mac Chrome 原生 Side Panel | NOT_TESTED | 无法从本次远程环境操作用户的 Mac |
| 正式安装包及其 SHA256 | NOT_RELEASED / NOT_AVAILABLE | 必须在通过全部必要门禁后生成；不能采用以前 Commit 的候选字节 |

### 最新真实 CI 失败

- [Quick Notes React #39145335153](https://github.com/shopable-ai/opendesk-browser/actions/runs/39145335153)：单元测试 `# fail 0`；`npm run build:dev` 因共享宿主可信源码校验失败而停止。
- 具体信息：`[opendesk-fixed-page-relay] Trusted Prompt Shortcuts source changed; review and re-pin before fixed build: examples/sidebar-tools/prompt-shortcuts/trusted/page.js`。
- 分类：**BLOCKED_BY_SHARED_HOST_BUILD（Prompt Shortcuts 固定源码准入）**。不要修改 Prompt Shortcuts 或删除安全哈希校验来使 Quick Notes 测试通过。
- 较早的 [#39141995126](https://github.com/shopable-ai/opendesk-browser/actions/runs/39141995126) 在真正安装之前等待旧的 Extension Center 状态文本；已修复该不正确的前置断言，但共享宿主构建尚未恢复，无法判断新的 Host 安装结果。
- 单元测试 PASS 不等于真实安装 PASS；预览适配器结果不得算正式 Host 验收。

## 独立安装验证门禁

1. 在真实 `main` 清洁代码上执行 `npm ci --ignore-scripts`、`node --test tests/environment/sidebar-quick-notes.test.mjs tests/environment/sidebar-quick-notes-react-r21.test.mjs`。
2. 构建既有宿主（`npm run build:dev`），若可信固定源码改变，交由相关负责工作流恢复；**禁止 Quick Notes 私自重针或关掉校验**。
3. 运行 `npm run build --prefix examples/sidebar-tools/quick-notes-react`，对照 `dist/build-ready.json` 中的 `dist/tool.js`、`dist/tool.css` 字节与 SHA256。
4. 由既有打包器生成候选：`node scripts/build-sidebar-tool.mjs examples/sidebar-tools/quick-notes-react --out artifacts/sidebar-tools/quick-notes-react/react-candidate.opendesk-tool.json`，记录 `shasum -a 256 artifacts/sidebar-tools/quick-notes-react/react-candidate.opendesk-tool.json`。
5. 在隔离 Chrome Profile 加载真实 MV3 Host，运行 `node scripts/tests/quick-notes-react-r21-installed-chrome.mjs`，检查其 `result.json`：`status=PASS`、`simulatedSDK=false`、`dataIsolation=PASS`，并核对 `REAL_HOST_UPDATE_REACT`、`REAL_SDK_EDIT_REACT`、`REAL_SDK_DELETE_REACT`、`REAL_HOST_DISABLE_REACT`、`REAL_HOST_REENABLE_REACT`、`REAL_HOST_UNINSTALL_REACT`、`NATIVE_PACKAGE_AND_DATA_UNCHANGED` 等操作回执。
6. 仅通过完整 CI 门禁后执行 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/quick-notes-react --promote-from artifacts/sidebar-tools/quick-notes-react/react-candidate.opendesk-tool.json`，再执行 `--check-project`，记录正式包 SHA256 和 CI URL。
7. 真实 Mac Chrome Side Panel 安装、浏览器重启、200% 缩放及真人操作继续单独验收；未做即明确 `NOT_TESTED`，不补假证据。

**发布纪律**：截至本快照，没有资格把候选包称作“可安装产品最终交付”。框架问题归框架工作流，Quick Notes 仅负责自己的安装包、业务和验证脚本。
