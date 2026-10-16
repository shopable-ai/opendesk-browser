# ChatGPT Mind Map R3.9.5 · 许可映射、父执行准入与真实 ChatGPT 观察

日期：2026-10-17，Mac arm64。**正式产品仍 BLOCKED / NOT_SCORED。**
本轮完成可安全实施的许可证据校验与正式 Page 父执行槽加固；没有批准厂商资源、生产子帧加载或正式安装。

## main 与修改范围

开始 HEAD：`504a13313ad8634a1f5d0562e3259575490479d9`。
已执行 `git fetch origin main`；当时 `origin/main=82f9e8ae0`，与本地各有独有提交，不能 fast-forward。
继续在 main 工作；其他会话随后提交 Adblock，集成基点为 `9c0e46d88c04b05f19788344b99d3d1f3bfa76ef`。
本报告与机器索引由其所在任务提交绑定；实际提交及最终 HEAD 见交付消息。
未创建分支、worktree 或 PR；未推送、发布或改写其他会话暂存。

本轮文件及原因：

- `scripts/verify-license-review.mjs`、`tests/xmind-license-review.test.mjs`：校验原 provenance、四个原始产物、参考文本与完整产物映射；拒绝篡改、越界路径、重复项及批准字段提升。
- `scripts/audit-runtime-license.mjs`、`tests/xmind-license-audit.test.mjs`：将真实 R395 材料接入现有 CLI，验证强制许可门禁仍拒绝。
- `tests/xmind-license-review-r395.json`、`tests/license-evidence/r395/`：16 份参考的索引及 8 份新增原始材料；不覆盖 R394 和原 provenance。
- `src/platform/host/preview-admission.js`、`tests/environment/page-installed-admission-identity.test.mjs`：复用现有 Authority 事务及授权 helper，加固父执行身份。
- `tests/environment/page-installed-programs.test.mjs`：旧 `f.pending` 夹具补齐生产记录原本具有的安装 ID、授权代数，原断言保留。
- README、本报告、`tests/mac-acceptance-r395.json`：分开本轮、继承、快照、组件和真实站点的证据等级。

未改业务 UI、XMind 引擎、Program 版本和安装身份；未增加依赖。其他会话 Adblock、prompt-shortcuts 和构建来源脚本改动保留。

## 许可：新增精确映射，不产生批准

