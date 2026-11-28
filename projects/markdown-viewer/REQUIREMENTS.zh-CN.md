# R1 产品需求与技术验收

## 原始目标

AI 持续写入本地 Markdown → 浏览器原地址自动读取最新内容 → HTML 阅读，保持当前章节和阅读位置。不是 Markdown 编辑器、批量转 HTML 或 Web 服务。

用户验收目标：file:///Users/a0000/Documents/workspace_ai/av-video/docs/h5-backend-qa-matrix.md

## 源码研究与决策

| 项目 | 已核对的代码 | 结论 |
| --- | --- | --- |
| simov/markdown-viewer（MIT） | content/autoreload.js、background/xhr.js、background/inject.js、content/scroll.js | 已有 file:// 后台读取、时间戳破缓存、文本比较、原页渲染、滚动恢复。采用架构；改进异常继续轮询、空文件和阅读锚点。 |
| volca/markdown-preview（MIT） | js/background.js、js/markdownify.js | 已有后台 fetch 与正文解析、定时刷新。其旧净化器及自由 URL 读取边界不直接复用。 |
| markedjs/marked（MIT） | 17.0.6 UMD 解析器及 lexer 接口、许可 | 复用成熟 GFM token 解析，使用 DOM 节点白名单构造而非注入解析出的 HTML。 |
| PrismJS/prism（MIT） | 1.30.0 core 与选定语言 grammar | 复用本地代码分词，不自动运行、无远程语言下载。 |
| markdown-it / DOMPurify / Mermaid | 仓库结构及用途调研 | markdown-it 也是候选；本轮不引入 HTML 注入路径，故不使用 DOMPurify；Mermaid 后续独立安全评估。未声称全面源码审计。 |

源码链接：https://github.com/simov/markdown-viewer/tree/master/content 、https://github.com/simov/markdown-viewer/tree/master/background 、https://github.com/volca/markdown-preview/tree/master/js 、https://github.com/markedjs/marked 、https://github.com/PrismJS/prism 。准确第三方版本、来源与许可见 src/vendor/THIRD-PARTY-NOTICES.txt。

方案试评（同一助手按适配度、交付风险、可靠性、安全各 25 分，非实测专家认证）：完整 Fork 22/18/20/19=79；自研全部解析和更新 22/15/17/20=74；成熟 parser/tokenizer + 专用 reader + 后台原文件轮询 24/22/22/23=91；本地 Web Server 13/19/23/20=75。选择第三项，因可复用解析能力并保留原地址、无需附加进程。真实浏览器仍为阻断性验证。

已有 OpenDesk Markdown Workbench 解决手工编辑，Reading TOC 采用面向既有网页 DOM 的身份与生命周期逻辑。此处正文由同一 Markdown 版本重建，复用章节索引与导航思想，不直接混用编辑器或网页适配器。采用现有固定入口、SW 消息分发、构建和许可校验，不增加第三方主机权限。样式局部隔离，避免注入全局可信扩展页面 CSS。

## 架构与范围

- file:// 主框架 isolated 内容入口，仅本地 .md/.markdown、text/plain 或 text/(x-)markdown，且存在浏览器原生文本 pre 才挂载；不接管真实 HTML。
- 读取协议只接受当前 sender 文档的路径，无调用者传入目标地址。验证扩展 ID、frameId、tabId、documentId、文件授权、活动文档，读取前后重新核验。
- fetch no-store、时间戳查询参数仅用于实际读取，不改变浏览器地址；单次 6 秒超时、4 MiB 流式上限。1 秒间隔；一次仅一个读请求；隐藏页暂停，切回立即检查。
- 文本内容逐字比较；新渲染成功后才提交新版本。读取失败、原子替换、删除恢复按重复读取处理。保留旧正文及错误状态。
- 由 Marked lexer 生成 tokens，以 DOM API 组装限定的元素。原始 HTML、未知 token 以文本显示；阻断脚本协议、data URL、网络共享路径。默认仅本地图片，避免远程图片泄露私有文档上下文；显式点击 HTTP(S) 链接正常导航。
- 阅读锚点优先稳定内容块指纹，再章节，再像素；图片异步布局调整仅在用户未主动操作时恢复。
- P0：本地渲染、实时更新、目录、代码/表格/任务列表、原文、本地相对链接与图片、授权引导、异常恢复。P1 本轮附带主题与阅读宽度；Mermaid、全文搜索仍未实现。P2 段落修改标记、Diff、历史、项目文档树不纳入本轮。
- 当前边界：最多 4 MiB UTF-8 文件；非支持 MIME 不接管；远程图片默认不载入，原始 HTML 不执行；代码超过 32 KiB 的单块保留原文而不分词。Windows UNC 网络共享不是本地文件范围。没有向文件系统写入任何功能。
- UI 支持简体中文、繁体中文、英语、日语；扩展选项页权限提示为中英双语。未接入全局 locale 选择器，采用浏览器语言；主题/宽度保存在扩展本地配置，不保存文档内容。

