# OpenDesk Browser：细分赛道第一营销执行手册 R1

> 2026-10-13。与 [定位策略](global-first-positioning.zh-CN.md)、[时间化竞品账本](competitor-timeline.json)、[宣传声明审批台账](first-claims-ledger.json) 配套。**本手册为研究与拟定文案，并非对外宣传的审批结论；目前没有任何“全球首个/全球第一”声明获准。**
>
> 不替代代码正式交付、Chrome 原生验收、Chrome Web Store 政策审核或商业实验。必须跟随最新源码和真实发布包校正所能展示的功能。

## 1. 核心传播策略：先占类别，再证第一

首选新类别：**Browser-Native Website App Studio（浏览器原生网站工具开发环境）**，作为“网站脚本管理器”与“完整扩展开发框架”之间的中间产品形态：**在已安装的浏览器环境中，把网站工具开发、实际运行、受管 Stop 与后续安装管理串起来**。用户价值优先于功能名词。

三座小山头：
1. **F01 · Chrome Side Panel React JSX + Vue SFC 双框架组件开发/运行**：最接近现有 Developer Edition Chrome 验收切片；先做同版本竞争排他性审查。
2. **F02 · 已授权本地多文件项目 → 自动准备 → 一键运行到获准网页**：竞争价值是重复开发效率，而非“支持 React/多文件”首创。
3. **F07 · AI 协助制作 → 可信审核 → 固定版确定性任务 → 可靠执行**：战略远期；目前完整 AI 运行链尚有未实现/未验收环节，不能展示成已经正式交付。

支持 F01/F02 的技术质量主张 F04：依赖锁/源哈希/版本/Chrome 回执，但“最安全”需要严格独立测试。

## 2. 宣传声明分级与审批

| 级别 | 允许做什么 | 不能做什么 |
| --- | --- | --- |
| M0 当前一般性定位 | 提炼现有功能特色与具体已测试版本；客观解释 Studio 方案 | 全球首个、第一、最快、最安全、兼容所有脚本、官方正式发布 |
| M1 已证明具体流程 | 标注 Developer / Standard / Native，链接候选 SHA、Chrome 录像、限制和复现方法 | 把历史原生 PASS 泛化到新包或所有版本 |
| M2 日期限定的对照结果 | “在 YYYY-MM-DD 本测试集、指定三个竞品版本中，OpenDesk 在某指标领先”，提供原始数据 | 用局部测试替代无限制“全球第一” |
| M3 全球首个候选经完整审核 | 证实此前无同等产品，公开发行版本与法律/市场审批后可用严密限定的“首创”表述 | 自行缩小到不合理无市场价值的拼词赛道 |

发布前必须核对 first-claims-ledger.json 对应 claim ID 为 CLAIM_APPROVED；如不是，禁止发布 M3。任何新增世界第一说法先入账再审核，销售/客服/视频简介不能绕过。

## 3. 当前可以直接使用的中文与英文定位文案

### 中文官网 / GitHub 标题（不主张全球排名）

**OpenDesk Browser — 不只是运行用户脚本，更是在浏览器中开发工具。**

副标题：在同一个浏览器平台中，使用 JavaScript、React/Vue 及本地多文件项目编写网站工具，在用户授权的网页中运行、调试和管理。不同入口和版本具有不同前置条件。

推荐三个栏目：
- **从脚本到组件**：普通 JavaScript 草稿或 Developer Edition React JSX / Vue SFC 侧栏开发。
- **从文件到网页**：经用户授权的本地项目自动准备，在 Side Panel 主动 Run；需要本地 Native / Node。
- **从代码到可信运行**：说明网站授权、固定依赖和已验证的受管 Stop；完整版本分发与回滚按产品实际状态列示。

英文 Hero：
**Build Browser Apps, Not Just Userscripts.**
A browser-based workspace for JavaScript, React and Vue website tools — from explicit development and preview to permission-aware execution. Certain authoring paths require the Developer Edition or a paired local workspace.

短视频安全标题：
- “React/Vue 组件能直接改变真实网页吗？OpenDesk Developer Edition 实际演示”
- “在本地编辑多文件项目，回到浏览器明确点击 Run：开发流程实录”
- “为什么脚本停止不等于撤回网络请求？OpenDesk 的受管 UI 清理机制”

不要用“零安装、零依赖、任何网页、全部兼容、免费永久后台、AI 全自动发布”等混淆许可/前置条件的文案。

## 4. 有条件启用的“全球首个/全球第一”候选文案

| Claim ID | 对外候选中文标题（**仅批准后**） | 英文方向 | 首要阻断 |
| --- | --- | --- | --- |
| GF-001 | 全球首个面向 Chrome 侧栏的 React/Vue 双框架网页工具直编与受管运行环境 | World's First Chrome Side-Panel Studio for Managed React/Vue Website Tools | 排除全球相同编辑/运行工具、公开发行和同版实测 |
| GF-002 | 全球首个专注于多文件源码直达网页工具运行的低配置开发平台 | World's First Low-Setup Multi-File Website Tool Runtime | 与 Vite+Manager、WXT 同任务/成本对照 |
| GF-004 | 全球首个将源码/依赖锁、固定版本和浏览器运行回执整合的网站工具运行链 | World's First Verifiable Website Tool Runtime | 全链路及竞品安全功能差异验证 |
| GF-007 | 全球首个让 AI 编写、人工授权和确定性浏览器任务运行无缝衔接的平台 | World's First AI-to-Approved Deterministic Browser App Platform | AI 真实外部模型+权限+运行闭环尚未完 |
| GF-011 | 指定公开测试中开发网站工具最快的工作流 | Fastest in [dated, scoped benchmark] | 完整复现数据与测试范围 |