独立 `jszip.min.js` 与 [JSZip 固定上游提交的 3.10.1 dist](https://raw.githubusercontent.com/Stuk/jszip/0f2f1e4d0509514417db83fe5b86bde90e0ffe8d/dist/jszip.min.js) 完整字节一致：97,630 B，
`acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e`。
其 [许可证参考](https://raw.githubusercontent.com/Stuk/jszip/0f2f1e4d0509514417db83fe5b86bde90e0ffe8d/LICENSE.markdown) 与此前捕获文本一致。
这关闭了该独立文件的来源映射缺口；没有关闭其嵌入依赖及最终 NOTICE，也没有批准四文件整体再分发。

Snowbrush 内 GSAP/CSSPlugin 3.5.1 头部与固定上游提交匹配。
[GSAP 3.5.1 原头部](https://raw.githubusercontent.com/greensock/GSAP/147a6b6594d6bf272ab74ddbbbb2060190c6cce5/src/gsap-core.js) 指向历史 GreenSock 条款；头部相等不证明整个模块相等或条款适用。
Pako 固定参考版本 1.0.11 的 [README](https://raw.githubusercontent.com/nodeca/pako/a718e4f6e5ce87b0964d8f84541d92a23263365b/README.md) 区分 `lib/zlib` 的 Zlib 与其他文件 MIT；保存了两类原文参考及 package 元数据。
**嵌入 Pako 的真实版本、文件对应关系仍未确定。**

仍阻塞：精确 polyfill/SDK/Snowbrush 构建、Snowbrush 产物授权、历史 GSAP 条款适用性、嵌入/传递依赖清单及 NOTICE 闭包、SDK 参考 tag/package 与固定 bundle 的映射。
`verifyLicenseReview()` 的返回始终为 `legalApproval:false / redistributionApproved:false / installable:false`；
CLI 执行成功只说明证据完整性校验成功，`--require-approved` 仍以 1 退出。
新增完整 JSZip 字节仅位于测试参考 `.txt`，不加入 production 资源。
参考原文保留上游尾部空白和换行，不为消除 Git 空白提示而改写证据；其 SHA 校验通过，源码和报告的空白检查单独通过。

## 正式加载：父执行安全前置已加固，子帧合同仍缺失

公开 Page SDK/Schema 没有批准的固定子帧加载入口。`src/libs/loader.js` 与 Page framework loader 能校验字节，
但不提供固定资源与正式安装、Revision、目标 opaque 子文档、执行槽及撤权之间的完整绑定。
`frameFactory` 继续是私有测试注入，默认入口继续拒绝。

现有父执行槽 `reserveInstalled()` 原先只比较部分 token/hash/document 字段。本轮在同一存储事务内增加：

- 当前和捕获授权均有效且 active，安装 ID、授权代数相等；
- 安装记录的 namespace、Program、Revision、sourceHash 一致；
- prepared execution 的 namespace、Program、Revision、executionKey、安装 ID、授权代数与当前授权一致；
- 原 session、token、manifest/sourceHash、tab/document 和共享槽排他检查继续生效。

非法身份在任何 put 前拒绝，不能挤占或释放既有槽。没有新 API、Registry、Host、安装器或权限格式。
新增测试修复前 39 项失败，修复后 63 项通过；既有安装服务的 34 项测试也通过。
这是组件层父槽前置证明，不能替代真实 Broker 子帧执行或撤权验收。
正式停用/撤权/卸载对已开子文档的退休与清理合同仍未实施；原安装服务不会自动回滚已发生的网页效果。

## 验证与证据复用

本机原始目录：`artifacts/chatgpt-mindmap-r395-mac-20261017/`；工作日志沿用
`docs/framework/workstreams/chatgpt-mindmap-r394-mac-20261017.md`，新增 R395 占用和结果。
均按现有规则保留为本机材料，不强行提交生成物或重写旧 receipt。

| 验证层 | 本轮状态 | 限定范围 |
| --- | --- | --- |
| Node 定向回归 | **183 PASS / 0 FAIL / 0 SKIP** | 许可单元/集成、父槽身份、原安装服务；组件测试 |
| `npm run check` | PASS，795 文件 | 该次检查的源码；并行后续改动不自动继承 |
| Program validate/build | REUSED | 原业务源码/12 编译模块相同；未重复构建 |
| Program 当前候选 audit | PASS | 仍为 BUILT_UNVERIFIED / installable:false |
| production 静态 build | PASS，冻结快照 | 102 文件；内部 sourceDriftDuringBuild=[] |
| development 静态 build | PASS，冻结快照 | 140 文件；内部 sourceDriftDuringBuild=[] |
| Package Verify | PASS，冻结快照两包 | 构建内验证及独立 verify；没有原生安装 |
| React 构建 | PASS，冻结快照两种模式 | 未复现历史 constructor/input tracker/event replay/bind；未改扫描/CSP/预算 |
| Mac Browser 包 smoke | R394 历史基线可引用 | 本轮新快照包没有 Mac smoke，NOT_TESTED |
| REAL XMind 业务 fixture | REUSED PASS | 24 项业务/编译输入、8 原始 JSON、15 日志哈希核对一致 |
| 生产固定子帧 loader | BLOCKED | 没有批准的子文档身份与退休合同 |
| 正式 Broker 安装 | BLOCKED / NOT_TESTED | 没有推进 Verified/Available/Installed |
| 安装后生命周期 | NOT_TESTED | 安装、启停、刷新/SPA/重启、升级、网站撤权、卸载、失败恢复未验收 |
| 真实 ChatGPT 访问及公开测试回复 | OBSERVED | Mac CFT 匿名会话，原生输入与点击 |
| 真实 ChatGPT 的 Mind Map | **REAL_CHATGPT_NOT_TESTED** | 未正式安装，未执行导图 |

快照 production packageHash：`9daf4bd5ee97a91c302c227eb39d7bf750bc4646767091a5f9b5097c502c43c8`。
快照 development packageHash：`9de0779275c62c6be0d78b6f6617d237a38bd9a82f6ed5a6c8ffbb83fabb7618`。
它们绑定独立 `build-snapshot`；构建后根目录 Adblock 和 `scripts/bundle-provenance.mjs` 有其他会话漂移，
不能把快照 PASS 登记为当前根目录完整包 PASS 或正式原生候选。目标父槽及授权输入无漂移。

现有 `npm run dev` PID23751 / node23773 保持运行，固定输出为根目录 `dist/development`，43119 的 Chrome 连接仍在。
本轮未停止、覆盖该 writer，也未把独立快照安装进日常 Chrome。
独立快照首次宽复制遇到 ENOSPC，删除的只有本轮未完成快照；窄快照初次缺少根 Native 契约输入，补齐后重跑通过。
相关失败日志/诊断保留。没有放宽任何构建安全门禁。

Program：`opendesk.chatgpt-mindmap`，0.2.0，58,262 B，
sourceHash：`7c481de07b813caa472121df15e6601cd97d135afd41bf6b2a70993d4b617f92`。
原 provenance SHA：`8c7a31e6b6dcfde8525c72d941df13866b148d806c6c2f47eff5141e0eab9de6`，未改批准字段。
R394 的 production `cda74065…`、静态 development `db68a404…` 是历史包；不是本轮新包。
原 production 扩展 ID `efhcmggbgamacpfhhmooelgdkepdcghh` 也是历史 smoke 身份，不能代表 Mind Map 已安装。

## 真实 ChatGPT 本轮操作

独立临时 profile、mock keychain、CFT 156.0.8078.4，未登录，也未操作私人对话。
在真实 `https://chatgpt.com/` 通过原生 UI 发送：

> 请给出“## 带缩进的思维导图内容，用于测试转换xmind”。主题是周末城市公园活动计划，包含准备、路线、活动、收尾四个分支，每个分支至少两个子项。请使用 Markdown 二级标题加缩进的无序列表，三级深度，包含中文、英文、数字和一个链接。只给测试内容，不含私人信息，不使用代码块。

原生 AX/截图工具轨迹观察到已完成回复、标题“周末城市公园活动计划”、四个分支及嵌套列表、复制按钮，输入框发送后为空。
`real-chatgpt-observation.json` 是人工记录的观察摘要，不是截图回执或渲染证据。
未保存私人回复原文；日常 Chrome 新标签恢复的旧草稿未改动/发送。独立 CFT 退出，其临时 profile 已清理。
没有把该网页回复或匿名访问提升为 Mind Map 运行、登录验收、深浅色、多回复、SPA、重启或 20 次清理 PASS。

## MM-01 至 MM-05

| 项目 | 状态 | 关闭缺口 |
| --- | --- | --- |
| MM-01 | BLOCKED | 仅独立 JSZip 映射关闭；完整许可和生产子帧固定资源仍阻塞 |
| MM-02 | PASS_FIXTURE_ISOLATION_ONLY | 复用 R394；没有提升为正式部署关闭 |
| MM-03 | BLOCKED | 正式安装前置不满足，未执行安装 |
| MM-04 | NOT_TESTED_REAL_CHATGPT | 已真实访问/请求测试回复；导图产品没有执行 |
| MM-05 | NOT_TESTED | 原 PARTIAL 未定义独立关闭合同，不编造其含义 |

## 独立复审与十维评分

独立 reviewer：`01a145f9-cccf-7dc2-944e-a1d04cde25e8`。指定补丁未发现有证据支持的 P0–P2 缺陷。
评分仅适用于具有证据的组件，未测产品层不评分；总体 **NOT_SCORED**，release **BLOCKED**。

| 维度 | 本轮独立评分 | 范围 |
| --- | --- | --- |
| 真实 XMind | NOT_SCORED | 仅继承 R394 fixture，原 96 不冒充新评分 |
| 视觉质量 | NOT_SCORED | 无正式站点新证据 |
| 内容正确性 | NOT_SCORED | 继承 R394，原 92 |
| 回复隔离 | NOT_SCORED | 继承 R394，原 96 |
| 交互 | NOT_SCORED | 继承 R394，原 95 |
| 代码质量 | 94 | 本轮补丁静态复审 |
| 安全与隐私 | 94 | 本轮身份、授权与许可边界 |
| 性能与生命周期 | NOT_SCORED | 无新增原生验证，原组件 90 |
| 正式安装 | NOT_SCORED | BLOCKED |
| 原生验证 | NOT_SCORED | 新候选未完成产品验收，原 fixture 96 |

继续推进的必要外部输入是精确 Snowbrush/GSAP 等授权及依赖闭包；工程缺口是现有 Authority 下的批准子帧加载/退休与正式安装生命周期。
许可与安全前置满足后，才可在真实 ChatGPT 中运行同一候选。当前没有满足该正式产品目标。
