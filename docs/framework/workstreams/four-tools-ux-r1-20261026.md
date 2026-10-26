# OpenDesk Browser · 四个官方扩展 UI R1.0 — 交付审计（2026-10-26）

## 产品目标、范围与源码所有权

目标：`markdown-workbench`、`web-markdown-clipper`、`knowledge-inbox`、`ai-knowledge-answers` 在现有工具宿主下具备一致、紧凑、无冗余的正式页面；保留已有存储、权限、业务行为和升级通道。仅修改四个扩展的既有 `src/`、现有 README、唯一正式预览生成器及定向测试。不新增 SDK、Host、数据库、AI Provider、应用商店或全局设计框架。

原始核查基线：`main@092989f978d025f03eae629f8d14bc65982eda27`。所有源文件更新均在 GitHub 提交前按最新单文件 blob SHA 进行条件写入（正常提交、无分支/强推）。其他对话可继续提交到 `main`；本文件不可作为永远不变的 HEAD 声明。

## 增量完成与未完成

| 产品 | 已修改正式源码 | 业务和数据保护 | 未完成/待验 |
| --- | --- | --- | --- |
| Markdown 工作台 | `src/index.html`、`src/style.css`、`src/main.js` | 宿主负责名称；共享 od 控件；编辑/预览选择限定为模式按钮；清空确认；下载回执不冒充永久保存；安全文本预览保留 | 本地构建、导入→保存文件→导回真实验证，Chrome 包更新、视觉矩阵 |
| 网页剪藏 | `src/index.html`、`src/style.css`、`src/notes.js` | 摘录、存储、授权、来源/读回/Markdown 备份/旧数据不变；右键说明和备份次级收起 | 本地正式 Chrome 网页剪藏、权限撤回/恢复，保存编辑搜索备份及 UI 矩阵 |
| 知识收件箱 | `src/index.html`、`src/style.css`、`src/main.js` | 分类/标签/排序折叠，技术空间进管理；保留 `knowledge.*`、草稿/归档/导出 | 完整迁移到共享设计 Skin 未完成（已有 Scoped CSS 仍使用 `--ki-*`）；Chrome 数据升级、真实保存和高缩放 |
| AI 知识问答 | `src/index.html`、`src/main.js` | 查询 UI 不叫“测试”；仅显示知识标题作为来源而非底层 UUID；固定答案、候选、未命中、人审边界不变；不重写自动客服 Runtime | 真正业务知识库在 Chrome 运行/旧数据升级；本轮变更后的完整 Native 验收；AI Provider/自动发送不在本轮 |

其他修改：四份 README 更新、`tests/environment/ai-knowledge-answers-ui-r2.test.mjs` 按新来源 UI 合同修复旧测试，以及新增 `tests/environment/four-tools-ux-r1.test.mjs`。

## 正式同源预览：唯一生成器

生产来源：`scripts/preview/build-preview.mjs` 加载 `scripts/build-sidebar-tool.mjs` 编译后的**真实** HTML/CSS/JS、生产 Shared UI 和真实 React Side Panel 外壳；SDK 边界在 iframe 内由隔离 Mock 接管；所有预览均有 `mock:true`、`installed:false`、`permissionsGranted:false` 和 `sourceCommit`、`designSha256`、`uiSha256`、`shellSha256`。没有第二套 UI 渲染框架。

Mock 来源：

- Markdown：`scripts/preview/markdown-workbench-mock.js`（复制、下载）
- 网页剪藏：直接复用 `examples/sidebar-tools/web-markdown-clipper/preview/mock-host.js`，叠加 `scripts/preview/web-markdown-clipper-scenario-mock.js` 用于错误和空态；模拟不会访问当前真实页面
- 知识收件箱：`scripts/preview/knowledge-inbox-mock.js`（仅内存中的 `knowledge.*` 与剪贴板）
- AI 知识问答：`scripts/preview/ai-knowledge-answers-mock.js`（仅内存中的存储、导出与复制）

### 本地重建四份正式预览

在完整 Git 工作副本、依赖安装完毕的项目根目录运行（只写入被忽略的预览输出目录）：

```sh
npm ci
for tool in markdown-workbench web-markdown-clipper knowledge-inbox ai-knowledge-answers; do
  node scripts/preview/build-preview.mjs --tool "$tool" --surface side-panel --scenario success --theme light --width 360
done
```

输出：`artifacts/previews/<tool-id>/side-panel-success-light-360.html` 与 `.context.json`。按同一命令分别用 320/360/400/440，dark，以及 empty/error/loading/permission-denied/untrusted 进行矩阵检查。上述命令为**待执行验收步骤**，不是本轮运行已通过的证据。

现有 `web-markdown-clipper/preview/index.html`、`knowledge-inbox/preview/index.html`、`ai-knowledge-answers/preview/index.html` 属于先前独立的专项预览，均保留，不被重画覆盖。

当前聊天产生的四个 `CHAT_ADAPTER_NOT_SOURCE_HTML` HTML 是在对话容器中临时生成的**独立体验替身**。已用容器 Chromium `page.set_content()` 检查页面脚本、基本操作和宽度切换，绝不能把它们误作上述正式源码预览或 Mac Chrome 安装/存储验收。

## 验收标准与真实状态

- `PASS`：GitHub 内容 API 经 blob SHA 检查后，源码、预览适配代码、定向测试和 README 正常提交到 `main`。
- `PASS（仅聊天适配层）`：四份非源码 HTML 经容器 Chromium 基本交互烟测；对正式产品**无证据替代效力**。
- `NOT_TESTED`：仓库本地 Node 测试、包编译/晋升、四份真实 SOURCE-BOUND HTML 生成和浏览器渲染、真实数据/旧版本升级、Mac Chrome Native、主题/200%/无障碍矩阵。
- `NOT_TESTED`：本轮对应的 GitHub Actions 工作流若为 queued/pending，不能声称 CI PASS。
- 质量评分：功能、视觉、易用性、反馈、响应式/无障碍、安全、维护性、可验证性八个维度均以 ≥95 为**目标**，目前没有足够执行证据作实际量化评分。各产品综合均值、整体均值暂记 `N/A（不能计算）`；禁止填入编造的 95/96 分。

## 本地 Codex 唯一下一步：测试、修复与验收，不重复重写

在实际 `main` 工作副本先 `git pull --ff-only`，对四个工具运行原有与新增测试，执行统一同源预览生成；任何 FAIL 优先就地修复且不动其他对话的新改动。通过原正式打包、发行晋升及按版本审阅的安装更新，逐个核对旧用户数据/权限。再于 Mac Chrome Native 按本文件四个业务闭环及 320/360/400/440、200%、浅/深、空/错误/权限/未知回执矩阵验证，记录每步命令、截图、版本、提交、包摘要及 PASS/FAIL/BLOCKED/NOT_TESTED。确有真实证据后再逐维独立打分及计算平均，不在缺证据时抬分。