注意：全球首个 ≠ 全球第一，尚需确认完整历史时间线、发行可获得性和相同用户价值。AI/MCP 的单独首创以及多文件 React/Vue 的笼统首创已有反例，**GF-013/GF-014 禁用**。

## 5. 竞品基准：只比较真实体验，不比较虚构功能清单

### Benchmark A · F01：浏览器直接编写 React/Vue 组件

固定以下输入：同一 Chrome 版本、同等页面访问授权、React 按钮计数示例、Vue ref 与 scoped CSS 示例、Stop 清理示例，规定从“安装扩展后用户可用界面”开始计时。

记录每个产品能否在浏览器扩展内直接编辑 JSX/SFC；是否需要外部构建；点击运行后实际页面变化；同一文档重复运行的残留 DOM/监听器；语法错误与修复恢复；普通版或开发版、Beta 或 Stable。竞争对象不仅有 ScriptCat/Violentmonkey，还应检查其他 Chrome 侧栏编辑器与集成开发环境。

**接受成功条件**：OpenDesk 相同 SHA 真实 Chrome 录像 + 原始运行回执 + 可检验源码；至少 3 个独立竞品/替代工作流通过同一任务评价。无法支持某任务必须记录“不支持”，不能直接视为对手失败。

### Benchmark B · F02：本地多文件 React/Vue → 网页运行

同一 3～5 文件 JS/JSX/CSS 小项目，首次安装、首次打开、网站授权、本地配对、Node 依赖下载/准备、首次运行、改一行代码再运行、断开配对错误恢复、保存/发布步骤全部逐项计时。

对比：OpenDesk Local Project、vite-plugin-monkey + Tampermonkey、vite-plugin-monkey + ScriptCat、合适的 WXT 工作流。报告“首次冷启动总时间”“再次修改/运行时间”“人工动作数”“外部工具要求”四个指标，绝不能只展示最快的热更新片段。

### Benchmark C · F04：可验证、可控的网站工具运行

统一测试：依赖锁变化、来源 hash 不一致、撤销网站授权、停止受管 UI、Worker 被终止、跨版本工具更新、历史来源断链。区分 Page 与 Controller，不用 Mock 代替实际浏览器结果。记录 PASS / FAIL / NOT_TESTED；如没有足够对照产品，也不据此宣布安全性第一。

## 6. 分渠道传播与内容模板

**GitHub README（开发者）**：主标题“Build Browser Apps, Not Just Userscripts”，三个可复制真实示例（JS / Developer React/Vue / Native Local 多文件），权限/限制矩阵和带 SHA 测试；链接竞品表和功能状态，避免堆砌未闭环概念。

**视频 / Bilibili / YouTube**：首屏展示网页变化而非架构图；依次演示当前页面授权、运行、修改、Stop。录屏必须显示实际入口、版本信息，不剪掉首次设置或等待时长。每个视频只证明一个明确可复现的功能。

**开发者社区 / Reddit / 技术博客**：写用户遇到的具体问题（如“如何停止 React 注入组件而不留下监听器”），讲执行世界与技术取舍，并公开对照结果，避免“我们超过某某”无证据营销。

**Chrome Web Store**：一个清晰单一用途定位，权限说明与真实截图；不要混写 Standard 与 Developer 能力、尚未完成的 AI/Cloud/GM。遵守 Chrome Web Store 误导性声明、单一用途、MV3 用户脚本与最小权限政策。见 https://developer.chrome.com/docs/webstore/program-policies/policies 、https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq 。

**行业 B2B**：只有电商/创作者真实演示与用户愿付验证成立，才做“行业第一”申请。Page QA Inspector 仍是 DEPRECATED / SOURCE_REMOVED_FROM_MAIN，不能因营销研究重新上架。

## 7. 发布前声明质检清单

- [ ] 目标人群能用一句话理解为何 A+B+C 的组合有价值，而不是故意制造极窄赛道。
- [ ] 在 first-claims-ledger.json 存在稳定 ID、准确原文、限制与明确审批状态。
- [ ] 检查 competitor-timeline.json 的 Stable、Beta、Source、Store 日期，没有把 source push 当发版。
- [ ] 检查 Tampermonkey、ScriptCat、Violentmonkey、vite-plugin-monkey、WXT、Plasmo、相关 AI/RPA 类替代方案，而不只选两个容易赢的对手。
- [ ] 同一源码 SHA 和发布包的真实 Chrome UI/权限/错误恢复/Stop 证据完整。
- [ ] 记录对照任务、机器、Chrome 版本、插件版本、人工动作与原始数据。
- [ ] 当前版本真实提供所述功能；区分 Standard、Developer、本地 Native，不把研发源码当已发行产品。
- [ ] 英文翻译与中文含义一致，全球/首个/第一/最快/最安全等绝对比较有法律和平台审核依据。
- [ ] 任何反证出现即冻结文案、撤销第一主张、变更台账和落地页。

## 8. 迭代节奏与三座小山头的退出门槛

- **第 1–2 周**：F01 竞争时间线与同类编辑器核查，形成正式演示、明确功能边界。
- **第 3–4 周**：F02 冷/热开发流程对照，优先优化首次成功率、权限引导和 IDE 诊断。
- **第 5–6 周**：F04 依赖/版本/权限/Stop 的对照测试；只有经过证实才做差异化技术文章。
- **之后**：完成 GM 与 Browser SDK 真原生验收，再试探生态定位；AI / Cloud 完整可信链通过后，才开始 F07 首创性申报。

上面的周次是规划窗口而非已执行时间表。每月复核竞品日期；每次对外宣称“全球第一”前 7 日内再次核查重要竞争版本。如任何候选不具真实用户价值或出现更早公开的同等实现，应主动退出该赛道，保留新的非绝对化产品定位。
