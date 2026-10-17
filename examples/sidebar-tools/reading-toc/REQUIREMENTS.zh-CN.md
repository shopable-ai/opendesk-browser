# 阅读目录 Reading TOC · 功能需求与验收规格（源码反向整理）

> 状态：**现行能力反向规格 + 源码已改（待真实浏览器验收）**。整理日期：2026-10-18。
>
> 适用对象：OpenDesk Browser 官方 `reading-toc` 工具、网页内可信悬浮目录和 Side Panel 目录。
>
> 证据原则：本文件记录正式源码中实际存在的行为；“目标变更”未完成以前不得当成已交付。历史原型和 CI 记录不能替代当前安装包或用户 Mac Chrome 验收。

## 1. 用户目标与范围

在允许访问的 HTTP(S) 页面内提供轻量目录，识别真正的文章/回答章节，让读者快速概览、聚焦当前位置、展开全目录并准确跳转；同一工具还可在 Chrome Side Panel 中打开，不再安装第二个 Chrome 扩展。

**当前四个图标模式**（`top / focus / full / ai`，顺序固定）：

| 模式 | 现行显示/提示 | 主要行为 | 状态 |
| --- | --- | --- | --- |
| `top` | 主要章节；无障碍说明“主要章节（内容较少时自动补充子章节）” | 优先展示顶层章节；在标题稀疏时自适应补充子章节，短目录直接完整展示 | 源码已修改，待真实浏览器验收 |
| `focus` | 当前章节 | 显示顶层结构和当前章节所属子树，随滚动高亮 | 已实现，默认 |
| `full` | 完整目录 | 展开当前来源所有章节；ChatGPT 等多回答完整视图可跨回答显示并添加分隔 | 已实现 |
| `ai` | AI 整理 | 展示未开放的会员功能/合作内容；不调用模型、不发起付费、不输出假目录 | 占位，未开放 |

网页悬浮卡片保留四个图标、`CONTENTS` 标识、拖动手柄和章节项；**不新增网页刷新/归位/设置按钮，不恢复冗余“还有 N 个章节”按钮**。Side Panel 可独立有一个刷新按钮，不能被当作第五种目录模式。

## 2. 第一按钮命名与 tooltip 变更（源码已修改）

### 2.1 产品决策

**统一名称：主要章节。** 不使用“主章节”作为最终文案，也不再用“智能概览”作为交互按钮名。

原因：中文“主要章节”更自然，与“当前章节 / 完整目录”构成并列、可区分的三种视图；“主章节”容易被理解为只显示 H1，和现有自适应补充 H2–H4 的逻辑不符。内部 `top` 标识保持不变，避免修改持久化状态、协议和测试场景身份。

| 文案用途 | 中文（目标） | 英文（目标） |
| --- | --- | --- |
| 短 tooltip（`title`） | 主要章节 | Main sections |
| 无障碍名称（`aria-label`） | 主要章节（内容较少时自动补充子章节） | Main sections (automatically includes subsections when needed) |

同一文案在**网页悬浮目录与 Side Panel** 保持一致。短 `title` 不堆叠算法说明，`aria-label` 精确反映可能显示子标题。英文必须通过现有 `locales.json` 双语校验，不在可信网页脚本另写一套硬编码文案。

### 2.2 不得改变的交互

- 只改名/tooltip，不把 `top` 改成“仅 H1”；标题从 H2 开始时仍正常构建顶层。
- 主要章节模式不应自动滚动正文；点击真实章节项才调用定位能力。
- 默认仍为“当前章节”（`focus`）；已实现的短目录自动概览规则不因改名变化。
- 已选择模式、正在跟随的回答、拖动位置、网站启停及用户语言，不因切换模式或切换语言丢失。

### 2.3 源码绑定

