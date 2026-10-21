# AI 工作产物交付 R1.1-WEB — 2026-10-20 启动 / 2026-10-21 归档

> 状态：`RESEARCH_DOCUMENTED / SOURCE_BOUND_MOCK_PREVIEW / NOT_PAID_VALIDATED / PRODUCT_IMPLEMENTATION_NOT_APPROVED`。
> 本记录只覆盖本任务。**未修改正式 Knowledge Inbox 业务源码**，等待用户确认 R1.1 同源预览后才允许 R1.2 正式产品开发。

## 1. 最新源码与分支

- 本轮开始读取的 GitHub main：`ebc414140f6dceffd3b38608f6c3c21d561ebc95`。
- 上轮给出的 `a9750e5208ad15b612064661325df3257f19d446` 已不是任务启动时的最新 HEAD。
- 仅使用现有 `main`；不新建分支/Worktree/PR；不强推、不重写原 84 OPP / 8 EXP；EXP-005 继续是卖家 Listing QA。
- 提交结果的 SHA 见 GitHub main 上本工作记录所在提交；不在本文件写入自己的 commit SHA 以免循环修改造成漂移。

## 2. 实际交付范围（拟由同一原子提交写入）

| 文件 | 此轮变化 | 证据级别 |
| --- | --- | --- |
| `docs/product/browser-extension-ecosystem/ai-artifact-delivery-r1.zh-CN.md` | 商业研究增量：24 候选与旧 OPP 映射，TOP10 七维独立假设与权重，竞品官网/价目/核查日，TOP3 与 SKU MVP、STOP/PIVOT | `RESEARCH_ONLY` |
| `docs/architecture/browser-framework/ai-artifact-delivery-r1.zh-CN.md` | 对真实源码 Owner、下载开始/完成、图片原图真实性、权限、数据结构及 Native 边界作 8 项审计；R1.2 文件/测试归属 | `SOURCE_AUDITED` |
| `examples/sidebar-tools/knowledge-inbox/preview/index.html` | 真正加载正式 `src/index.html`、`src/style.css`、`src/main.js`；只新增自包含图片场景和 `knowledge.*` MOCK Host | `MOCK_SOURCE_BOUND` |
| `docs/framework/workstreams/ai-artifact-delivery-r1-20261020.md` | 此工作记录、证据和后续开发边界 | `DOCUMENTED` |

**显式未改**：`examples/sidebar-tools/knowledge-inbox/src/*`、`src/knowledge/*`、`src/framework/sdk/*`、`src/platform/chrome/browser-downloads.js`、`src/native-agent/*`、Prompt Shortcuts 与 Web Markdown Clipper。

## 3. 同源预览证明、入口和体验模型

唯一预览文件：

`examples/sidebar-tools/knowledge-inbox/preview/index.html`

- **正式 CSS**：相对路径 `../src/style.css` 以 `<link>` 加载。
- **正式 UI**：`fetch('../src/index.html')` 后挂载到 `#pf-official-root`。
- **正式行为**：`../src/main.js` 作为运行时脚本执行。此脚本仍通过 `OpenDeskTool.root/request` 操作，预览只模拟 Host 的 `knowledge.list/get/create/update/remove/download/backup/workspace/openSource/editorState` 响应。
- **预览 Fixture 限定**：左侧 ChatGPT 图示、保存图片按钮、SKU/用途/编号/标签/人工提示词、下载成功/中断/未知/URL失效/缩略图、业务幂等去重和 `sessionStorage` 仅用于演示，**不对应真实 Chrome 下载、Native 写盘、网站原图或正式持久存储**。
- **不能复制旧收件箱 UI**：原列表/搜索/标签/排序/新建/编辑/Markdown/More/来源/复制/工作区/确认弹层/键盘均由上述正式文件负责；如果正式源加载失败会显示错误，不回退自造列表。
- **公开预览入口**（需 HTTP 服务器，禁止以 `file://` 直接打开）：
  - 仓库路径：`https://github.com/shopable-ai/opendesk-browser/blob/main/examples/sidebar-tools/knowledge-inbox/preview/index.html`（源码入口，不等于运行页面）。
  - 可尝试 HTML 网页服务：`https://raw.githack.com/shopable-ai/opendesk-browser/main/examples/sidebar-tools/knowledge-inbox/preview/index.html`（第三方只读 CDN，**未完成浏览器打开核验前不得称已可打开**）。
  - 在已克隆仓库根目录执行 `python3 -m http.server 8765`，打开 `http://127.0.0.1:8765/examples/sidebar-tools/knowledge-inbox/preview/index.html`（本地操作说明，不属于本轮 Mac 验收）。
- 预览控件包含 320/360/400/440 和 800 CSS px、深浅主题、模拟 200% zoom、键盘 Esc/焦点、状态 ARIA；实际截图、不同内核的布局、真实系统高 DPI/200% 缩放仍需浏览器核验。

## 4. 已实施的最小静态校验与严格证据分级

