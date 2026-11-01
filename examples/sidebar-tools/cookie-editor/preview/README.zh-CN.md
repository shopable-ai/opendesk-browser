## 服务列表与添加表单保留修正（2026-10-31，当前）

[同一 React 源码预览](http://127.0.0.1:43134/dev.html)默认打开企业页。在原介绍后的「服务连接 · 2 个」进入列表；原团队场景、四项资源、官方席位、定制入口及六 Tab 完整保留。此为现有 Vite 持续源码预览，使用隔离内存 Mock，未构建或替换 Browser 输出。

当前列表进一步参照原 HTML：标题与说明合组，右侧保留刷新／添加；本机图表与公司图标、类型＋地址、图标状态徽标、关联数量、详情／连接图标保持相似。保留原两条虚构服务和四项静态企业资源；已连接服务使用原设备管理动作，未知结果使用原回执核对，失效连接先进入详情。真正空态提供一个明确的「添加服务」主操作。

[本轮列表](../../../../artifacts/cookie-enterprise-react-list-20261031/final/list.png) · [本轮空态](../../../../artifacts/cookie-enterprise-react-list-20261031/final/empty.png) · [同窗口原 HTML](../../../../artifacts/cookie-enterprise-react-list-20261031/html-list.png) · [定向记录](../evidence/service-list-html-parity-20261031.json)。本轮仍为源码预览；原 2.0.59 包未更新，真实安装与服务操作不由这些静态数据证明。

前轮默认 `accountsDemo` 未提供服务配置；同时正式 React 尚未迁移紧凑服务卡片及本机／公司类型选择。这次补齐实际入口：两条演示配置只在外部 `serviceConnections` 场景提供，`serviceConnectionsEmpty` 明确展示真正空态；正式组件只消费真实 Domain 状态。刷新、详情返回、添加后取消／返回／Escape 及丢弃确认都保留原列表，恢复可见位置与操作焦点。保存仅追加一条未连接配置，切换 Tab 后仍在同一 Mock 中保留。完整刷新或实验台重置会重建模拟数据。

添加页恢复两类选择与各自名称、地址草稿，地址初始为空。类型只影响 UI 说明和草稿，不新增领域字段或协议。复用公开 `@opendesk/ui` Button、既有 Cookie 图标按钮、canonical `od-form-field` / `od-field-label` / `od-field-help` / `od-field-error` 与原生语义，未自建 Field/Select/Dialog 或组件库。字段错误就近关联，帮助与操作区处于文档流中。

[当前列表](../../../../artifacts/cookie-service-preservation-20261031/final/list.png) · [原 HTML 同数据列表](../../../../artifacts/cookie-service-preservation-20261031/final/original-list.png) · [当前添加](../../../../artifacts/cookie-service-preservation-20261031/final/add-local.png) · [原 HTML 添加](../../../../artifacts/cookie-service-preservation-20261031/final/original-add.png) · [本轮证据](../evidence/service-list-preservation-20261031.json)。同一正常窗口与 380px 既有预览设置对照，不开展宽度／缩放矩阵。验证覆盖操作与内容保留，不以旧 95 分结论替代；本轮没有评分。

本轮未打包、安装或发布。原 Chrome 标签的 `BLOCKED_POLICY` 不重试或绕过，58626 服务不重启；当前源码证据不证明安装版 Chrome、真实公司服务、production 或完整无障碍验收。以下各候选与分数仅为历史记录。

## 添加服务页头与间距：前轮记录（2026-10-31）

[打开当前 React 源码预览](http://127.0.0.1:43134/dev.html) → 企业 → 添加服务。此入口直接导入正式 `app/` 与工具 `src/react.css`，运行现有 Vite dev 服务；SDK 数据与存储为隔离内存模拟。**新布局已落实到正式业务源码，但未打包、安装或发布。** 原 58626 静态服务本轮不可达，未重启或替换；[同一离线 HTML](./cookie-editor.html) 仍可直接打开。

- 返回与标题居中对齐；配置页移除多余分隔线，按 8/12/16px 整理分组，保留字段字号与点击目标。
- 类型解释归到原型类型组；正式 HTTP 表单复用“名称＋地址”，不新增类型持久化字段。地址为空，不猜主机或端口。
- 帮助可完整展开，保存/取消进入正常文档流，不遮挡正文；编辑时暂时显示表单，返回完整恢复企业内容与六个横排 Tab。
- 正式返回/取消/Escape 复用已有丢弃确认，继续编辑保留输入并恢复焦点；保存明确显示“尚未连接”，一次性连接码仍需下一步单独确认。

[旧页头截图](../../../../artifacts/cookie-service-header-20261031/before/add-local-empty.png) · [新离线页头](../../../../artifacts/cookie-service-header-20261031/after-html/add-local-empty.png) · [正式 React 新页头](../../../../artifacts/cookie-service-header-20261031/react/add-empty.png) · [正式展开帮助](../../../../artifacts/cookie-service-header-20261031/react/add-help.png) · [设计决定](./SERVICE-CONNECTIONS-DESIGN.md) · [本轮证据和独立复评](../evidence/service-header-layout-review-20261031.json)。

本候选离线 HTML **8/8**、同源 React Chromium **5/5** 通过，页面错误和真实服务请求为零；正式组件/消费者 **21/21**、预览内存存储 **2/2** 通过，JSX 转换与工具 CSS 解析通过。独立 AI 静态复评 **UI 95/100、UX 95/100，均无阻断**。剩余改进包括帮助密度、错误就近关联与码术语；不等于正式可访问性验收。子 agent 另运行既有预览全集，28/30，通过之外两项为邀请文案和历史 approved HTML 哈希断言，详见证据，保留延期。

下列章节均保留各自历史候选范围；旧 12 项 PASS 和 96/100 不继承。新候选没有真实服务请求，也未重试原 Chrome 标签的策略拒绝；新布局的安装版 Chrome、真实接入、production 和正式无障碍仍 `NOT_TESTED`。

## 添加服务：名称＋地址（2026-10-31，当前候选）

[打开企业预览](http://127.0.0.1:58626/cookie-editor.html?view=enterprise) → 服务连接 → 添加图标。仍为 **DESIGN_PREVIEW_ONLY**：同一个 HTML／58626 静态服务，使用虚构数据，无需构建。本轮 Chrome 在焦点修复前的同外观候选已实际点击填写、保存，确认显示“未连接”；最终候选由离线 Chromium 验证。

- 两类统一显示「服务名称＋服务地址」。「此电脑上的服务」明确连接此电脑上已启动的账号额度服务，须保持服务运行；「公司服务」向管理员取得 HTTPS 地址。
- 本机地址**留空而不猜默认端口**。现有普通 `serve` 使用当次随机主机名和端口；在服务管理页「Cookie 同步设置 → 生成新应用连接码」复制完整服务地址。展开帮助提供启动、地址来源和未准备服务时的说明。原型上方实验台「填入演示信息」仅填写虚构值，不安装、启动或连接真实服务。
- 切换类型分别保留地址草稿；本机只允许 HTTP(S) 回环来源，公司保留非本机 HTTPS。严格拒绝路径、管理链接、参数、账号密码和重复来源。不同本机地址可分别配置。
- 保存配置不会连接。下一步本机填写一次性应用连接码并审阅连接；公司授权仍未接入。已连接地址只读，改地址须先断开；更换接收方使旧关联、同步授权失效。失败保留配置，草稿安全返回，未知结果只核对原操作。
- 保存／取消保持可见，默认表单的启动帮助和保存说明均可见；仅调整此配置表单间距，原企业区域、六横排 Tab、Cookie／账号入口和按钮视觉保持。

最终 HTML SHA-256：`f4d1ccafa639a6374d9a94f5511c5e0218f868ee4f51f7a9d6e542c7c9456658`。最终同候选 **12 项定向 Chromium 检查 PASS**，包含未启动详情和连接页恢复后的精确焦点断言；页面错误及真实服务请求均为零。原企业内容模板与交接基线逐字相同，原 CSS 仅新增配置间距和可见操作区两项规则，HTTP 返回字节与源码相同。

[本机添加截图](../../../../artifacts/cookie-enterprise-add-service-20261031/candidate-5/add-local-empty.png) · [公司添加截图](../../../../artifacts/cookie-enterprise-add-service-20261031/candidate-5/add-company.png) · [检查报告](../../../../artifacts/cookie-enterprise-add-service-20261031/candidate-5/interactions.json) · [设计取舍](./SERVICE-CONNECTIONS-DESIGN.md#添加服务易懂化2026-10-31本轮设计决定) · [本轮独立评审与证据](../evidence/service-add-form-review-20261031.json)。本轮最终独立AI复评为 **UI 96/100、UX 100/100，均无阻断**。评分只覆盖离线原型截图、源码与既有检查报告，不是人工或正式无障碍验收。UI剩余扣分：错误连接码页确认按钮需滚动、帮助略密、连接码无显隐核对。前轮评分不继承，首轮92／93和中间失败记录保留；后续历史章节均只说明各自候选。

最终现有 Chrome 标签刷新被浏览器 URL 策略阻止，记 `LIVE_CHROME_FINAL_RELOAD=BLOCKED_POLICY`；未用其他界面或通道绕过。预览服务的最终 HTML 字节已核对一致，同候选离线截图与交互检查有效。真实服务、Native、正式 React、安装、production 和完整无障碍验收仍 **NOT_TESTED**；未执行宽度／缩放矩阵，未提交或推送。

## 服务列表图标与中性账号计数（2026-10-31，前轮保留记录）

[打开企业预览](http://127.0.0.1:58626/cookie-editor.html?view=enterprise) · [离线 HTML](./cookie-editor.html)。当前仍是 **DESIGN_PREVIEW_ONLY**，复用原58626静态服务，无需构建。

- 列表添加、详情、连接、管理及详情页编辑改为既有34px图标按钮；粗指针44px。操作始终可见，具有服务上下文的可访问名称，悬停或键盘聚焦显示提示，支持Esc关闭、再次触发与持续悬停。
- “尚未关联账号”改为users图标＋中性“关联 0/1”；连接不自动增加关联数。连接状态保留短文字配语义图标；结果未知使用放大镜核对原操作。保存、确认、危险操作和首次添加空态保留明确文字。
- 原企业介绍、场景、资源、会员/定制和六横排Tab完整保留；本轮仅更改本HTML、定向交互检查和设计证据，正式业务由并行owner维护。

候选SHA-256：`b9b7793bb89a9b69be814e4e26175a00ec405c5137147e69c77b3116f3212b60`。本轮5项必要离线Chromium检查均PASS：图标名称/鼠标与键盘提示/关联计数/管理入口、完整原内容、键盘与触屏返回焦点、未知结果只核对、异常状态恢复。零页面错误、零真实服务网络请求；19张截图与5份报告绑定同一SHA，HTTP预览字节与文件一致，原企业内容模板与本轮基线字节一致。语法和补丁空白检查通过。

首候选真实发现hover提示不能用Escape关闭，已修复并回归。另两次中间检查为驱动错误：误把“已连接”当成“已关联1账号”、误把主题按钮当复选框；纠正驱动后通过，没有为测试改业务。失败及最终证据均保留。历史16项检查不冒充本轮重跑。

[当前服务列表截图](../../../../artifacts/cookie-enterprise-icons-20261031/candidate-2/icon-check-pass/icons-default.png) · [已关联状态](../../../../artifacts/cookie-enterprise-icons-20261031/candidate-2/icon-check-pass/icons-connected.png) · [候选与验证清单](../../../../artifacts/cookie-enterprise-icons-20261031/candidate-2/manifest.json)。本轮独立AI复评为**视觉设计97/100、UX审阅96/100**，均无阻断，达到95分要求；[完整评审](../evidence/service-icons-review-20261031.json)保留扣分与范围，未继承上一轮98/99。真实服务、Native、安装、正式React和完整无障碍验收均 **NOT_TESTED**；宽度/缩放矩阵不在范围。以下均为历史记录，图标选择以此节和设计文档最新续轮为准。

## 服务连接紧凑布局（2026-10-31，前轮保留记录）

[直接打开企业页](http://127.0.0.1:58626/cookie-editor.html?view=enterprise) · [离线 HTML](./cookie-editor.html)。本轮仍是 **DESIGN_PREVIEW_ONLY**，复用现有58626静态服务，无需构建，未切换或安装Browser。

- 服务列表改为共享外框、连续条目；名称/状态同行，类型与地址合行，关联数量与操作同行。默认预览行高约174px降至109px（约37%），文字不靠缩小凑密度。
- 添加为区域主操作，连接/管理为次级按钮，详情始终可见；按钮保持36px、图标34px，粗指针44px。子页按钮按内容宽显示；编辑增加文字；身份说明12px可换行，审阅确认区保留服务与接收地址并去除重复分隔。
- 原企业介绍、场景、资源、会员和定制入口完整保留；六个横排Tab保持。源码核对仅服务样式与`renderEnterprise`变化，原企业内容模板字节未改，HTTP预览与文件一致。

最终候选SHA-256：`0f86e4ab2b6ef2f18f3b42958e6dd90638ba110a1cc9498c7964da02dc4fd4c9`。两位独立AI评审按固定五维复评：**设计98/100、UX审阅99/100**，均无阻断；首版94/96及基线85均保留，未继承旧评分。实际看图与报告依据、具体扣分及未测范围见[独立评审证据](../evidence/service-density-review-20261031.json)。仍有细微非阻断扣分：解除关联较身份说明醒目、状态/底栏小字，以及“打开管理页”与离线预览目标的措辞差异。

初版布局16/16离线检查通过；随后文字与子页对齐修订，仅重跑最终同SHA的4条必要检查：原内容/列表、键盘/触屏/焦点、连接→关联→同步→管理完整链、主题，均PASS且零页面错误/真实服务请求。**不将初版16项记为最终SHA重跑结果。** 一次原资源块截图的最近滚动停在底栏下1.17px，现仅将截图驱动改为明确居中，原完整可见断言保留；失败及诊断证据保留。

[最终服务区截图](../../../../artifacts/cookie-enterprise-density-20261031/candidate-2/overview-final/service-region.png) · [候选与验证清单](../../../../artifacts/cookie-enterprise-density-20261031/candidate-2/candidate-manifest.json) · [设计取舍](./SERVICE-CONNECTIONS-DESIGN.md#服务连接密度续轮2026-10-31)。真实服务、Native、安装、正式React和完整无障碍验收均 **NOT_TESTED**；宽度/缩放矩阵不在范围。下方记录为先前候选历史。

## 企业页内容保留与服务连接打磨（2026-10-31，前轮保留记录）

唯一主原型 [cookie-editor.html](./cookie-editor.html)，[运行中的企业预览](http://127.0.0.1:58626/cookie-editor.html?view=enterprise)。无需构建，双击 HTML 也可操作。当前是 **DESIGN_PREVIEW_ONLY**：复用原 58626 只读静态服务，未切换 Browser 开发环境。

本轮先比对 Git 基线并实际滚动核查。原内容没有丢失，但此前服务列表插在介绍和团队场景之间，使原页主体移到下方。现把服务区放到完整原静态内容之后，介绍末尾提供“服务连接”跳转；返回概览恢复顶部。原企业介绍、三个团队场景、四项资源、示例解释、官方席位和定制入口连续默认展示，六个横排 Tab、Cookie 与账号入口保留。

| 原版区域 | 本轮对应与验证 |
| --- | --- |
| 企业介绍、三个团队场景 | 原 `.custom-hero` / `.custom-features`；完整原文和相对顺序保留，截图 `overview` / `original-team-scenarios` |
| 四项企业资源及示例说明 | 原 `.custom-usage` / `.custom-callout`；席位、预算、未接入和 progress 语义保持，截图 `original-resource-overview` |
| 官方会员/席位、企业定制与离线说明 | 原 `.enterprise-cta` / `.note`；官方 URL 和新标签安全属性保留，定制跳转已点击验证，截图 `original-membership-and-custom` |
| 六 Tab、原 Cookie 和账号 | 横排入口顺序保留，Cookie 页及三个已保存账号实际打开核对 |

渲染后的完整原内容块与 Git `2bac158e479bb069f51435f9e0450ac83f3bc769` 一致（比较时仅去掉新增跳转按钮和标题焦点属性）。这项比对覆盖全部原节点、文本、示例值、入口和相对顺序，不以列出的几个标题代替完整性。

服务主操作保留文字，详情改为轻量文字入口，刷新/编辑使用原有图标；操作始终可见，不依赖 hover。没有足够多的低频动作，暂不增加更多菜单。修复侧栏跳转带动整个页面、返回焦点落到视口外的问题；关联核对可以返回修改并保留选择。保存不连接、失败保留输入、草稿保护和未知结果锁写入继续保留。复评前另修复普通快照表单更新遗漏版本递增、切站未撤销关联/授权，以及放弃草稿换Tab焦点丢失；均按真实操作先复现再回归。解除关联改用文字并将焦点留在关联区域；页头明确为“网站已授权”。原静态说明仅提升文字对比至5.66–6.01:1，内容和顺序不变。

必要离线 Chromium 检查共 **16/16 PASS**，零页面错误、零真实网络请求。包含原区域实际可见性、键盘/触屏、焦点与滚动、配置与连接、关联回退、同步范围和受影响状态保护；默认窗口/缩放，没有宽度矩阵。候选 SHA-256：`8a17860e9f07bd483d3b0acd2ae4fc5f63ca718d85ff4f4751bf430dbc6d020a`。

```sh
node examples/sidebar-tools/cookie-editor/tests/service-preview-interactions.mjs
```

脚本默认证据写入 `artifacts/cookie-enterprise-preservation-20261031/`，本轮最终证据在其 `final/` 子目录；可用 `COOKIE_SERVICE_EVIDENCE` 指定独立目录。新截图与 `interactions.json` 绑定候选 SHA；同候选独立复评：设计99/100、交互98/100，均无阻断问题；这是本轮重新评分，不继承上一轮99分。首轮本轮独立评分为94与88，原记录及修复前失败证据保留；不能用只覆盖旧路径的13组PASS替代最终16组结果。方案比较和范围见 [SERVICE-CONNECTIONS-DESIGN.md](./SERVICE-CONNECTIONS-DESIGN.md)，历次评审保留在[评审证据](../evidence/service-design-review-20261031.json)。历史 `artifacts/cookie-enterprise-design-20261031/` 保留不覆盖。

剩余非阻断扣分：长审阅页滚动至确认区后标题/返回不在视口；原未选中Tab与底栏小字仍偏浅（约3.97:1）。完整读屏与深色全部子页未做正式无障碍验收。

[原企业区域截图](../../../../artifacts/cookie-enterprise-preservation-20261031/final/original-resource-overview.png) · [服务区截图](../../../../artifacts/cookie-enterprise-preservation-20261031/final/service-region.png) · [最终交互报告](../../../../artifacts/cookie-enterprise-preservation-20261031/final/interactions.json)

本轮只交付交互设计。正式 React、可信模块、安装 JSON、真实公司授权、Native 及生产集成 **NOT_TESTED**。下面各版本记录只代表其历史阶段。

## AI 账号额度管理中心 · R1 交互预览（2026-10-29）

- **[Cookie Editor 主预览](./cookie-editor.html)**：保留原 R2.5.4 六 Tab 及账号列表、切换、设置、新建功能，在 320–440px 窄侧边栏的「账号 → 已保存账号」右侧按条件显示纯图表 Icon-only 入口（与设置、添加图标同尺寸；保留 aria-label/title）：仅当该网站具有已登记的 AI 额度查询能力且存在已保存账号时显示；普通网站、未接入额度能力的 AI 网站和空账号状态不显示。点击在新标签页打开独立网页；未新增 Tab、未改既有 Cookie/账号业务。
- **[独立额度管理中心](./ai-account-usage.html)**：全屏 HTML 交互预览，包含公司账号总览、5 小时/周额度剩余、重置时间、临近重置与待验证状态、搜索筛选、账号详情、刷新占位。所有账号及百分比均为**虚构设计数据**，刷新不请求真实网络。
- **按能力显示，非 AI 网站通用入口**：本次静态原型的 `usagePreviewProviders` 是演示注册表，只为 `chatgpt.com` 模拟启用 `codex.rateLimits.read`；`shop.example.com`、`docs.example.org` 和无账号状态不出现额度图标。正式实现不得依赖硬编码网站或「AI」关键词推断，需由独立服务公布已授权、已实现的能力与账户映射。支持该能力但会话过期时仍可打开管理中心显示 AUTH_REQUIRED，不能假装 0%/100%。正式 React 及 Host 接线 NOT_TESTED。
- **技术方向**：Cookie Editor 仅提供账号入口；独立 Node.js 服务负责本地可信快照同步与逐账号隔离 HTTP 查询；React 网页只获取已脱敏额度数据。Cookie-only 为首选待验证路径，若服务端需短期访问令牌则通过合法会话补充；严禁从独立网页传输或暴露 Cookie、Token，不自动切换当前 Chrome 账号。
- **当前状态**：DESIGN_PREVIEW_ONLY。未修改正式 React 业务代码；真实 Cookie-only 查询、双账号并发、Node.js 通信、官方额度比对及 Mac Chrome 验收均为 NOT_TESTED。独立页面不是完成数据接入的证据。
- **侧边栏视觉纠偏**：此前对话附件把 Cookie Editor 错误演示为桌面双栏、左侧竖向菜单；该附件不代表正式原型，已废弃。Cookie Editor 的六个 Tab 必须继续在窄侧边栏顶部横排，只有独立额度后台允许全屏桌面布局。新的额度入口为纯图表 Icon-only 按钮，右侧仍是原有设置、添加图标；正式 React 接线及 Mac Chrome 点击读回未执行。
- **原型基线说明**：保留原 R2.5.4 的原始账号页面结构；本次批准范围仅为额度入口的增量。旧视觉锁如果限定整文件字节，需在后续落地时按批准变更差量校验，不能因为旧 Hash 不匹配而自动认为新增业务已经验证。

# 当前预览入口（2026-10-29）

- **唯一主原型：R2.5.4 `preview/cookie-editor.html`**（2026-10-29；正式 `main` 提交 `932a1e70d6ea65a0b79764a7d299a8237c541bbb`）。已确认交互：账号顶部当前快照无背景更新图标，账号列表恢复已应用/切换/更多；新建账号默认选中全部 Cookie、明细可展开，顶部保存成功后返回列表并提示底部 Toast；分享配置匿名链接排在指定用户之前且默认选中。此文件是独立 HTML 模拟数据，**不代表正式 React/可信 Cookie 写入已同步完成**。
- **后续实施规则**：仅以该主原型作为设计/交互契约，对照 `app/`、`trusted/`、`src/react.css` 的正式既有实现做增量接线；禁止从模拟脚本复制虚构 Cookie、绕开 Host/SDK，禁止创建平行 Mock。历史截图、旧版本原型、视觉审计锁及旧测试证据不得冒充该基线的正式通过。


- **最新经用户交互评审的 HTML 视觉参考：** [cookie-editor.html](./cookie-editor.html)。六个 Tab（Cookie / 账号 / 企业 / 市场 / 定制 / 圈子）、Cookie Expiration、账号分享七档链接有效期、匿名领取 1/3/5/10 次，以及订阅/外部社群入口；这是**原生 HTML/CSS/JavaScript 模拟原型，非 React，不访问真实 Cookie 或可信 Host**。
- **正式产品同源 React 预览：** [react/index.html](./react/index.html)，必须从 `../app/`、`../src/react.css`、`react/src/` 构建生成，预览虚构数据来自 SDK Mock，不能直接修改生成后的 HTML 代替源码修改。
- **历史兼容入口：** `index.html` 是 R4.6 旧静态预览；`cookie-editor-r4.3-preview.html` 与 `cookie-editor-r4.9.2-approved.html` 是历史参考。为免破坏历史测试/链接，本轮不覆盖、删除或改名，**均不是新的开发视觉标准**。
- **UI 迁移原则：** 从 `cookie-editor.html` 提取布局/样式/可访问交互转成真正 JSX；仅复用可信 Controller、SDK Adapter、Host、Domain、安全边界和经验证的账号操作。**禁止**把演示账号/Cookie、DOM 内事件代理、伪结果或任意 HTML 脚本直接搬进生产 React。
- **发布门槛：** 先完成正式 React 同状态视觉和功能，不对安装 JSON、生产身份、Trusted Host 或安全权限做无证据变更；实际构建、CI 和 Mac Chrome 验收分别记录。

---

# Cookie Editor R4.3 原始设计预览

- `cookie-editor-r4.3-preview.html` 延续已确认 R4.3 原始布局；历史 Git Blob `7a129f509814805ab78827eaccbc77a64b20010f` 可从历史找回。2026-10-16 定向修复默认 SameSite=Lax 导致的新建误报未保存，不涉及真实 Chrome 操作。
- 正式 UI 在 `../src/index.html`、`../src/style.css`、`../src/main.js`；`../cookie-editor.opendesk-tool.json` 是可安装包。
- 原型操作仅处理虚构数据。正式 Cookie 读取、显示值、导入导出、写入、删除及撤权必须依赖原有可信 Host 和 `OpenDeskSDK.browser.cookies`，不能把原型脚本直接打包。
- 定向检查：`node --test tests/environment/cookie-editor-r43-parity.test.mjs tests/environment/cookie-editor-ui.test.mjs`；安装包再通过 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor` 复核。

- R4.5：打开新建或编辑即 clean；仅实际变更为 dirty，撤销恢复 clean；空白新建可直接取消、切换或离开。正式 src 使用字段快照进行相同判断。

- R4.5.1 补充：编辑被遮蔽 Cookie 的值字段后再次清空，是明确写入空值的意图，仍属于未保存状态；未触碰的空值输入框才表示保留旧值，模拟逻辑与正式 Chrome SDK 契约一致。

## R4.6 唯一可编辑主预览（2026-10-16）

- **主入口：** `preview/index.html`，由原始确认 Git Blob `7a129f509814805ab78827eaccbc77a64b20010f` 的完整 HTML 派生，继承 384px 设计、原位编辑和显式导入／导出／新建工具栏。无需构建，`file://` 打开即可交互。
- **历史基准：** `preview/cookie-editor-r4.3-preview.html` 是原版预览文件路径；已确认的原始内容为 45,133 UTF-8 字节。请特别注意：2026-10-16 并行提交对该路径做过定向修补，因此当前 main 此文件可能不再与历史 Blob 完全同字节；R4.6 主入口明确使用不可变 Git 历史 Blob 作为输入。未在本阶段回滚或覆盖其他 Agent 的提交。
- **改动边界：** UI 状态机、语义化 dirty 基线、空白新建、取消、筛选不丢草稿、排序、导入冲突信息、显式敏感备份确认、模拟失败保留草稿、空列表／只读／受限／深色等场景。实验台和模拟数据永不迁入正式工具。
- **正式产品：** `../src/index.html`、`../src/style.css`、`../src/main.js` 由 `../tool.config.json` 作为正式打包输入；安装包 `../cookie-editor.opendesk-tool.json` 不受本次预览修改影响。
- **阶段门槛：** 预览先由用户审核确认，**确认前不得因本预览自动迁移正式源码或更新安装包**。
- **定向自动回归：** `node --test tests/environment/cookie-editor-preview-r46.test.mjs`。这些测试是模拟状态与 DOM 事件回归，不能替代 Playwright/Chromium 真浏览器截图及真实 Chrome Cookie Host 验收。
- **R4.6.1 Value 语义：** 编辑已有 Cookie 时，空白 Value 输入框初始代表“未触碰、保留旧值”；用户输入后再次清空是明确写入空字符串的待保存意图。可点击“撤销值修改 · 保留旧值”回到 clean 状态。新建时输入后删空则恢复初始 clean。此处仅预览模拟，不修改正式 Chrome Cookie。
- **R4.6.2 Partition 安全：** 预览导入不将已分区 Cookie 与同名、同域、同路径的未分区 Cookie 当作同一身份；没有精确 PartitionKey 的分区 JSON 直接报错，不会隐式转为普通 Cookie。正式产品须继续使用可信 Host 的 Store/Partition 精确身份。

## R4.7 — 导出文本复制与文件下载双入口（2026-10-16）

- 唯一主预览仍为 `preview/index.html`；在原位导出表单中显示「复制到剪贴板」和「导出文件」，不再显示「导出模拟文件」等不适合正式产品的按钮文字。原 384px 视觉、R4.3 黄金 Blob、导入、编辑、Dirty 逻辑保持不变。
- 两个操作从同一个格式化过程生成相同内容；默认 JSON 仅导出不含 Value 的元数据清单，不可恢复登录。Cookie Header / Netscape 需要敏感值并受格式损失和分区限制约束。
- 「包含 Cookie 值」时，分别使用本站值读取授权及每次操作的最终确认；复制确认文案明确提醒系统剪贴板可被其他应用读取，下载确认说明文件泄露风险。取消确认不产生复制或文件。
- 复制采用浏览器页面 `navigator.clipboard.writeText` 演示成功／拒绝／不支持场景；仅在写入 Promise 实际完成后报成功，失败保留导出面板并提示可使用「导出文件」。文件采用原下载机制。**此处只操作虚构数据，不代表 Chrome/Host 已授权或真实复制能力已验收。**
- 定向回归文件 `tests/environment/cookie-editor-preview-r46.test.mjs` 新增剪贴板模拟测试。后续正式扩展迁移必须使用**现有公开 SDK** `OpenDeskSDK.browser.cookies`、`OpenDeskSDK.browser.clipboard` 和 `OpenDeskSDK.browser.downloads`（以实际 SDK 接口为准），继承真实网站身份、Store/Partition 精确权限、敏感值读授权、Epoch 失效保护，**不得把预览模拟脚本迁入产品**。
- 正式 `../src/index.html`、`../src/style.css`、`../src/main.js`、`../tool.config.json` 和安装包本轮均未改动；用户在新一轮明确授权后方可迁移正式 UI。


## R4.9.2 · 已确认的 UI 基线（2026-10-16）

- **React JSX/CSS 唯一候选：** `react/src/App.jsx`、`react/src/style.css`；用户确认左右布局、默认含值 JSON 备份、复制/下载两按钮及内联敏感确认。
- **设计冻结快照：** `cookie-editor-r4.9.2-approved.html`，独立可点击的虚构数据预览；此静态快照由本地 React16 兼容测试环境生成，仅作为用户确认的视觉和行为参考，不是 React19 构建、浏览器授权或正式工具。
- **真实 React19 产物：** `react/index.html` 必须从上述 JSX 通过 `npm run build` 生成，经 Chromium E2E 后由现有 `cookie-editor-r49-react-preview.yml` 晋升。旧产物不可自动视为与 R4.9.2 源码一致。
- **正式扩展保护：** 当前配置版本 2.0.14 的 `src/`、安装包、SDK/Host、本目录 R4.3 与 R4.6 历史预览本轮不变；正式业务迁移下轮才进行。
- **本地校正证据：** 8 组 Chromium 回归 PASS，320/384/520px 值显示图标中心偏差 0px；React19 构建、最新 CI、真实 Chrome 安装需分别核验。

## React 19 离线审核入口 · 380px 侧栏（2026-10-17）

- **当前推荐审核：** `preview/react/index.html`，React 19 与 CSS/JS 均内联的独立 HTML；宽屏打开时 Cookie 面板仍保持 380px，直接双击可用，无须构建或安装开发环境。
- **历史 R4.9.2 确认版：** `preview/cookie-editor-r4.9.2-approved.html` 已同步调整为 380px，但仍是 React 16 兼容快照，不是 React 19 产物。
- **唯一维护路径：** React 源码位于 `preview/react/src/`，修改后使用 `preview/react/package.json` 的 `npm run build` 重新生成并提交 `preview/react/index.html`；`npm run check` 验证源码与 HTML 构建一致性，`npm run test:chromium` 做真实 Chromium UI 回归。仅审核现有 HTML 无须执行这些命令。
- **历史预览保护：** `preview/index.html` 仍保留 R4.6 版本；此处不改正式工具源码或已安装 JSON 包。


## R4.10.4 · 导入／导出工具栏图标统一（2026-10-17）

- React 19 主预览 `preview/react/index.html` 与唯一 JSX 源码 `preview/react/src/App.jsx`：导入使用向下进入托盘，导出使用向上离开托盘，与正式 `src/index.html` 的方向一致。
- 旧入口 `preview/index.html` 仅交换工具栏文件向下／向上图标；冻结的 R4.9.2 approved 和 R4.3 原始历史文件不改写。
- 导出面板内的「下载」仍用向下图标，导入面板内的「选择文件」仍用上传/选取图标。工具栏按钮保持 34×34 CSS px、title 与 aria-label。
- 增加 React Chromium 图标方向回归与 R4.6 静态语义回归；预览只有虚构数据，不能代替真实 Cookie Host 验收。