- 唯一双语文案：`examples/sidebar-tools/reading-toc/locales.json` 中 `topTitle`（短 tooltip）、`topLabel`（无障碍名称）以及英文 `source/text`。
- Side Panel 初始静态按钮：`examples/sidebar-tools/reading-toc/src/index.html`；运行时由 `src/main.js` 的 `paintLanguage()` 覆盖。
- 网页可信浮层：`src/reading-toc/view.js`，`createReadingTocView()` 初始化和 `updateLanguage()` 均应使用 `topTitle` 设置 `title`、`topLabel` 设置 `aria-label`。其它模式保持现有 `*Label`。
- 可信受审阅副本：**只能**由 `node scripts/generate-reading-toc-locales.mjs --write` 从 `locales.json` 生成 `src/reading-toc/locales.generated.js`，禁止手动更改校验 SHA。
- 唯一正式可安装包由现有工具包生成器产生，经测试与 `--promote-from` 审核晋升，不手改分发 JSON 或跳过安装升级验证。
- 离线主 HTML 必须由 `scripts/preview/build-preview.mjs` 根据现行正式源码重建，历史快照不可作为新设计依据。

## 3. 目录功能现状需求（从已实现代码反推）

**F-01 标题索引与来源身份。** 支持单篇文章、H2 起始页面、多 H1、重复标题以及多段 AI 回答；不同回答有独立标题层级和导航身份。不能以 DOM 全局 ID、标题文本或“每页只有一个 H1”冒充稳定身份。普通文章、ChatGPT 与知乎等页面适配以实际匹配结果为准。

**F-02 自适应主要章节。** `src/reading-toc/overview.js` 用逻辑 `depth===0` 表示各来源的顶层（并不等于 HTML H1）。顶层不足 5 条时尝试逐层展开，目标至少 5 条，最多到逻辑深度 3；抽样时最多保留 12 条，优先保留当前阅读分支及相邻章节并均衡分配。当前来源的所有标题不超过 12 条时，UI 直接展示完整列表。多层隐藏时高亮最近可见父级。

**F-03 当前章节。** 默认聚焦所属子树并保留同一来源的顶层结构；正文滚动触发高亮，不能因此强制滚动页面。短目录可自动概览，用户显式选定的模式优先。

**F-04 完整目录。** 可切到全目录且无需额外“查看完整目录”按钮；多回答来源完整模式保留回答分隔，不串源。点击章节时以源 ID + 章节 ID 定位；失效时显示错误，不假报跳转成功。

**F-05 内容动态更新。** 通过可信内容脚本监听网页 DOM/SPA 变化，受限范围内刷新索引；网页浮层没有手动刷新按钮，Side Panel 的刷新独立触发新扫描且不重载网页。读取失败有明确状态与恢复途径。

**F-06 网页位置与可访问性。** 悬浮目录可拖动、按 Origin 记忆位置，双击手柄或 Home 归位；键盘方向键可移动。四个模式按钮应可聚焦，选中项用 `aria-pressed` 标记，目录项提供真实文本与当前高亮。避免遮挡聊天输入框、离屏或无限撑高。

**F-07 授权与生命周期。** 官方工具 ID 是 `reading-toc`，工具包能力仅 `page.toc`；安装和停用由可信宿主管理。单页排除、整站停用与仅隐藏网页悬浮卡片是三种不同状态；Side Panel 与网页悬浮卡片复用索引，网页内容不交给任意工具脚本。

**F-08 本地化。** 界面文案来自 `locales.json` 的 `zh-CN` / `en`；实际网页标题始终展示原文。切换语言不重置当前模式、来源或位置。任何源文案改动都须同步更新英文 `source` 字段并重新生成可信副本。

**F-09 AI 未开放边界。** AI 模式只展示审核过的会员权益与合作信息；模型调用、真实会员权益、支付及 AI 章节生成均未接入，禁止冒充完成。

## 4. 本次需求的验收用例