| 检查 | 本阶段观察结果 | 状态 |
| --- | --- | --- |
| GitHub main 基线、原 Knowledge HTML/CSS/JS、Knowledge model/service/page 和 scoped download Host 逐文件读取 | 已完成，可复现到上方路径及基线 SHA | `PASS`（只读源码审计） |
| 预览 HTML 入口引用原正式三个源码文件 | 逐字搜索证实以上三个相对路径均存在 | `PASS`（静态） |
| 预览脚本语法 | 对预览内脚本执行 JavaScript 语法编译（未执行浏览器 DOM） | `PASS`（语法） |
| 完整尺寸与故障情景存在性 | 包含 320/360/400/440/800 与 complete/interrupted/unknown/expired/thumbnail；仅源字串检查 | `PASS`（静态） |
| 原版 Knowledge Inbox 在网页浏览器真实挂载和交互 | 需要静态资源 HTTP 服务器、实际浏览器点击 | `NOT_TESTED` |
| R1.1 图片保存、复用记录、查找 SKU 的浏览器级 Fixture | 已编写模拟逻辑，未执行 Chromium 点击断言；不可冒称 MOCK_PASS | `NOT_TESTED`（浏览器）；`MOCK` 为设计属性 |
| 320/360/400/440/宽屏/深浅/200%、ARIA/焦点截图 | 尚无该候选的真实截图和自动化截图证据 | `NOT_TESTED` |
| Node 全量、生产/开发构建、官方包、Mac 原生 Chrome | 此轮仅新增文档与预览，尚未具备本地 checkout 运行证据 | `NOT_TESTED` |
| 下载真正落盘、Chrome complete、失效源、Native 授权文件写入 | 本轮预览专门不执行实际副作用 | `NOT_TESTED` |
| GitHub 安全提交 main | 需以提交后 main HEAD 和 GitHub Tree 验证为准 | **提交结果单独报告** |

**已知阻断**：没有连接到运行本代码的真实浏览器/本地 Chrome 环境，无法提交可见 UI 截图或 Chromium 回归结论。不能把 static PASS、MOCK Fixture 或 GitHub 文件存在当作原生交付 PASS。

## 5. Mac Chrome 真实验收清单（明确留到 R1.2 正式源码或获授权后执行）

1. 授权且已安装原 Knowledge Inbox，ChatGPT 来源 document/sender 身份正确；SPA 导航、流式回答、图片绘制和撤权时按钮不残留。
2. 原 Knowledge Inbox 新建/编辑/Markdown/菜单/来源/下载/Workspace/返回/未保存对话全部可用；旧用户数据不丢。
3. 原图、缩略图及 CDN 临时 URL 确认；MIME 与实际文件格式匹配；测试 PNG/JPEG/WebP 的正确扩展名而非强制 PNG。
4. SKU/用途/编号/标签输入、规范文件名、特殊字符、目录穿越、多张图、重复点击、最大容量、不同会话同 SKU 的结果。
5. `started`、`in_progress`、`complete`、`interrupted`、`E_OUTCOME_UNKNOWN`、Network 断开、Worker 重启、授权撤销和安装更新；未知不自动重试。
6. 保存后关闭再开，SKU 搜索、详情、来源/人工确认提示词、下载状态复读（只证明记录存在，不保证磁盘文件永远可找）。
7. 320/360/400/440px 与宽屏、深浅主题、200% 真缩放、键盘 Tab/Escape/ARIA 状态、无横向溢出/焦点失联；需真实截图。
8. 不自动上传 ChatGPT 私人素材、不静默写 Native 任意目录、不自动发送 ChatGPT 消息。

## 6. R1.2 正式实施的批准边界

**P0：获得用户针对同源预览的确认。** 当前用户仅授权文档与预览，不把此任务扩大为正式产品迁移。

后续依次：
- P1：新增 ChatGPT 图片旁可信保存 UI（`src/knowledge/page.js`）、图片来源验证与安全文件命名；先做来源/MIME/缩略图门禁。
- P2：由已有 `src/knowledge/service.js`、`model.js`、`policy.js` 以相同锁、单一存储 owner 实现 SKU 交付状态与幂等；复用 scoped downloads API / getOwned 状态。
- P3：在原 Knowledge Inbox 源 UI 加入必要搜索显示、详情和失败恢复，保障文本知识操作 100% 保留；不要引入 React/第二套列表/SDK。
- P4：定向知识存储、授权、下载状态、恢复与 UI 回归；打包按仓库现有流程，真实 Mac Chrome 后续单独验收。

## 7. 六维独立评审（阶段内人工先验，不是合格证）

| 维度 | 暂评（满分100） | 主要依据 / 扣分 |
| --- | ---: | --- |
| 商业判断 | 73 | 明确用户工作、免费替代、STOP；没有访谈、真实报价、付款人 |
| UX / 同源交互 | 75 | 维持正式 UI + 可操作源码 Fixture；没有真实浏览器截图、跨宽度键盘与焦点回归 |
| 技术可行性 | 81 | Scoped downloads 状态查询和可信 Knowledge 服务可复用；原图/MIME/跨重启状态仍缺 |
| 架构复用 | 90 | 无第二 Host/存储/UI 列表，新代码只有模拟桥与文档；真实融合仍需代码审查 |
| 竞品证据 | 77 | 有 9 项官网出处及公开价目/待核验，未验证真实支付、地区价与直接功能对比 |
| 实施可操作性 | 84 | 文件 owner、状态机、风险与测试边界明确；正式下载落盘与跨工具交接未实测 |
| **算术平均** | **80.0** | 73+75+81+90+77+84=480，除 6；**不是 UX 95+ 或商业验证通过** |

计划状态 `PREVIEW_PENDING_USER_CONFIRMATION`。六维评审不可替代任何 P0 安全硬门槛；下一轮目标是先取得真正同源可操作预览及用户意见，再按源码 owner 逐段落地。