## 验收状态（2026-11-28）

Node 22 核心测试 5/5 PASS。隔离 JavaScript 21 项断言、成熟解析/分词 3 项检查通过；该环境的 Chromium 本地导航被策略拒绝 ERR_BLOCKED_BY_ADMINISTRATOR。未执行完整构建、jsdom、真实浏览器脚本，未访问用户机器文件。下列所有浏览器验收项保持 NOT_TESTED；单元覆盖仅作为补充证据。

| ID | 必须在真实扩展中通过 | 补充证据 |
| --- | --- | --- |
| T01 | 打开 MD 自动渲染且原地址保留 | token/DOM double |
| T02 | 前台外部保存后目标 2 秒内更新 | 轮询单元 |
| T03 | 连续保存最终最新文本 | 轮询单元 |
| T04 | 不变不重复渲染 | 轮询单元 |
| T05 | 长文保持章节 | 算法已实现 |
| T06 | 上方插入不跳动，建议锚点误差 ≤24px | 算法已实现 |
| T07 | 相对 MD 链接打开后自动渲染 | URL 单元 |
| T08 | 本地相对图片实际加载 | URL 单元 |
| T09 | 中英文及空格编码路径 | URL 单元 |
| T10 | GFM 表格显示、横向滚动 | token/DOM double |
| T11 | 代码正确高亮与真实剪贴板复制 | 分词检查 |
| T12 | TOC 生成、高亮、跳转 | DOM double |
| T13 | 原文显示最新内容 | 代码已实现 |
| T14 | 关闭更新停止且不接受迟到响应 | 轮询单元 |
| T15 | 开启更新立即获取 | 轮询单元 |
| T16 | 文件授权关闭提示、开启后正常 | sender/permission 单元 |
| T17 | 后台保存切回立即检查 | 可见性单元 |
| T18 | 原子替换文件后更新 | 需要真文件 |
| T19 | 删除保留旧内容，恢复自动更新 | 错误恢复单元 |
| T20 | 恶意 HTML/URL 不执行或外传 | DOM double/URL 单元 |
| T21 | 多标签互不干扰 | 需要浏览器 |
| T22 | 大文档 ≤4 MiB，无明显卡顿/重复重绘 | 文件大小单元 |
| T23 | 扩展禁用后原生文件访问恢复 | 需禁用后重新加载 |

真实浏览器验收采用临时文件，不修改用户真实文档；原文件打开与外部保存证据单独记录。记录浏览器/系统版本、扩展构建路径、权限、提交 SHA、各场景耗时和截图。

## 评分与后续门槛

当前为同一助手的角色化保守试评，非八位独立专家认证。产品 94/86，浏览器 90/70，前端 92/82，文件更新 93/81，UI/UX 88/74，安全 94/86，测试 89/68，反方审计 90/67（设计/实现各 100 分）。设计均值 91.25，实现均值 76.75，真实浏览器验收 NOT_TESTED。未达到 95 分目标；完整构建及两种浏览器通过 T01–T23 后再基于真实证据评分，不能仅因代码提交提升分数。