| 场景 | 通过条件 |
| --- | --- |
| 网页中文悬浮目录 | 第一个图标 hover 为“主要章节”，AX 名称包含自适应说明；第二至第四按钮原样 |
| Side Panel 中文工具 | 第一个图标 `title`/无障碍名称一致；刷新独立存在 |
| 中英文切换 | tooltip 切为 `Main sections`，AX 为英文解释，模式和当前位置不丢失 |
| 单 H1 + 20 H2 | “主要章节”仍补充 H2，不能退化为孤单 H1 |
| 5 个顶层标题及子标题 | 概览以顶层为主，完整目录可看到所有子标题 |
| 12 条以内短目录 | 概览不隐藏真实章节，不出现冗余“还有 N 个” |
| H2/H3 起始、重复标题 | 顶层正确、同名章节独立定位 |
| ChatGPT 多回答 | 当前来源跟随、完整视图回答分隔、切换模式不自动滚动正文 |
| AI 占位、网站停用 | 不新增模型或授权调用；停用/隐藏/撤权仍按原合同工作 |
| 安装包与生成 HTML | 重新生成镜像、候选包及三份同源预览，产物逐字节匹配正式源码 |

## 5. 证据、测试和交付门槛

定向 Node：
`tests/environment/reading-toc-overview-r43.test.mjs`、
`tests/environment/reading-toc-ai-r18.test.mjs`、
`tests/environment/reading-toc-localization-preview-r12.test.mjs`、
`tests/environment/reading-toc-r41.test.mjs`。

真实 Chromium 预览：
`tests/framework/reading-toc-preview-r14-native.test.mjs`；需更新英文无障碍名称断言。

真实扩展及用户 Mac：
`tests/framework/reading-toc-native-r41.test.mjs` 和现有安装/更新流程；必须在通过来源/包摘要和 production 门禁的同候选构建中运行。过去的预览/CI PASS 不等于本次产物已通过。

**交付状态约束：** 源码修改不等于已在用户浏览器安装上线；代码/译文/受信副本、正式包、同源 HTML、Node、Chromium、Mac Chrome、原位升级须分别给出 `PASS / FAIL / NOT_TESTED` 证据，不得把旧提交结果复制到新提交。

## 6. 关联文档

- [工具 README](README.md)：使用方式、迭代记录、构建与预览入口。
- [历史 R3 标题结构设计](../../../docs/product/reading-toc-structure-r3.zh-CN.md)：主要解释 H1 与回答边界；其三按钮原型已被四模式正式实现取代。
- [网站/页面设置 R4.8](../../../docs/product/reading-toc-settings-r48.zh-CN.md)：三种设置状态。
- [R1.8 正式源码与验收](../../../docs/framework/workstreams/reading-toc-r18-source-migration-20261017.md)：四按钮迁移背景和发行门槛。
- [R1.8.6 Mac 验收阻塞](../../../docs/framework/workstreams/reading-toc-r186-mac-20261018.md)：此前 production 构建与真实安装测试的失败/未测边界。

## 7. R1.9.1 版本一致性修复与真实验收边界（2026-10-18）

- **正式包身份（已在源码核对，未以本机 Chrome 安装验证）：** `reading-toc` 1.0.9、`page.toc`，固定 SHA-256 `56890b9feeb6908c5967eb16aed19a1e811f8d376dd270c01e78c0c93b052071`；该值属于现行正式包，不由离线预览生成。
- **市场修订（已提交，待同候选 CI）：** 先前最新 `reading-kit` revision 7 仍固定目录 1.0.8，与 1.0.9 正式发行包不一致。提交 [`c0060a0`](https://github.com/shopable-ai/opendesk-browser/commit/c0060a080754a5f5a33b72b605e218ad7ec1ccf0) 追加 revision 8（目录 1.0.9），原 revision 1–7 不得修改。既有通用安装器用例改为非保留 ID，额外验证伪造 `reading-toc` 在任何存储操作前被 `E_OFFICIAL_ID_RESERVED` 拒绝；安全门禁不放宽。
- **历史 CI 证据（不能当作本次 PASS）：** [TOC 39056332684](https://github.com/shopable-ai/opendesk-browser/actions/runs/39056332684) 的离线 Chromium 预览测试通过，但本地化旧版本断言、Side Panel 默认访问用例失败；正式打包另受 AdBlock 可信源码审核门禁阻塞。[Market 39056332713](https://github.com/shopable-ai/opendesk-browser/actions/runs/39056332713) 含旧版 revision 7、通用安装测试误用保留 ID 等失败，另有独立开发服务失败。
- **待验证：** 提交后的 Node、最新 CI、真实 Chrome 目录/跳转、Chrome 扩展原位升级、设置持久化、权限撤销/恢复和用户 Mac Chrome 均须给出同候选日志或截图；没有独立证据统一标记 `NOT_TESTED`。不要把历史预览通过等同正式安装通过。
- **下一故障定位：** `tests/environment/sidebar-tools-host.test.mjs` 的默认访问用例增加实际错误回执断言信息；必须根据新 CI 输出确定原因再修业务或 Fixture，不能通过跳过验证、注入假身份或放宽 `page.toc` 权限解决。

## 8. R1.9.1 同候选 CI 与独立主要章节函数校验（2026-10-18）

本节证据针对 **`85fc1ccd387833384a2207c45e6b3dbf7685902e`**；不能自动外推到后续并行提交的 HEAD。

| 项目 | 状态 | 可复核证据 |
| --- | --- | --- |
| 正式 1.0.9 包及 SHA-256 | **PASS（静态包身份）** | 从 GitHub 读取正式安装 JSON，按正式规范化字段独立计算 28,525 UTF-8 字节，SHA-256 与官方 pin 完全一致；未安装浏览器 |
| Reading TOC 定向 Node + 可信桥接 | **PASS（83/83）** | [TOC CI #39058916850](https://github.com/shopable-ai/opendesk-browser/actions/runs/39058916850)，`Reproducible TOC tool and trusted bridge regression` 中 83 项全过 |
| 同源 HTML 与 Chromium 离线交互 | **PASS（同候选离线预览 1/1）** | 同一 TOC CI 的 `R1.4 real Chromium offline preview interaction`；Chrome/155、`file: true`、`installed: false`，多回答预览 2 条分隔线 |
| Sidebar Tools 宿主回归 | **PASS（99/99）** | 同一 TOC CI 的 `Existing Sidebar tool regression`，含默认网站读取与停用用例 |
| 扩展范围的其他 Node | **FAIL（61/62）** | 同一 TOC CI 中 Cookie Editor 原型与正式项目版本不一致；不是 Reading TOC 目录算法失败 |
| 受信 production/development WXT 构建 | **BLOCKED/FAIL** | 同一 TOC CI 均受 `Trusted AdBlock source changed` 安全摘要门禁拒绝；不得绕过 |
| 市场 Node 回归 | **FAIL（4 项跨模块）** | [Market CI #39058916901](https://github.com/shopable-ai/opendesk-browser/actions/runs/39058916901) 中剩余 `dev-service` 输出文件缺失及 toolbar label 品牌断言，旧 `reading-kit` 版本及 `E_OFFICIAL_ID_RESERVED` 误用故障不再出现 |
| 市场 macOS/Linux 宿主组件 | **PASS（组件步骤）** | 同一 Market CI 两系统 `R5 handoff, installer, immutable archive and client state components` 均成功；后续真正构建被 AdBlock 门禁拦截 |
| 原生安装、1.0.8→1.0.9 原位升级、Mac Chrome 实站 | **NOT_TESTED** | 构建门禁使同候选已安装扩展的原生测试没有完成；离线浏览器截图不得算真实安装 |

额外将 GitHub 现行 `src/reading-toc/overview.js` blob `a148dc645ec49b22f0f0a911f4861960442617b5` 在隔离 V8 执行其真实纯函数，覆盖「单 H1 + 20 H2」「五个顶层及子节点」「H2/H3 起始逻辑树」「四个活动章节位置」「空树」五项，**5/5 PASS（仅纯函数执行）**。其中单 H1 + 20 H2 显示 12 个、保留当前 H2、隐藏 9 个；不是浏览器 DOM/滚动/截图证明。

**下一关：** 先由负责 AdBlock 安全发布的改动解决受信来源摘要，不要更改这项安全规则来推进 TOC；再基于新的同一 HEAD 重跑构建、原生扩展安装与升级。真实网页双语、重复 ID 导航、SPA、撤权以及用户 Mac Chrome 必须另行记录 PASS/FAIL/NOT_TESTED。
