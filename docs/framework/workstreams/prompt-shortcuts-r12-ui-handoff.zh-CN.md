# OpenDesk Browser Prompt Shortcuts R1.3 — 内容优先 UI 修订、双原型与跨 AI 平台架构接续

日期：2026-10-15。状态：**R1.3 双 HTML 模拟 UI 已增量写入 main；正式工具、网页注入、原生权限与真实 Chrome 均未验收**。

本文件是 Prompt Shortcuts 的**唯一主接续记录**。它保存产品边界和证据，不把模拟测试提升为真实 Chrome 验收，不取代 `AGENTS.md` 与现行 SDK/Design System 合同。

## 1. 原型和仓库证据

- **ChatGPT 网页主原型**：[`prototypes/sidebar/chatgpt-prompt-shortcuts-r12-preview.html`](../../../prototypes/sidebar/chatgpt-prompt-shortcuts-r12-preview.html)。原型最初入库提交 `f8d6d4a7bc7a7e318f07a87736df870517d4b1ee`；后续在 `86b877c1f71c861c34d9a85d08146ab99c83465d` 添加独立侧栏预览入口，没有变更左侧定位业务决定。
- **独立 Side Panel 管理原型**：[`prototypes/sidebar/chatgpt-prompt-shortcuts-r12-sidebar-preview.html`](../../../prototypes/sidebar/chatgpt-prompt-shortcuts-r12-sidebar-preview.html)。入库提交 `94c2eacc6a443bdf2d86b1dfb6192e09429aeebb`，文件内容已与对话生成的 HTML 快照完全核对。
- 两份预览可相互导航；**两个独立 HTML 的模拟内存不跨文件共享**。独立侧栏原型内部的管理和左侧网页按钮使用一份模拟数据，正式版本须通过真正的工具存储和消息同步实现。
- 2026-10-15 本轮确认 `examples/sidebar-tools/chatgpt-prompt-shortcuts/` 与 `examples/sidebar-tools/prompt-shortcuts/` 均尚不存在；此前 `page.prompts` 运行时未接入，下一轮仍应重新核对实际 HEAD。跨平台正式工具建议采用不绑定网站的唯一 ID `prompt-shortcuts`，**不得与旧拟议 ID 同时创建两个工具**。

## 2. 固定产品与体验决定

1. 用户打开 ChatGPT 网站，看到**主内容区域左边缘**、整体竖向居中的短标签按钮栏。水平方向贴近主区域左侧边缘（原型基准为 12 CSS px），**不**对齐居中的正文文本列，也不对齐输入框，不伸入 ChatGPT 历史导航栏。窄屏时安全折叠，绝不悄悄换到右边。
2. 每个短标签为 1–2 个可见字符（自动值取正文开头两个 Unicode 字素簇，支持中英文和表情符号），两个字符上下排列；默认圆角方形，可按条目选择圆形。悬停和键盘聚焦显示完整名称和**完整多行提示词正文**；点击仅插入当前草稿，不自动发送。
3. 正式工具管理属于 **「扩展」→ 已安装应用 → 提示词快捷按钮**，不新建 Chrome Extension，也不新建第六个 OpenDesk 一级 Tab。使用 **列表 → 新建/编辑 → 返回** 的独立子视图；列表每项高频操作为编辑、更多；更多可启停、排序、复制、确认删除。
4. 全局提供两个相互独立的滑动开关：**网页左侧按钮**与**选中文字快速添加**。关闭右键快捷添加后，不删除已保存提示词，也不改变左侧按钮栏；关闭左侧按钮栏不影响已有提示词管理。
5. 用户选中文字 → 现有 Chrome 原生右键菜单 → 一次性领取选区 → 侧栏新建表单预填 → 审阅后显式保存。必须使用已有 `browser.contextMenu`、`browser.launch.consume`、权限/文档身份与菜单启停链；**不可单独开发第二个菜单 Worker/第二个扩展**。
6. 每项只要求提供**非空多行正文**；短标签、名称、形状和启用状态均可选填，短标签与名称缺省时均取正文开头两个非空白可见字符；形状默认圆角方形、启用默认开启。落库存储有效短标签/名称及 `labelAuto`、`nameAuto` 来源标志以支持再次编辑时随正文重新生成；还需保留稳定 ID、顺序。保存冲突、配额超限、未知结果、表单离开时要保留草稿并给出明确提示。
7. **第一批只适配 `https://chatgpt.com`，但独立工具与数据模型必须支持后续多个 AI 网站**；新网站必须显式新增经过审计的页面适配器、授权范围与测试，不能扩大默认 host 权限。不读取或上传聊天历史；工具包正文视为纯文本；隔离 Sandbox 不允许直接取得目标网页 DOM。网页渲染/插入只能由已审计的固定可信模块完成。

## 2A. R1.3 新增最高优先级 UI 合同与平台扩展边界

**新建/编辑顺序：内容正文（唯一必填）→ 按钮展示（短标签/显示名称，均选填）→ 按钮形状与启用开关（保留默认即可）→ 保存/取消。** 进入表单将焦点置于正文。列表页先展示提示词列表，再展示两个全局开关与网站权限，避免设置压住核心操作。

- 仅填写提示词正文就可保存；空正文或只有空白时明确阻止保存，完整正文不会截断、改写或自动发送。
- 短标签未填时，从正文去除前导空白并略过空白字素后取**最前两个可见 Unicode 字素簇**；不足两字时可只取一个。名称未填时遵循同样的前两字规则，用户可另填完整名称。主动填写任一字段时必须尊重用户值；允许 1–2 个自定义 Unicode 可见字素作为短标签，不能把英文/表情误判无效。
- 预览实时显示**最终保存**的标签与名称。入库时保存 labelAuto/nameAuto，下一次编辑若为自动值则保持输入框为空并依正文重新计算；不能把自动值误认成用户手动命名。原有 R1.2 示例无 flags 时视为手动值，避免意外改写。
- 两份 HTML **沿用 R1.2 文件名**，只增量修改对应源文件，不创建同用途的新原型。R1.3 两份原型均已更新，V8 内联 JS 语法检查、表单必填/顺序/自动标记静态检查与 6 组中英、空白、emoji 默认值用例汇总 **11/11 PASS**；这仅是源码级定向校验，**不是浏览器交互 PASS 或 Mac Chrome 原生验收**。
- 正式工具取中性身份 **prompt-shortcuts**，原定 chatgpt-prompt-shortcuts 仅作为历史原型命名，不再作为未来全部 AI 平台的产品身份。如果执行时发现他人已经创建正式目录，先核对工具安装身份和数据迁移，不得重复安装、静默替换或建立两个同类工具。
- **先把 ChatGPT 全链路做完**，未来再逐个平台开放。第一批仅需一个最小 ChatGPT 可信页面适配器，留出轻量契约（网站 URL 精确匹配、主内容区定位、编辑器发现/插入、SPA 变更/清理）。各 AI 平台选择器与输入行为都留在独立适配模块，通用提示词列表/表单/存储不依赖任何网站 DOM；禁止造通用网页注入新引擎、预写大量未验证 Provider 代码或默认请求全部网站权限。
- 第二个平台的加入必须满足新增适配器、独立来源授权、真实草稿插入与撤权清理测试，不以“目录里声明了多个平台”冒充正式支持。Claude/Gemini 等只作**后续候选**，非本轮已实现范围。

## 3. 原型验证事实（不能冒充真机）

- Chromium `144.0.7559.96` 在 headless 浏览器中通过 Playwright `page.set_content` 完成 **38/38 项模拟交互与布局断言**；原生 `file://` 和本地 HTTP 导航在此次测试环境被管理员策略阻挡，故不宣称已实测独立 URL 加载。
- 验证范围包括：列表 4 项/启用态、两个开关独立性、左侧 12 CSS px、纵向居中（偏差 0px）、完整 Tooltip、模拟编辑器插入、右键开关与选区预填、写入失败/并发冲突/未知结果及草稿保留、明确离开确认、排序/启停/删除确认、模拟权限撤销/恢复、新建与圆形按钮、8 KiB JSON 超额拒绝、暗色、320/360/420/520 CSS px 无侧栏横向滚动、无前台 JS 异常。
- `node --check` 对 HTML 内联 JS 抽取稿通过；模拟脚本和图片只在生成会话的验证目录内，无发布包绑定。
- **正式应用存储、Chrome 原生菜单权限、真实 ChatGPT 富文本编辑器、中文输入法、跨标签同步、Mac Chrome 安装、生产构建及真正发布：`NOT_TESTED`**。

## 4. R1.3 顺序：先界面评审，再核心实施

**阶段 A — UI 评审与最小修正（先完成）**
- 打开两份已入库 HTML，检查 ChatGPT 左侧定位及 Side Panel 的 Index/Create/Edit/Permission/Confirm；不从零另做新原型。
- 允许仅定向修改影响操作的布局、焦点、Tooltip、禁用态、文案与表单；以 `src/ui/design-tokens.css` 和 R27/R28/R31 为权威，预览不得另建立生产组件系统。
- 分别评价信息架构、视觉一致性、内容可读性、操作可发现性、窄宽度、键盘与辅助技术、错误恢复、功能完整性；目标逐维 95+。原型达到评审标准才冻结相应 UI 设计；设计分与原生交付分分开。

**阶段 B — Sidebar Tool 真实实现（核心功能优先）**
- 在 `examples/sidebar-tools/prompt-shortcuts/` 开发唯一、平台中立的工具包；使用现有 `OpenDeskTool.root/request('storage.get'/'storage.set')`、`ifMatch` ETag、`OpenDeskTool.setState`、官方构建器与现行 `od-*` 设计语义；不创建新安装器。
- 将 R1.3 内容优先 Side Panel 子视图、开关、列表排序、创建/编辑/删除/复制和保存失败恢复转换为真正的运行代码；校验存储中一项完整 JSON 的 UTF-8 字节数（现行单项 8192 B，工具总计 32768 B、最多 32 键），不得按字符数估算。
- 增量接入既有官方目录。新增许可前先核对 `MAX_INSTALLED_TOOLS`、安装来源和其他工具清单，不覆盖现行并行工作。

**阶段 C — 可信网页模块与授权**
- 调查 `src/entrypoints/page-relay.js`、`src/knowledge/page.js`、`src/reading-toc/page.js` 与当前固定源码接线机制，给工具独立模块、宿主仅最小通用权限分发。
- 审计 `page.prompts` 新能力所需的 schema、可信来源、工具身份/安装代际、单站点授权、撤权和卸载清理；声明不等于运行时完成。
- 位置以**主内容区域左侧**计算，适配 ChatGPT DOM 更新与 SPA，避免遮盖原生导航、聊天正文和输入框；按钮 Tooltip/聚焦/窄屏保留；与 R1.2 双原型对照。
- 插入时安全识别 React 编辑器和有效选区，确保不覆盖原草稿、支持多行/中间插入/撤销/中文 IME、过期请求取消。真实站点行为若无实验环境，标 `NOT_TESTED`，不能假装完成。

**阶段 D — 原生选区菜单复用**
- 以现有 `src/platform/chrome/context-menus.js` 和 `examples/sidebar-tools/browser-sdk-r13/selection-notes.opendesk-tool.json` 为参考，复用同一安装/Origin/Document/单次选区票据链；菜单项仅作用于已允许的 ChatGPT 网站。
- 全局开关关闭时原生菜单确实不出现；工具停用、权限撤销、文档更换及超时后不能消费旧票据。选中正文只预填表单、绝不静默保存或发送。

**阶段 E — 分步验证与安全收尾**
- 先执行模型/权限/存储/网页定位/菜单/输入的定向 Node 测试和必要 Chromium 模拟回归；核心代码稳定后再协调唯一 build writer，执行 production 构建、包校验和锁归属核查。
- 实际 Mac Chrome 和已登录 ChatGPT 只有在可用环境真实执行后才计 `PASS`；分别记录 Node、模拟 Chromium、已安装扩展 Chrome、真实 ChatGPT、Mac 中文输入法的证据等级。
- 只在 `main` 写入本任务文件、普通推送，避开书签、SDK、AI VIP Share、广告拦截等并行任务；不强推、不断开他人的 watcher、不开新分支或 worktree、非必要不重跑全仓测试。各维度 95+ 目标必须有真实证据支持。

## 5. 下一轮最小接续动作

1. `git fetch origin main`，检查 `AGENTS.md`、最新 `main`、本任务文件以及并行所有权。
2. 打开双 HTML 原型完成**Side Panel UI 交互评审**，先处理用户指出的界面问题；已经确认的左侧位置与右键开关不再争论。
3. 依据 R1.3 内容唯一必填与多平台架构合同，按阶段 B/C/D 顺序先完成 ChatGPT 核心功能；暂不开始大规模最终原生验收。
4. 提交前说明本轮改动范围、实际测试与待验收项；有冲突时只暂停相交文件。

**一屏目标：** 已安装平台中立的 Prompt Shortcuts 工具可只凭提示词正文在侧栏安全创建、编辑、启停和管理快捷按钮；打开真实 ChatGPT 后主内容左边缘展示工具栏，点击将完整正文插入草稿、用户自行发送；右键选区快捷添加可独立开关。


## 6. R1.4 内容优先正式源码实施（2026-10-15）

本节追加于 R1.3 交接；历史模拟与原型记录保持原等级，不冒充原生 Chrome 证据。

### 6.1 源码与产品

- 独立工具唯一身份 **prompt-shortcuts**，源码在 examples/sidebar-tools/prompt-shortcuts/，采用既有 Sidebar Tool v2 格式、Sandbox、存储、工具启停、正式安装器；不新增 Chrome Extension、Worker 或第五个以上产品 Tab。
- 管理 UI 使用正式设计系统共享 CSS，列表位于顶部、全局设置位于后部，表单正文唯一必填、优先置顶。可选名称与短标签采用完整 Unicode 字素，自动值来源单独保存；支持排序、启停、复制、确认删除、错误留草稿。
- 隔离存储键 library，单项上限 8192 UTF-8 字节，沿用带 ETag/ifMatch 的可信存储写入；拒绝静默截断与覆盖并发修改。
- 只新增 **page.prompts** v2 能力，页面内容由固定可信适配器 trusted/page.js 和精确来源授权 trusted/policy.js 控制。ChatGPT 站点只有 https://chatgpt.com；内容模型和 Sidebar UI 不依赖 ChatGPT DOM，未来平台需单独适配器及权限审查。
- 按钮授权绑定工具包摘要、版本、安装代际及用户授予的单一站点；撤权/停用/卸载后安全清理。工具 Sandbox 无权自行访问 ChatGPT 网页 DOM。固定内容脚本只使用已知编辑器选择器、浏览器原生 insertText 指令，避免直接改写 React 管理的 DOM 值；插入仅草稿、绝不点击发送，失败提供可手动复制的完整正文。
- 原生选区菜单使用既有 browser.contextMenu / browser.launch.consume 和 Chrome 可信宿主，选区票据仅预填新建，不后台存储。网页按钮开关独立于原生菜单开关，两者网站授权和启停分离。
- official-tools/catalog.json 增加 **optional** 源条目；正式可安装发行包仍需由唯一 scripts/build-official-tools.mjs 生成，**仅将源文件纳入官方来源清单不意味着正式包已生成或用户已安装**。

### 6.2 可信证据

| 检查项 | 结果 | 可信范围 |
| --- | --- | --- |
| R1.3 双 HTML 模拟 | 继承上文历史结果 | 非原生 |
| R1.4 Unicode/默认字段/验证逻辑 | **13/13 PASS** | 本轮实际运行的 V8 定向函数断言 |
| R1.4 Node 包/权限/站点模型 5 组测试 | 已编写 | 尚未取得 node --test 运行记录，不能记 PASS |
| 官方 build 与发行工具包 | NOT_TESTED | 需唯一构建者验证 |
| 已安装 Mac Chrome、原生菜单与真实 ChatGPT | NOT_TESTED | 需要实际登录页面与授权交互 |
| 多行、Undo、中文输入法、SPA、BFCache、撤权和卸载 | NOT_TESTED | 需真实网页与生命周期测试 |
| 逐维 95+ 评分 | NOT_SCORED | 缺失对应专家/真实浏览器证据 |

### 6.3 最短后续链路

1. 在真实仓库环境运行 node --test tests/environment/prompt-shortcuts-r14.test.mjs tests/environment/official-tools-catalog-r45.test.mjs，修复实际失败，不重跑无关测试。
2. 协调唯一 build writer 运行官方工具包生成、production build、bundle/权限预算差分检查；不停止其他 Agent 的 watcher 或服务。
3. 在用户 Mac Chrome 正式安装并打开工具：仅凭正文新建保存、授权 ChatGPT 网页按钮、主内容区左边缘竖直居中展示、插入已有草稿、明确人工发送。
4. 原生菜单开启→选中文字→领取选区预填→审阅保存；测试两个开关独立性、编辑/排序、关闭 Side Panel 后存续、撤权与卸载实时清理。
5. 真实测试 IME、Undo、SPA、BFCache、不同 Chrome viewport、并发写入/未知结果。分别在此处追加候选 SHA 和 PASS/FAIL/NOT_TESTED。未通过真实路径前不宣称 95+ 或最终验收。

**正式目标始终是用户完整操作闭环，而不是文件数、原型数量或宣称的通过率。**


### 6.4 第一轮主分支 CI 后的安全构建修正

首次提交 bf72ab8c（2026-10-15）触发的 production bundle gate **FAIL**：scripts/bundle-provenance.mjs 正确拒绝 examples/sidebar-tools/prompt-shortcuts/src/model.js 直接进入受信任 page-relay。保持此安全 gate，不扩大通配目录。

修复原则：仅将模型作为审计过的 trusted/model.js 同源资源（仍位于独立工具目录）；Side Panel 沙箱通过 tool.config.json 的 v2 fixed Classic dependency 加载同一源码，可信网页适配器从固定 trusted/model.js 静态导入。固定 bundle provenance 只对白名单内三个完整 Git blob（model/policy/page）以及已存在的 agents/page-relay.js、ui/sidebar-tool-host.js 两个产物放行。每次修改这些代码必须重新核对其 Git blob SHA 并重新审计；不是目录级通配或提升沙箱权限。

首次 CI 中另有大量并行 AI VIP Share 锁模拟与 Cookie Editor 便携包快照不一致；这些失败不归属 Prompt Shortcuts，本任务不修改其源码以粉饰全仓通过率。**修复版是否能通过真实 build，以后续同一修复候选的 CI 结果为准。**


### 6.5 R1.4 独立 CI 成功证据与卸载安全补齐（2026-10-15）

- 真实 GitHub Actions：`Prompt Shortcuts R1.4 scoped tests`，Run [38735041527](https://github.com/shopable-ai/opendesk-browser/actions/runs/38735041527)，绑定提交 `2872b03544714d61766b40eb2dd1b21dbfbb6983`，**六组 Node 测试 6/6 PASS、固定语法检查 PASS**。测试范围：Unicode/自动默认值、数据验证和旧来源标记、v2 工具包的实际 packer、精确 ChatGPT Origin/安装代际/撤权、网页固定插入路径代码规则、严格 Git blob 来源白名单。不要将此记录提升为真实浏览器测试。
- 在此之后通过源码复核确认一个新增缺口：通用安装器的卸载恢复和移除能力后的站点授权清理尚未覆盖 `page.prompts` 专用 `opendesk.sidebar-tools.prompt-sites.v1`。可信页面因为还会验证安装身份而保守拒绝，但旧权限元数据可能残留。继续复用原 `cleanupUninstalledToolLocked`，把该键加入已批准的清理集合；存储清理不得影响同一 Store 内其他工具的记录，旧卸载票据不能删除后来重新安装的同 ID 工具。
- 补充 `tests/environment/prompt-shortcuts-r14.test.mjs` 的真实模拟 `storage.local` 清理测试与同 ID 再安装保护。第七组模拟 Chrome local storage 的卸载恢复测试已于 [Run 38735823378](https://github.com/shopable-ai/opendesk-browser/actions/runs/38735823378) 执行，绑定 `57bad486096bc1bc476402248cc77a01a2c6a2ac`，**7/7 PASS**；不等于原生卸载验收。
- 工具使用与安全说明见 `examples/sidebar-tools/prompt-shortcuts/README.zh-CN.md`。正式生成包及真实 ChatGPT、多行草稿/中文 IME/Undo/SPA 的状态仍为 **NOT_TESTED**，本仓库其他 Agent 的 AdBlock provenance 阻断不应凭该局部 CI 冒充修复。


### 6.6 固定 ChatGPT 页面控制器的动态模拟验证（2026-10-15）

为避免把源代码模式检查等同于网页运行，新增 `tests/environment/prompt-shortcuts-r14-page.test.mjs`。它直接调用正式 `initPromptShortcuts`，以受控模拟 DOM、Chrome storage 及事件验证：未批准来源不渲染；审批后按钮出现；不可信点击不修改草稿；可信点击在已有内容末尾追加多行提示词；关闭网页按钮设置、停用工具、撤销站点授权、跨来源 SPA 导航时清理悬浮按钮；销毁时注销 storage 监听器。

**已执行 CI**：[Run 38737382042](https://github.com/shopable-ai/opendesk-browser/actions/runs/38737382042)，候选提交 `d9c53b0bec7528ba88b0884f0ee81fed59f0593b`，**8/8 Node PASS、语法检查 PASS**。最初模拟元素遗漏标准 `closest()` 导致新增动态测试 FAIL，原始失败 [Run 38736747724](https://github.com/shopable-ai/opendesk-browser/actions/runs/38736747724) 保留；补齐模拟 DOM 标准方法后获得完整成功，不修改生产插入函数以迎合测试。

**证据分级**：Node 动态模拟为 `COMPONENT_PASS`，并非 `INSTALLED_CHROME_PASS` / `REAL_CHATGPT_PASS` / `MAC_IME_PASS`。正式 production bundle 仍受到并行 AdBlock 固定源码摘要漂移阻断；不要绕过原安全审计，也不要将本工具 8/8 当作全仓 95+ 或最终产品交付。下一阶段须协调构建者冻结候选，并在真实 Chrome+ChatGPT 上验证多行/Undo/中文 IME/原生菜单/卸载清理。


## 7. R1.5 真实产品闭环前的 ChatGPT 草稿安全收敛（2026-10-15）

**本节仅追加当前新增修复和证据；R1.4 已通过的 9 组 Node 测试保留历史提交身份。真实安装与真实 ChatGPT 仍未验收。**

### 7.1 本次只修复一个产品关键路径

- 只改动正式 `trusted/page.js` 的 ChatGPT 输入读取/插入确认和点击并发保护：通过受控编辑器读回原草稿、原生 `execCommand('insertText')` 插入、再核对完整原文与多行提示词（包括段落边界和空行），而不再用压平所有空白的 `includes()` 误报成功。现代 ChatGPT 富文本段落的 `textContent` 不携带换行，因此对直接段落子节点逐段读取；其他 DOM 形态保守读回并按一致的完整草稿规则验证。
- 保存 `page.prompts` 的严格网站授权、安装身份、隔离存储和唯一可信适配器。若本次原生插入的结果不明确，显示手动核对/复制提示，不自动重试、重发或篡改 React/ProseMirror 状态；同一时间只允许一个进行中的插入请求。
- 组合输入期间（包括异步站点授权校验期间新开始的组合）直接拒绝网页按钮插入，不强制转移焦点到 fallback 文本框。保留关闭 Side Panel 后页面独立运行、SPA、授权撤销及存储失败保守停止的既有路径。
- 由于可信 `trusted/page.js` 是固定源码模块，其 Git blob SHA 已审核并同步精确更新 `scripts/bundle-provenance.mjs` 和 `tests/environment/prompt-shortcuts-r14.test.mjs`。没有放宽任意目录通配、敏感目标文件或 SDK 权限。
- 增强现有动态 Node 页面控制器测试：双击仅插入一次、输入法组合期无插入，以及“文字保留但换行丢失”必须拒绝成功判定，另补充结构化段落与空行正确通过的定向用例。保持原测试文件，不新增竞争性引擎或 HTML 预览。

### 7.2 候选证据与待验收边界

| 项目 | 结果 | 适用范围 |
| --- | --- | --- |
| R1.4 既有独立 CI | **9/9 NODE_PASS**，Run [38738460330](https://github.com/shopable-ai/opendesk-browser/actions/runs/38738460330)，SHA `374d920fe961c8329dd1a5dfa3a5d3bbf1b25b01` | 历史候选；不自动升级为 R1.5 测试 |
| Linux headless Chromium `144.0.7559.96` 独立 HTML 插入实验 | **6/6 仅模拟编辑器插入且 6/6 撤销成功**：段落、DIV、TEXTAREA；已有草稿、空草稿、换行、空行、中文、Emoji | **模拟 Chromium DOM**；未使用本仓库完整扩展或真实 ChatGPT |
| R1.5 GitHub Scoped Node/CI | **11/11 NODE_PASS、JS 语法 PASS**，Run [38743743798](https://github.com/shopable-ai/opendesk-browser/actions/runs/38743743798)，候选 `1bc0fabcf2e3355decedc6a8df5eea51ed292a3e`；先前 `d564f951` 的 [10/10 PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38742882938) 保留历史证据 | 新增了 IME、双击、空行丢失、段落重建；非原生 Chrome |
| 官方 production 整包构建、固定来源全局 gate | **BLOCKED**，Run [38742882742](https://github.com/shopable-ai/opendesk-browser/actions/runs/38742882742)，首次失败：`[opendesk-fixed-sidebar-tool-host] Trusted AdBlock source changed`，文件 `examples/sidebar-tools/adblock/trusted/host-controls.js` | AdBlock 并行源码固定摘要漂移，非本工具的来源校验失败；不得放宽门槛 |
| 独立 portable v2 package JSON | **PACKAGE_PASS**，官方 CLI 在上述同一 CI 生成 35,083 bytes，SHA-256 `1f09804545c2a654cccab76c1a863c29453b1239b7e387e0d6e4225df3bed412`，`validateSidebarToolPackage`/ID/version/capability/menu/script 均通过；[CI 附件 #11976707456](https://github.com/shopable-ai/opendesk-browser/actions/runs/38743743798/artifacts/11976707456)，保留期 7 天 | 可移植工具 JSON 包，不是整个 OpenDesk Chrome Extension，更不是安装通过 |
| 已安装 OpenDesk Browser + 实时 ChatGPT 草稿 | **NOT_TESTED** | 需相同安装候选下亲自验证完整正文、焦点、Undo、输入法与刷新 |
| 原生 Chrome 选区菜单和一次性领取 | **NOT_TESTED** | Node 接线/模拟不能替代菜单点击 |
| 关闭侧栏、SPA/BFCache、撤权、卸载/重装完整链 | **NOT_TESTED** | 需要真实已安装环境 |
| 逐维产品质量 95+ | **NOT_SCORED** | 不虚构产品验收分数 |

### 7.3 最近的实际阻塞与最小下一步

- 在当前网页会话没有用户 Mac Chrome Profile、已登录 ChatGPT DOM 或本机 `npm run dev` watcher 的访问能力。不可把模拟编辑器、官方 packer 的 Node 检查或历史候选视为真实安装证明。
- 下一步先读取 R1.5 同提交作用范围内的 GitHub Actions 结果；有真实 FAIL 则仅修受影响的可信适配器和测试，保持来源 SHA 白名单同步。再由具备隔离测试 Profile 的运行环境做官网 optional 安装、真实 ChatGPT 草稿、中文 IME、原生菜单、关闭侧栏以及撤权/卸载验收。
- 官方整包构建必须使用隔离 CI/CFT 或已协调的唯一 build writer，不覆盖本地共享 `dist/development`。如全局构建失败，记录首个实际错误及所属文件；不可将其他项目的阻断伪装成 Prompt Shortcuts 的缺陷。

### 7.4 R1.5 提交与构建边界（已执行）

- `d564f951def2d2ae5f13b6505d4cfb36acf5f29b`：ChatGPT 可信编辑器完整读回/原生插入确认、异步单次点击及组合输入保护，同一原子提交更新精确 Git blob 白名单、静态与动态回归测试、工具 README 和本交接文档。对应独立 Run [38742882938](https://github.com/shopable-ai/opendesk-browser/actions/runs/38742882938) **10/10 PASS**。
- `b07b4e4a14f9570d5651e91e0c550d4ed8caa76f`：追加直接段落节点与空行保持的定向 Node 模拟回归。
- `1bc0fabcf2e3355decedc6a8df5eea51ed292a3e`：沿用现有 `.github/workflows/prompt-shortcuts-r14.yml`，增加真实便携 JSON 包文件生成、内容合同校验及临时可下载 CI 工件。Run [38743743798](https://github.com/shopable-ai/opendesk-browser/actions/runs/38743743798)：**11/11 Node PASS、syntax PASS、portable v2 package PASS**。
- 同一期间 production build 在 [Run 38742882742](https://github.com/shopable-ai/opendesk-browser/actions/runs/38742882742) 失败，首个明确阻断是 AdBlock 的固定审计源码 `trusted/host-controls.js` 摘要不一致。截至再次核查的 `main`，该文件实际 blob `c2d9fb892c76669b169c34de2cb4c168f91402cf`，当前白名单 `d43b940eb8e2ad78f10d4dfba606800e7b14fb58`；属于并行 AdBlock 所有权，**本轮没有修改或放宽 AdBlock 源码审批**。
- 即使独立工具包可通过已有工具安装器导入，真正 `INSTALLED_CHROME_PASS`、`REAL_CHATGPT_PASS`、`MAC_IME_PASS` 仍需安装对应候选并实际观察操作结果；当前均为 **NOT_TESTED**。现阶段**不可**宣布产品全链路 95+。

### 7.5 仓库内正式工具包固化与本地 Codex 验收入口（2026-10-15）

**已真实写入 `main`，不再要求用户从 CI 下载 ZIP 后复制。**

- **正式路径**：`examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json`；直接由已有官方 `scripts/build-sidebar-tool.mjs` 产生和验证，为 Sidebar Tool v2，可交给 OpenDesk 的现有工具导入/安装器审阅，不是单独 Chrome Extension。
- **生产源码与本地导入包同目录**：`tool.config.json`、`src/`、`trusted/` 和这个 JSON；保持一个 ID `prompt-shortcuts`，不得建立第二个工具项目或安装引擎。
- **可核查的实物入库**：GitHub commit [`ddd386ba220213192bc7b0bf3a4ea8d8bbcc77a1`](https://github.com/shopable-ai/opendesk-browser/commit/ddd386ba220213192bc7b0bf3a4ea8d8bbcc77a1)；JSON 文件 **35,083 字节**，SHA-256 `1f09804545c2a654cccab76c1a863c29453b1239b7e387e0d6e4225df3bed412`，版本 `1.0.0`，包含 `storage.local`、`user.export`、`page.prompts`、`browser.contextMenu`。这是此前 Run [38743743798](https://github.com/shopable-ai/opendesk-browser/actions/runs/38743743798) 验证的**完全相同字节**。
- **CI 固化成功**：基于原 `.github/workflows/prompt-shortcuts-r14.yml` 增加只在 Scoped 11/11/包校验通过后执行的 `sync-project-package` job，直接使用 GitHub 原生 Contents API 向 `main` 非强制写入本工具 JSON，先比较最新源码是否变更、当前文件是否已相同。Run [38747308859](https://github.com/shopable-ai/opendesk-browser/actions/runs/38747308859) 两个 jobs 均 PASS，原始发布日志确认 `PROMPT_PROJECT_PACKAGE_COMMITTED`，不覆盖共享 `dist/development` 或任何并行工具。
- **本地更新规则（采用新通用 Gate）**：先运行 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/prompt-shortcuts --out artifacts/sidebar-tools/prompt-shortcuts/candidate.opendesk-tool.json` 产生唯一临时候选，再完成该工具的专项 Node/包/来源测试；通过后运行 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/prompt-shortcuts --promote-from artifacts/sidebar-tools/prompt-shortcuts/candidate.opendesk-tool.json` 显式晋升工具目录内唯一正式 JSON，最后运行 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/prompt-shortcuts --check-project` 验证同源并与源码一起提交。**普通打包不再自动刷新正式文件，失败时保留原包**；如需真实安装或升级，必须经既有安装器完成版本及权限审核。
- **本地 Codex 的最高优先级未验收任务**：在现有 `npm run dev` watcher 和 Chrome 正式 OpenDesk Extension ID 下，用本仓库 JSON 安装工具，亲自完成“仅正文新建 → 授权 chatgpt.com → 左侧按钮 → 已有草稿多行/空行/Unicode 插入 → Cmd+Z → 中文 IME → 原生右键选区预填 → 关闭 Side Panel 后仍工作 → 双开关独立 → SPA/BFCache → 撤权/停用/卸载/重装清理”，记录版本、真实加载目录、扩展 ID、工具包 SHA-256、页面、时间、步骤和可复现失败。不得以 Node 或模拟 Chromium 的结果冒充真实通过，严禁自动发送聊天内容。
- **仍然未取得**：整包 production 在真实 Chrome 的新候选验收、真实 ChatGPT 文本编辑器与 macOS 中文 IME、原生 Chrome 上下文菜单及全链卸载恢复 `INSTALLED_CHROME_PASS` / `REAL_CHATGPT_PASS` / `MAC_IME_PASS`，均保持 `NOT_TESTED`；既有 AdBlock 固定源码摘要阻断只记其原始候选事实，不为了本项目绕过安全门槛。


## 8. R1.6 远端正式工具包核验与本地原生验收边界（2026-10-15）

> 本节是对当前可访问环境进行的**远端源码与安装包核验**。该执行环境无法访问用户 Mac 的 `/Users/shopme/Documents/workspace/opendesk-browser`、其日常 `dist/development`、`npm run dev` watcher、Native 配对、实际 Chrome Profile 或已登录的 ChatGPT DOM。**没有执行 Mac 本地 `git status`、Node 命令、原生安装或真实网页操作。** 不将远端证据冒充本地 E2E。

- **源候选快照**：2026-10-15 对 `main` 的只读检查起点 `45f58516eee813bab159ca6938cb1e2c17846e22`。仓库正式文件 `examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json` 存在；独立复算 **35,083 UTF-8 bytes**、**SHA-256 `1f09804545c2a654cccab76c1a863c29453b1239b7e387e0d6e4225df3bed412`**；工具 ID `prompt-shortcuts`，version `1.0.0`，format `opendesk.sidebar-tool.v2`。JSON 中的 HTML 与 `src/index.html` 完整相等，JS 与 `src/main.js` 完整相等，唯一脚本 `trusted/model.js` 亦与仓库源码完整相等；所声明的四项能力与 `tool.config.json` 一致。官方可选目录 `official-tools/catalog.json` 含同 ID、同项目目录，`installationPolicy=optional`。
- **可信网页代码已接线，不代表效果已实现**：`src/entrypoints/page-relay.js` 固定导入 `trusted/page.js`；该模块使用可信单击、重新读授权、`execCommand('insertText')`、完整草稿回读与失效保守提示，不调用发送；`src/platform/chrome/context-menus.js` 具备原生菜单一次性领取、来源文档绑定、权限/生命周期检查。三个 Prompt Shortcuts 可信源码的 Git blob 与 `scripts/bundle-provenance.mjs` 精确批准值一致：model `f015386060e97ad336c3bbaf35d6e9033b7ba2ee`，policy `d393ee2c2511f4786265e8abc23c5c755aae51a6`，page `0eeab5f748101d605fea6a28b82d36c4be31ca89`。此项分级仅 `SOURCE_WIRED`。
- **既有而非本次重新执行的 CI**：Run [38743743798](https://github.com/shopable-ai/opendesk-browser/actions/runs/38743743798) 已于候选 `1bc0fabcf2e3355decedc6a8df5eea51ed292a3e` 获得 11/11 `NODE_PASS`、语法及 `PACKAGE_PASS`；Run [38747308859](https://github.com/shopable-ai/opendesk-browser/actions/runs/38747308859) 成功将同字节 JSON 入库。比较后续 20 个主分支提交，Prompt Shortcuts 的源码、定向测试与构建依赖未变化（只新增正式 JSON 并更新 README/交接文档）。不能称为“本次本地 Node 测试已通过”。
- **整包生产构建风险**：历史 production Run [38742882742](https://github.com/shopable-ai/opendesk-browser/actions/runs/38742882742) 因 AdBlock `trusted/host-controls.js` 固定摘要不一致而 `BLOCKED`。此轮静态检查中其实际 Git blob 仍为 `c2d9fb892c76669b169c34de2cb4c168f91402cf`，审批值仍为 `d43b940eb8e2ad78f10d4dfba606800e7b14fb58`。**未在本轮实际运行 production build**；不得把历史失败当成刚运行的日志，亦不得代替 AdBlock 所有者改白名单。
- **原生 E2E 待执行**：`INSTALLED_CHROME_PASS`、`REAL_CHATGPT_PASS`、`MAC_IME_PASS` 一律 `NOT_TESTED`，原生 Chrome 选区右键、SPA/BFCache、退出侧栏、撤权、卸载及重装也均 `NOT_TESTED`；逐维 95+ `NOT_SCORED`。无实机复现缺陷，故本轮不擅改已审核可信模块、不重建任何引擎，也未重新打包覆盖日常运行目录。
- **本地可操作闭环（保留现有 watcher）**：有 Mac/已登录 Chrome 的执行者先运行 `git status --short`、安全同步 `main` 并核对实际 Chrome ID/`dist/development`/Native 连接；在不争抢 watcher 输出的前提下运行 `node --test tests/environment/prompt-shortcuts-r14*.test.mjs` 及 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/prompt-shortcuts`，对比生成后 SHA-256 与 `git diff`；接着使用现有导入器审阅同 ID `1.0.0` 包并在真实 ChatGPT 完成“已有草稿 + 多行/空行/Emoji → Cmd+Z → Mac 中文 IME → 原生右键预填但不自动保存 → 关闭侧栏仍运行 → 双开关独立 → SPA/BFCache → 撤权/卸载/重装”。每项保存同一包 SHA、真实加载目录、扩展 ID、操作时间、期望/实际结果；失败先留证再最小修复，相关源码和正式 JSON 同候选提交。


## 9. R1.7 双预览正式 UI 对齐（2026-10-15）

**范围与权限**：唯一可写分支 `main`；拥有正式 `src/index.html`、`src/style.css`、`src/main.js`、可信 `trusted/page.js`、工具版本/可安装包、定向回归及精确来源 pin。本轮保留原版 `preview/index.html`、`preview/mock.html`，未复制任何 Mock Browser Chrome、演示菜单或尺寸实验台。无第二份 GOAL 或状态文档。

**并行保护**：读取起点 `main` 为 `3b621c6f6edd36e121c3bfeb48d1e05958b09bb3`。另一并行开发已修改 `REQUIREMENTS.zh-CN.md`（从 Git blob `29d627e...` 演进至 `ecfa83b...`，新增跨平台需求），**本轮不覆盖、不提交该路径**；跨平台支持不属于 ChatGPT R1.7 的完成声明。

| PREVIEW_EXPECTED | REAL_ACTUAL / ROOT_CAUSE | FIX | TEST_EVIDENCE |
| --- | --- | --- | --- |
| `index.html` 紧凑卡片，独立 `编辑` 与 `⋯`，提示词启停可辨认 | 旧主行动作继承上外边距且“更多”过大，未明确分离启用数 | 栅格卡片、安静操作、停用胶囊、总数＋启用数、真实空态 | 源码/定向回归；Chrome 截图 `NOT_TESTED` |
| 列表原位删除确认、失败保留原数据 | 旧确认控件位于整个页面末尾 | 原卡片内部确认、确认焦点；保持 ETag/ifMatch 失败保护 | 组件代码；Chrome `NOT_TESTED` |
| 两独立设置开关、真实权限信息 | 旧 checkbox 样式与预览不符，右键许可状态易与站点授权混淆 | Token 样式轨道开关；原生右键 status 经 SDK，站点授权指向可信工具详情，不捏造已批准状态 | SDK 路径源码；原生 Chrome `NOT_TESTED` |
| 内容优先，字素短标签及形状预览，8192B 提示 | 旧表单仅拼接一行文字，没有最终外观和字节计量 | 正文第一、逐字素竖排/圆形预览、完整 `library` 投影计量；实际保存仍执行 8192 UTF-8 上限 | 官方打包 / Unit 需 CI；Side Panel `NOT_TESTED` |
| `mock.html` 内容区左缘、居中、38px 按钮，窄区折叠、完整长文 Tooltip | 旧浮栏厚重外壳；CSS `.narrow .fold` 未匹配 rail 自身；Tooltip 立即消失难以阅读 | 48px 透明轨道、38px 按钮、`.rail.narrow .fold`，窄区默认折叠，鼠标移动延迟、长文滚动与 Esc；继续跟随主内容区重算位置 | Node 模拟新用例；真实 ChatGPT `NOT_TESTED` |
| 单次点击追加完整草稿，快速双击不重复 | 原代码只在异步操作进行时排重，操作完成后的第二次快速点击可能重复 | 同条目 700ms 防双击，仍保留原生插入、完整换行读回、组合输入中止、失败仅手动核对 | Node 模拟/源码，真实 Cmd+Z/中文 IME `NOT_TESTED` |

**升级/固定源码边界**：正式工具更新候选版本 `1.0.1`，禁止已装同版本强行覆写。 `trusted/page.js` 原 SHA `0eeab5f748101d605fea6a28b82d36c4be31ca89` 审核后精确变为 Git blob `adbdc28dc0def1ae8306329b6691b8c7ac31c581`；仅更新既有 `scripts/bundle-provenance.mjs` 与 scoped 测试对应单项 pin，不更改 AdBlock 白名单，不放宽目标输出。 `tool.config.json`、正式 JSON 及现有 GitHub scoped CI 版本目录/断言同步至 `1.0.1`。

**环境与证据边界**：本轮 GitHub 连接可以读写源码与 CI；用户 Mac 的 `/Users/shopme/Documents/workspace/opendesk-browser`、`git status --short`、原 `npm run dev` watcher、`dist/development`、Chrome ID/Native 配对、已登录的 ChatGPT DOM、Mac 中文 IME **均不可访问**。不能因模拟或历史 CI 宣称原生完成。当前真实 Side Panel 并排截图、ChatGPT Undo/IME/原生右键/安装/SPA/BFCache/卸载及逐维 95+ 全部 `NOT_TESTED` 或 `NOT_SCORED`；待此候选实际 CI 结果后补充具体 SHA/Run。

### 9.1 R1.7 远端提交/同源实物核验

- 已安全提交 `main`：[`5a69d3b94db2e4300623a5cebdba8c2a52a6b06b`](https://github.com/shopable-ai/opendesk-browser/commit/5a69d3b94db2e4300623a5cebdba8c2a52a6b06b)，父提交 `434e67e0ec2f0c0188f894f4f502ec2a37e76d69`，12 个任务范围文件；未改已确认 `preview/index.html` / `preview/mock.html` 或并行更新的 `REQUIREMENTS.zh-CN.md`。
- 正式 `prompt-shortcuts.opendesk-tool.json` 的 **Git blob `6bc4c87e027cb0a10656a4a992d8982e173190fc`、43057 UTF-8 bytes、SHA-256 `6dacf6d87993b35afa8ddf7d3322016c957e32807b4464879f73c24c2ae1e904`**。摘要以独立纯 JavaScript SHA-256 实现计算，并先用已知旧版 SHA-256 / “abc”标准测试向量校验算法。
- 远端逐字节核对：`pkg.html === src/index.html`、`pkg.js === src/main.js`、CSS 的本工具私有布局后缀与 `src/style.css` 对应部分一致、`pkg.scripts[0].code === trusted/model.js`、`tool.config.json` 与正式包版本均为 `1.0.1`；这是**远端静态同源核验，不冒充官方 CLI 的本机执行**。
- 源码准入 SHA 对应 `trusted/model.js`、`trusted/policy.js`、`trusted/page.js` 三项均与目前精确 blob pin 相同，无目录或目标通配许可。先前历史 AdBlock `host-controls.js` 固定 SHA 失配经当前源码检查已不再存在（实际与批准值同为 `c2d9fb892c76669b169c34de2cb4c168f91402cf`），但本次**未执行 production 整包 build**。
- Scoped CI 已自动触发：[Run 38764735559](https://github.com/shopable-ai/opendesk-browser/actions/runs/38764735559)，运行绑定上述提交；截至最后一次读取仍为 `queued`，**NODE_PASS / PACKAGE_PASS 未取得，不得声称 CI PASS**。需读取该 Run 中真实测试、官方包生成日志和可安装包摘要后再关闭技术门禁。真实 Chrome/IME 独立验收继续 `NOT_TESTED`。

## 10. R1.9 — PREVIEW FIRST / SAVE FAILURE RECOVERY（2026-10-16）

### 10.1 阶段界限与原始证据

- 本轮在 GitHub 已读取 `AGENTS.md`、本需求文档、原预览、`preview/mock.html`、正式 `src`、`trusted/model.js`、宿主 `tool.html` / `sidebar-tools.js`、Design Tokens / System 与相关历史提交。起始 `main` HEAD 为 `30cc8f63e80efd22957e929e1796e114d5a5c9ac`；宿主已有 `sidebar-tool-back` / `sidebar-tool-title`，正式 `src/main.js` 的 `save()` 存在 `!ready || busy || mode !== 'form'` 无提示提前返回的待确认风险。
- 唯一变更的交互预览是 `examples/sidebar-tools/prompt-shortcuts/preview/index.html`，保留原始 Git 历史，不增加平行原型。预览增量提交：[`49ffae7`](https://github.com/shopable-ai/opendesk-browser/commit/49ffae733a8174cdacec075d4f5b6e0fa07470f3)（布局/状态）、[`a53a1c3`](https://github.com/shopable-ai/opendesk-browser/commit/a53a1c3267489e491505b4b05f15060fb3034092)（未知结果核对/精确库额度）、[`d038a4e`](https://github.com/shopable-ai/opendesk-browser/commit/d038a4e618c99fa96b3f300bf5bccddaf5cf9e2a)（未知结果持久反馈）、[`20be3c3`](https://github.com/shopable-ai/opendesk-browser/commit/20be3c376bb844b9de82cddcdd372bea20a3520e)（R1.9 明示版本、模拟 UUID 额度和保存中的离开保护）。
- 新 UX 合同已追加至 `examples/sidebar-tools/prompt-shortcuts/REQUIREMENTS.zh-CN.md`，提交 [`d3e165a`](https://github.com/shopable-ai/opendesk-browser/commit/d3e165a4fa6526ed928365f84c3bc72e577ef3be)。之前的 Claude/Gemini/Perplexity/DeepSeek/Grok/Cursor Web/ComfyUI 跨平台长期需求完整保留。
- `preview/mock.html` **未修改**（Git blob `025ec9b2c1ed6e9b011c9e3c2a6ce5a87d263eae`）；正式 `src/index.html` / `src/style.css` / `src/main.js` **未修改**（分别为 `9ba23d10bb63be377db0d6c08ff2ec5da091282e`、`7598de9164d3f2017cb8d376d9539d0df1c60a59`、`83404d404bd73ad59546dd25fdaedf33951841ad`）。正式单一 JSON **未刷新/晋升**，版本仍为 `1.0.1`，Git blob `6bc4c87e027cb0a10656a4a992d8982e173190fc`。

### 10.2 R1.9 预览交互修改（候选设计，等待用户确认）

| 原始问题 / 预期行为 | 本轮源码改动 | 当前证据与风险 |
| --- | --- | --- |
| 宿主与工具同时绘制标题/返回 | 新增仅用于原型的宿主单行导航，工具首页只显示“我的提示词”，编辑页只有“新建/编辑提示词”和“取消”；宿主返回与表单取消走不同目的地，草稿变更有确认。 | `SOURCE_WIRED`：原重复 `formBack` 与面包屑移除；真实宿主 `dirty/busy` 事件仍须后阶段测试。 |
| textarea 238px 不合理 | `rows=3`，CSS 三行文本行高加内边距的固定可视高度约 80.4px、`overflow-y:auto`、`resize:none`、可换行；不因 10/100 行撑高表单。 | `STATIC_PASS`：源码符合；实际布局测量、macOS 中文 IME、光标内部滚动 `NOT_TESTED`。 |
| 新建只输入正文即可保存 | 自动 Unicode 两字素预览直接展示，名称/标签/圆角形状/启停收进原生可访问 `<details>`；手动编辑或非默认状态时自动展开。 | `SOURCE_WIRED`：组合字符处理和折叠行为；键盘/辅助技术真实检查 `NOT_TESTED`。 |
| 保存无状态、失败找不到错误 | 保存中禁用提交按钮；空正文就近报警与聚焦；全库精确 JSON 8192B 模拟配额；写入失败、冲突、未知结果持续反馈，保留正文；未知结果可在不离开表单的情况下核对当前模拟列表。 | `SOURCE_WIRED`，模拟 Promise 与模拟内存，绝不当成真实 storage.set/Host/ETag 的验收。 |
| 实验台混入正式工具内容 | “写入失败/冲突/结果未知”选项移动到整个原型上方独立实验台；预览状态区在产品内不再重复常驻说明。 | `STATIC_PASS`：三个实验按钮位于 `<main>` 之外；迁移正式 UI 时禁止拷贝实验台。 |

### 10.3 验收场景与证据等级（A–I）

| 场景 | 源码检查 | 独立浏览器执行结果 |
| --- | --- | --- |
| A. 新建 → 只输入“你好” → 保存 → 列表出现 | `SOURCE_WIRED`（内存模拟成功路径） | `NOT_TESTED` |
| B. 空正文保存 → 就近错误和焦点 | `SOURCE_WIRED` | `NOT_TESTED` |
| C. 十行/百行正文 → 固定三行内滚 | `STATIC_PASS`（CSS 规则） | `NOT_TESTED` |
| D. 中文/Emoji/组合字素自动标签，编辑回读 | `SOURCE_WIRED` | `NOT_TESTED` |
| E. 全库 JSON 超出 8192 B → 拒绝，草稿保留 | `SOURCE_WIRED` | `NOT_TESTED` |
| F. 模拟写入失败 → 可见错误，不丢草稿 | `SOURCE_WIRED` | `NOT_TESTED` |
| G. 模拟写入结果未知 → 不重试、核对列表、保留草稿 | `SOURCE_WIRED` | `NOT_TESTED` |
| H. 宿主返回 → 有草稿先确认，放弃后退出工具 | `SOURCE_WIRED` | `NOT_TESTED` |
| I. 表单取消 → 有草稿先确认，放弃后只回列表 | `SOURCE_WIRED` | `NOT_TESTED` |

### 10.4 静态检查、逐维评分与剩余风险

- 已对 GitHub 最新预览做源代码静态验收：**81 个 HTML id 无重复，所有 `el('id')` 静态引用可解析，`<aside>` 标签嵌套平衡，唯一宿主标题/表单视图标题，`rows=3`/内部滚动/禁止拖拽、无残留 `min-height:238px`、无旧 `formBack` / 面包屑，模拟失败控件在产品 `<main>` 外，保存中/冲突/未知/核对分支与 A11y 状态属性均在源码中。**结果 `STATIC_PASS`。从 GitHub 读取最终 HTML，提取内联脚本以 JavaScript `new Function(source)` 进行**仅编译不执行**的语法校验，`SYNTAX_PASS`。这不是 Node、浏览器 DOM、真实用户交互或视觉截图执行。
- 九个专家目标维度：信息架构、导航去重、正文输入体验、创建编辑效率、表单密度、成功/失败反馈、键盘焦点与无障碍、Design Token 一致性、错误状态恢复，当前分别均标记 **`NOT_SCORED`**。依据：尚无同一预览的真实浏览器交互实测、计算样式/聚焦/滚动测量、Mac IME、辅助技术、异常注入录屏或独立产品评审。不得将 `STATIC_PASS` 虚报为逐维 95+。待实际浏览器 A–I 通过后才能逐维评分；任何维度低于 95 要定向修复和复验。
- GitHub 连接能读取、增量写入 `main`，但无法直接读用户 Mac 的 `/Users/shopme/Documents/workspace/opendesk-browser`，也未核对其 `git status`、开发 watcher、正式安装、原生 Chrome 身份和本机输入法。**现有已安装版本保存失败 P0 尚未关闭。**用户在本地手动输入“你好”无错误反馈的复现仍是独立事实。
- 尚未运行浏览器交互测试、Node 定向测试、官方临时构建/`--promote-from`/`--check-project`、原生安装/重启持久化/ChatGPT/IME/原生右键。对应 `NODE_PASS`、`PACKAGE_PASS`、`INSTALLED_CHROME_PASS`、`REAL_CHATGPT_PASS`、`MAC_IME_PASS` 均 **`NOT_TESTED`**；本阶段不触碰原正式 JSON。

### 10.5 用户确认后第二阶段执行门禁

1. 用户先打开并操作 [`preview/index.html`](../../../examples/sidebar-tools/prompt-shortcuts/preview/index.html) 确认单一导航、三行高度、折叠选项与保存错误路径；若不同意，先定向完善这一唯一预览，不提前迁正式。
2. 再用真实已安装工具重现只输入“你好”无法保存的问题：记录当前包 SHA/版本/运行时、submit 是否触发、`ready/busy/mode` 提前返回、`model.draft`、`crypto.randomUUID` / `Intl.Segmenter`、SDK `storage.set` payload/Host 回执/ETag、列表刷新与关闭重开读回；未经证据不宣称任何特定根因。
3. 经预览确认后把必要结构和反馈迁至 `src/index.html` / `src/style.css` / `src/main.js`，不复制模拟数据或假宿主头；维持可信页面代码不变，除非实际缺陷证据要求修改。
4. 运行 `node --test tests/environment/prompt-shortcuts-r14*.test.mjs` 等定向测试和共享设计安全来源检查；使用官方候选包 → 测试 → `--promote-from` → `--check-project`，按官方版本升级语义审查递增 `1.0.2`，同步唯一正式 JSON，绝不同版本异字节覆盖。
5. 同候选在真实 Chrome 测试 “你好” 保存、重新打开仍存在、多行/Emoji/100 行、空/超限/失败/冲突/未知、草稿保护、按钮/Tooltip、Cmd+Z/IME、原生选区右键和停用/撤权/重装，并提供可复核操作证据。任何不具备的场景继续 `NOT_TESTED`。

## 11. R1.10 — 紧凑表单原位优化与 Chromium 验证（2026-10-16）

**用户反馈及修改范围：** 新建/编辑时低频选项占用过多空间，要求「左侧 label、右侧 input」的紧凑表单。仅修改唯一管理预览 `examples/sidebar-tools/prompt-shortcuts/preview/index.html`；不变更 `preview/mock.html`，不迁移或修改正式 `src/`、`trusted/` 与唯一正式安装 JSON。具体产品决策参见 `REQUIREMENTS.zh-CN.md` 第 9 节。

- **源码提交：** [`8b871c0`](https://github.com/shopable-ai/opendesk-browser/commit/8b871c07a0c0fa81feff9a64c7a158f71deaa92d)；修改前 Git blob `9a9ffb6a34acd42d0caeea0eb6a5eb0c8cb4862c`，修改后 `9b630ab11ffb86a9f26f57244f5ac0ba8e2b92bc`，已通过重新读取最新 `main` 复核。
- **具体优化：** 可选设置缩为三行：短标签／显示名称／网页显示；左标签、右单行输入或开关，默认折叠保留。删除形状选择 UI，新建默认圆角方形；编辑已有历史圆形条目时保持原 shape 值，不暗中改写。自动名称/短标签预览压缩为无额外卡底的行内展示。
- **真实 Chromium 页面加载与操作**：使用 Linux `/usr/bin/chromium` headless + Playwright `page.set_content` 加载对应完整原始 HTML（本环境未将 `file://` 导航当作通过证据）。原有 **14/14** 模拟回归通过（固定三行与内部滚动、中文/Emoji、空正文与 UTF-8 上限、写入失败/冲突/未知、取消和宿主返回草稿保护、列表增删改排序/启停、两个独立全局开关、320/360/420/520px）；新增 **6/6** 紧凑表单针对性检查通过（默认折叠、左右栅格、无形状控件、自动/手填和单项开关、编辑回读、旧圆形值保留、暗色模式和各宽度）。本次页面 JavaScript 异常 **0**。
- **实际布局测量（380px 侧栏）：** 同浏览器原旧版展开设置区 `388px` → 新版 `169px`，减少约 **56%**；展开表单整体 `725px` → `479px`；正文 textarea 的实际高度仍约 `80.4px`。320/360/420/520px 未发现 Side Panel 水平溢出。原始 Chromium 截图及修改后的完整 HTML 作为本次 ChatGPT 对话附件供用户视觉评审，不把图像生成结果当作浏览器证据。
- **证据界限：** 这是独立浏览器中的**HTML 模拟预览验证**，不是 Mac 原生 Chrome 已安装的 OpenDesk 工具、真实 `storage.set`、IME、真实 ChatGPT DOM 或主观九维专家评分。用户对新布局的明确视觉确认 **PENDING**；九维产品目标当前仍 **NOT_SCORED**，正式保存“你好”失败 P0 仍未关闭。不得在确认前迁移正式 UI 或覆盖工具安装包。

## 12. R1.12 — 默认展开和无标题兼容（2026-10-16）

**用户反馈：** 「按钮设置」默认展开；提示词列表需要兼容根本没有手动标题的项，视觉目标为专家 95+/100。仅修改唯一管理预览 `examples/sidebar-tools/prompt-shortcuts/preview/index.html`，正式扩展和 `preview/mock.html` 未改。

- **最新源码基准**：开始时 GitHub `main` 上已有另一轮 R1.11 正文优先列表和直接使用功能，原始 Git blob 为 `5241518c82b06458d4e9fb0f477e42a7b3ec0234`；本轮在其上安全增量提交 [`74bfecf`](https://github.com/shopable-ai/opendesk-browser/commit/74bfecf5bf44d820451539d889b56b0e4afbae43)；新 Git blob `9d6301262b42e19cc11a3a7bf135fe2659ae169d`，与完整 Chromium 测试源文件哈希一致。
- **新建/编辑展开行为**：HTML 原生 `<details open>` 且每次进入表单执行 `advancedOptions.open=true`；手动收起之后填写正文不重开，下次进入重新展开。保留 R1.10 三行紧凑布局、正文三行高度、短标签/名称自动生成功能及旧圆形值保留。
- **无标题列表**：新增 `customTitle` / `itemIdentity` 处理手动标题、自动名称及空名。卡片正文始终第一行，`nameAuto=true` 或空 `name` 时不渲染次级空白名称或重复标签；手工名称次级展示。默认模拟库包含一个空 `name` 的旧数据样例；正文片段作为无标题项的编辑、更多、停用和删除确认及网页按钮 ARIA 语义。原有 R1.11 点击正文优先填写模拟 ChatGPT 输入框，其他情况回退剪贴板的交互仍保持。
- **真实 Chromium 验证**：Python Playwright + 本环境 `/usr/bin/chromium` headless，使用 `page.set_content` 加载逐字节匹配的 HTML 候选，**15/15 项 PASS，页面 JavaScript 异常 0**：默认展开与对齐、键盘 Enter 收起/展开及重新进入、空名称旧数据、只写“你好”自动名称、手动名称次级、无名称编辑回读、无名称启停、三行正文与百行内滚、Unicode Emoji、空内容与 8192B 校验、保存失败保留、结果未知核对、取消和宿主返回保护、320/360/400/440px 与深色不溢出且操作区域不重叠、点击正文直接插入。测试脚本和原始截图保存在本轮会话附件，不当作本机安装证据。
- **未验收**：本环境不具备用户 Mac 原生安装 Chrome、真实 ChatGPT DOM/IME 和 Host `storage.set` 验收；正式“你好”保存失败 P0 没有在本轮修复。九维专家评分仍 **`NOT_SCORED`**，目标 >=95，而非据 15 项模拟通过就虚报专家分数。用户尚未明确批准 R1.12 预览进入正式迁移，保持 **PREVIEW_APPROVAL_PENDING**。


## 10. R1.8 Mac 真实 Chrome 验收（2026-10-16，IN_PROGRESS）

负责人：本地 Codex 会话 01a14087；唯一 main。写入范围：本交接文档，Prompt Shortcuts src/index.html、src/style.css、src/main.js、tool.config.json、唯一正式 JSON，必要时 trusted/page.js/model.js/policy.js 及对应精确 provenance 与定向测试。两个原版 preview 与跨 AI 平台 REQUIREMENTS 只读。子 Agent 仅只读核对管理 UI / 网页适配器。

资源：复用日常 Chrome ccfcjegpkdlgbclopjmadlcjedelidmf，加载 /Users/shopme/Documents/workspace/opendesk-browser/dist/development；npm run dev PID 55545 / node scripts/dev.mjs PID 55566，43119 已存在 ESTABLISHED Chrome 连接，属于持续开发。无第二 watcher/build writer，不占用其他 CFT/Profile/43111。本工具不需要 Native 来插入网页草稿。证据目录 artifacts/prompt-shortcuts-r18-01a14087/，不读聊天历史、不发送消息。

起点 ba0e16933；fetch 后 origin/main 领先36提交。首次 ff-only 同步因其他任务 local-project.js 与对应测试未提交改动拒绝；随后观察到并行负责人已同步 HEAD 至68e6b8978且这两个文件处于 unmerged，保留并继续独立工具工作，不擅自处理其索引。

正式包 --check-project PASS：v1.0.1，43057 bytes，SHA256 6dacf6d87993b35afa8ddf7d3322016c957e32807b4464879f73c24c2ae1e904，未重建。真实打开工具发现安装的仍为 v1.0.0：旧 checkbox UI / 旧空态与 R1.7 预览差异明显；既有导入器明确显示 v1.0.0→1.0.1、能力无变化、保留数据。先按正式升级链更新后再评估当前源码差异。

### 10.1 转新对话续接快照（2026-10-16）

- 用户最新明确：按钮应位于 **ChatGPT 对话内容区域左边缘，并在该区域垂直居中**，排除历史导航；当前出现在整个网页左边仍是实际失败，不能登记定位 PASS。用户另明确不以 ChatGPT 登录为继续工作的前置条件。
- 当前 main HEAD `68e6b8978338d408fb08637c8b86cc936541aa91`；本任务修改尚未提交/推送。此前并行任务 unmerged 状态已消失；native-agent/local-project 与 ai-vip-share 仍有他人未提交修改，禁止覆盖或混入提交。每次写入、暂存前重新核对。
- 正式包已按候选构建→测试→晋升→check-project 更新为 **1.0.2 / 44680 bytes / SHA256 `8d3f8024fa06dff0d6660a45d301ad71d046be2a11d7c57cf30b99fcc2d60622`**；真实 Chrome 已经由原安装器完成 1.0.1→1.0.2 权限审阅升级并保留数据。正式包仅此一份。trusted/page.js 属静态扩展代码，后续更改须另绑定实际加载的开发产物身份，不能仅凭 JSON SHA 声称已经加载。
- 保存实际失败：沙箱不允许原生 form submit，原按钮仅依赖 submit 事件。现已使用明确的保存按钮 click 与受控 Enter，保留沙箱合同；增加 busy/未知结果保护及保存中继续编辑的身份保留。实际 Chrome 已验证新建、保存和重新编辑指定多行正文（含空行、中文和 Emoji）、三个 Unicode 样例、超过 8192 B 拒绝且保留草稿、返回时未保存确认。页面白底与停用标签样式已调整，完整视觉评分仍未完成。
- 真实 Chrome 已验证四种“网页按钮/选区右键”独立开关组合，四条测试提示词均保留；真实 Chrome 原生右键菜单→添加为提示词快捷按钮→已有新建表单预填，未自动保存。当前网页按钮开、选区右键关；宿主站点/右键授权仍保留。
- trusted/page.js 已增加 Tooltip 焦点/滚动生命周期保护及尝试扣除左侧导航的定位逻辑；**定位真实复验仍失败**。当前 mainRegion 只搜索 main 内的 aside/nav，下一步必须读取当前真实 DOM 的包含关系与可见矩形，核实导航是否在 main 外，不得将该假设当作根因结论。
- 当前未登录 ChatGPT 的真实编辑器为 `main textarea#mobile-composer-prompt`。已增加该精确适配选择器及真实输入路径的回归测试，不扩大到任意 textarea/contenteditable，不直接写真实编辑器 DOM。最终 page Git blob 与两处精确 provenance pin 为 `51acd763f647e34b3aac162fcee1fc0d2a2c0931`。最近子任务定向测试 **40/40 PASS**，语法 4/4 PASS；真实插入、Cmd+Z、IME 尚未复验。之前包含 sidebar-tools 的最终门禁 47/47 是编辑器变更之前的结果，不能冒充最新完整门禁。
- 子 Agent 实际按文件独立实施：Hegel 负责管理页保存及其测试；Boyle 负责 trusted/page.js、page 定向测试与两处精确 pin。均已要求停止编辑，续接时重新核对文件现状和资源归属。
- 证据均在 `artifacts/prompt-shortcuts-r18-01a14087/`，包含原生安装、管理页/表单、配额、开关矩阵与原生菜单截图及测试日志。`real-102-anchor-fixed.png` 文件名不代表通过，画面仍显示错误位置，必须按失败证据处理。部分初期整屏截图含非本任务页面内容，公开/提交前只保留必要产品区域。
- 受影响共享设计测试 7/7 PASS；默认 macOS TMPDIR 的 `/var`/`/private/var` 别名造成测试路径比较失败后，使用 `TMPDIR=/private/tmp` 通过，无修改测试断言。额外 bundle-package-provenance 检查的 production 通过、development 静态 receipt 与运行中 serve 文件不一致；不得覆盖现有 watcher/dist 来制造通过。
- 下一步先修复并真实验证对话内容区域定位，再验证当前真实编辑器完整追加、焦点、撤销、双击保护、IME、Tooltip 与生命周期；补齐同候选证据后更新本节、独立评分、只暂存本任务文件、Lore 提交并正常推送 main，检查新 CI。未测项目继续 NOT_TESTED/NOT_SCORED，不因本次换对话重复已有效验证的流程。

### 10.2 R1.8 续接：真实内容区域定位（2026-10-16，IN_PROGRESS）

负责人：Codex 01a140ae；接管上述本任务未提交修改。写入范围沿用第10节，定位修复由本负责人独占 trusted/page.js、page 定向测试及两处精确来源 pin；只读子 Agent Boole 比较已批准管理 UI。Chrome/43119/dist 复用既有资源，不启动第二 watcher、不构建覆盖 dist。main 68e6b8978，fetch 后 origin/main 领先68提交；远端重叠为本交接文档、只读 preview/index.html、bundle-provenance 中另一工具 pin，后续串行集成并保留全部差异。

通过条件：真实 ChatGPT 导航展开/收起、刷新及同站导航后，栏在完整高度的对话内容区域左缘内12px，栏中心对齐区域垂直中心；不覆盖历史导航，不使用底部输入框边缘替代内容容器。草稿验证保持中文/Emoji/空行且不自动发送。Node/真实 Chrome/未测分别记录。

真实 DOM 首读：main=[0,0,1263,899]；aside侧边栏=[0,0,260,899]，位于 main 内；完整高度的编辑器祖先包含 [260,0,1003,899] 对话容器。栏实际 x=12，仍 FAIL。不得把“导航在main外”假设登记为根因。

验收操作事故：tab bridge 超时后出现延迟调试连接，DevTools 失焦，一段无敏感数据的只读诊断 JavaScript 被误发送到本任务新建的空白未登录聊天；未触及原有聊天消息。已明确向用户说明，取消延迟调试连接并回到空白页。后续控制台输入与执行分开，执行前验证 Console prompt 焦点；不把此意外发送登记为功能通过。

独立实施分工：管理UI 子任务接管 src/main.js、src/style.css 与 tests/environment/prompt-shortcuts-r14-management.test.mjs，仅修复已批准R1.8的验证焦点、按钮/删除确认视觉及所有写入未知结果的保守保护；不迁入R1.9预览，不编辑版本/包/来源pin/本交接文档。leader独占可信页面与真实Chrome、版本及正式包、Git集成。新发现：真实 Worker 的开发栅栏拒绝刷新；native ledger三条均ACKNOWLEDGED，继续只读核对RunHost记录，不强制reload绕过栅栏。

### 10.3 R1.8 本地续接快照（2026-10-16，用户要求转新对话）

用户已确认初步功能可用，要求提供新提示词继续完善；不新建 GOAL/进度文档。本节保留同候选证据及明确缺口，不宣布全面验收关闭。

- **正式包**：唯一 JSON 为 **1.0.4 / 45850 bytes / SHA256 `8668e4950c3b47aad94985b976b8caaa5d78341ddeaf59ed24920d934b0486a4`**，候选 `artifacts/sidebar-tools/prompt-shortcuts/candidate.opendesk-tool.json`；已完成原打包器候选→测试→晋升→check-project。独立真实 CFT 经原安装器 1.0.2→1.0.3→1.0.4，数据保留。不以同版本异字节覆盖。
- **已实测静态适配器**：trusted/page.js blob `c5b810d34af003920ea6d3d8c3a5f28567a711ae`。日常 Chrome `ccfcjegpkdlgbclopjmadlcjedelidmf` / `dist/development` 的 watcher 55545/55566/43119 未停止或覆盖；RunHost 历史 effect_unknown 触发现有开发安全栅栏，自动刷新延后。未改账本、未强制 reload，不能登记日常最新代码已生效。
- **独立 CFT 身份**：STATIC_DEVELOPMENT_SERVE_SNAPSHOT_NOT_PRODUCTION；加载 `artifacts/prompt-shortcuts-r18-01a14087/cft/extension-snapshot`，revision `82413bf6e480227c5801a0330501217e59118ca9dbf5fc54423869f8319cccd2`，112 manifest 文件核对，扩展 ID `cmbhoehodjgiljaamaikmpdbdgcpiked`。不是 production/ZIP 验收。app `.runtime/prompt-shortcuts-r18-cft-unique/Google Chrome for Testing.app`（Prompt R18 Chrome），本会话独占 PID91368；launcher 报告 `artifacts/prompt-shortcuts-r18-01a14087/cft/unique-path-chrome-launch.json`。转交时保留实例，续接先核实进程/窗口，不操作其他 CFT。

| PREVIEW_EXPECTED | REAL_ACTUAL / ROOT_CAUSE | FIX | TEST_EVIDENCE |
| --- | --- | --- | --- |
| 对话内容区左缘，整栏垂直居中 | main 覆盖视口，导航实际在 main 内；旧 x=12。完整高度的编辑器祖先是对话容器。 | 选择导航右侧最外层全高祖先，ResizeObserver/transitionend/状态属性跟踪，stop 断开观察。 | 实测展开 x=272、收起 x=64，中心 y=401；`r18-anchor-dom-expanded.txt`、`r18-anchor-dom-collapsed.txt`；最终包 `r18-104-nav-expanded.png`、`r18-104-nav-collapsed.png`。 |
| 保存可靠、未知结果不重放 | form submit 被沙箱禁止；未知 ack 后其他写入仍有重复风险。 | 明确 click/受控 Enter、busy；未知写入锁定，完整预期库 ETag 回读确认后释放，保留草稿/新条目身份。 | 定向回归、真实创建回读及升级保留；未知写入目前仅 Node 证据，未做真实故障注入。 |
| 原生菜单预填仍属未保存 | 1.0.3 返回会静默放弃，因为 baseline 使用预填正文。 | 1.0.4 新建 baseline 为空，已有条目基线不变。 | `r18-104-native-prefill.ax.txt`、`r18-104-prefill-draft-guard.ax.txt/png`、`r18-104-prefill-continued.ax.txt`、`r18-104-menu-no-replay.ax.txt`；返回确认、继续保留、明确放弃、重开无重放均实测。 |
| 原稿/中文/Emoji/空行完整追加，不发送 | 未登录 textarea#mobile-composer-prompt 可用；Tooltip 可能遮住编辑器中心，须验证实际输入焦点。 | 精确选择器，保持原生编辑命令和完整回读，不赋值真实 DOM。 | 1.0.4 的 `r18-104-empty-prerequisite.ax.txt`、`r18-104-empty-doubleclick-verified.ax.txt`、`r18-104-existing-draft-append.ax.txt/png`、`r18-104-continue-edit.ax.txt`、`r18-104-empty-undo.ax.txt`、`r18-104-existing-undo.ax.txt`；空稿双击单次、指定原稿完整追加、继续编辑、Cmd+Z 均实测。 |
| Tooltip 与生命周期可靠 | 点击后焦点回编辑器，Tooltip 会隐藏；须用原生 Tab 验证焦点显示。 | 焦点/滚动保护，保留原撤权生命周期。 | 1.0.4 `r18-104-tooltip-keyboard.ax.txt/png`、`r18-104-tooltip-escape.ax.txt`（完整正文/空行、焦点、Escape）；`r18-104-sidepanel-closed.ax.txt`、`r18-104-refresh.ax.txt`（关闭侧栏和刷新恢复）。1.0.3 停用/恢复、站点撤权和开关的已有原生证据不能提升为同步后新策略 PASS。 |

**测试**：1.0.4 候选及晋升后分别 **72/72 PASS**：`r18-104-candidate-tests.log`、`r18-104-promoted-tests.log`；共享设计 **10/10 PASS**：`r18-shared-design-tests.log`；此前源检查 `r18-source-check.log` PASS。证据均在 `artifacts/prompt-shortcuts-r18-01a14087/`。这些结果发生在下述同步之前，不冒充当前集成后源码 PASS。旧 `real-102-anchor-fixed.png` 仍 FAIL；`r18-104-empty-doubleclick.ax.txt` 未建立空稿前提，保留为失败/方法不成立，新的 verified 文件才是有效证据。

**刚发生的并行集成，须先重新核对**：另一会话把 main 合并为 `cc763a30ee146be71bd230e98fe642b3ce3b5069`（32200a8f5 + b41ff7028），恢复未提交修改后，本交接文档、trusted/page.js、他人 src/ui/local-project.js 出现 UU，且共享 index 已包含其他任务修改。本会话没有执行 stash/merge/暂存。曾实测 `node --check trusted/page.js` 因冲突标记 SyntaxError；转交期间另一负责人正在移除标记、更新来源 pin，不能假设文件已稳定或索引已解决，也不能抢占其 Git writer。续接需重新读 status、ls-files -u、staged diff 和最新文件；保留双方变更，不能 ours/theirs 整份覆盖，local-project 由其负责人处理。

远端已合入 R1.11 固定内置适配器的安装/启用身份策略（取消重复 prompt 站点授权）、方形按钮、直接复制反馈；当前预览另有 R1.10/R1.12 待视觉确认设计。逐项核对批准状态；不要把待确认布局全部迁正式，也不要恢复旧策略覆盖远端已合入代码。集成后的 page 新 blob 必须同步精确来源 pin/测试，并只复验受影响项。旧冻结 CFT 的页面证据不能证明集成后新策略已实测。

**八维评分全部 NOT_SCORED**：管理 UI 视觉、信息层级、操作效率、网页按钮定位外观、Tooltip 与可访问性、数据完整性、原生右键权限、生命周期可靠性。已有局部 PASS，但尚无同一最终集成候选的完整证据；管理首页授权提示仍笼统，不能全面95。

**剩余**：中文 IME 真实组合态（已有 zhong 未证明中文候选）、SPA/会话切换与重渲染、BFCache、多标签编辑同步、真实失败完整复制与未知结果不重试、Tooltip 移入保持/边界、菜单票据过期/文档变化/撤权/停用卸载失效、隔离 Profile 卸载重装/清数据、production/ZIP 同候选身份验收，均继续 NOT_TESTED；日常安全刷新为 BLOCKED。本任务尚未由本会话提交/推送，未查本次 CI。同步负责人完成后串行核对共享 index，仅提交本任务明确路径，Lore 提交、正常 push main、再查对应 commit CI，不能混入 native-agent/local-project 或 ai-vip-share。


## R1.13 正式迁移修复：2026-10-16

- 正式工具从 main 已存在的 1.0.2 继续递增为 1.0.3；不创建第二个工具或预览文件。
- 修复受限 Sandbox 中 `crypto.randomUUID` 不存在时安全创建失败：优先 `randomUUID`，不可用时仅使用 WebCrypto `getRandomValues`，拒绝可预测 ID。
- 修复历史 `name: ""` 与缺失 `name` 的读取兼容（内存规范化，不在加载时偷偷落盘）；编辑旧圆形按钮不隐式更改形状。
- 规范正式 UI 为正文优先单行卡、三行滚动输入、预览前置、按钮设置默认展开且可手动收起；空正文就近反馈。
- 列表使用真实浏览器用户点击触发工具文档直接复制（先 `execCommand('copy')`，再尝试 Clipboard API），不再向 Host 发送不存在的 `clipboard.writeText` operation，也不弹手动复制面板。两种剪贴板方式都失败必须明确提示。
- 新增 Node 测试覆盖 `你好` 的写入、重新挂载读回、防重复、缺少 randomUUID、旧形状、失败、未知结果与空正文；R1.13 修改只属于独立工具及来源测试。
- 当前记录是源码修改说明：Node / CI / PACKAGE / 已安装 Mac Chrome / ChatGPT / IME 实际结果必须以运行日志单独补证，未取得之前为 `NOT_TESTED`。不得把用户既有保存失败误诊为某一单一根因。


## R1.13 正式工具交付与产品验收证据（2026-10-16）

### 已实施并由原始 CI 复核

- 入口 `examples/sidebar-tools/prompt-shortcuts/`，保持独立 Sidebar Tool；未改动 `trusted/page.js` 与 `trusted/policy.js`，未新建 Host/SDK/网页注入入口。正式工具版本自最新 main 的 1.0.2 升为 **1.0.3**。
- 修复 `trusted/model.js` 的 `crypto.randomUUID` 环境风险：采用 `getRandomValues` 安全回退，随机源不可用时拒绝而非生成可预测 ID；`name=""` 与名称缺失可只读规范化；编辑旧 round 形状不覆写。该安全模型新 blob `109107c49eb73609fd68b1292138e8e60588f986`，更新精确来源审计与测试。
- `src/main.js`、`src/index.html` 与 `src/style.css`：紧凑正文优先列表、手动标题次级、固定三行正文滚动、前置实时预览、按钮设置默认展开与可手动折叠、空正文就近报错。移除不存在的 Host `clipboard.writeText` 调用，改为真实点击下直接复制尝试并明确失败反馈；不引入额外复制弹窗。
- Node `node --test tests/environment/prompt-shortcuts-r14*.test.mjs`：**20/20 PASS**；`sidebar-tools.test.mjs`：**6/6 PASS**；可信 JS 语法与候选包验证 PASS（GitHub Actions Run [38865261384](https://github.com/shopable-ai/opendesk-browser/actions/runs/38865261384)）。
- 原始包：`examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json`，**1.0.3 / 43,684 B**；SHA-256 `416b658d39669b9d775b836636aa49f35d3a88165fa9a268a3a15ed20632d71d`。CI Test 先通过再发布固定包（此前已由 [fac526ca](https://github.com/shopable-ai/opendesk-browser/commit/fac526ca3ef9b735eda88c298294e0ce37b6932c) 发布）；Run 38865261384 在最新 main 上重新运行官方 `--check-project`，明确返回 `PROJECT_PACKAGE_MATCH`、相同 SHA 和 `installed:false`。
- **正式代码真实 Chromium（模拟 Host）**：Run 38865261384 执行 `scripts/tests/prompt-shortcuts-r113-formal-chrome.mjs`，加载构建器输出正式 HTML/CSS/JS/可信 model，模拟 Host ETag/localStorage；`你好` 新建与浏览器 reload 后仅一项 PASS，320/360/400/440px 无横向溢出、正文两行截断、100 行内部滚动、默认展开/手动折叠、草稿保护、深色截图和 JS Console 无异常 PASS。其模拟身份明确是 `FORMAL_PACKAGED_UI_REAL_CHROMIUM_SIMULATED_HOST`，不是已安装 Browser。原始截图和 JSON：[GitHub Actions artifact 12030876980](https://github.com/shopable-ai/opendesk-browser/actions/runs/38865261384/artifacts/12030876980)。
- **旧预览**：同一 Run 的独立 Chromium R1.11/R1.12 模拟测试 PASS，图片与 JSON：[artifact 12030797378](https://github.com/shopable-ai/opendesk-browser/actions/runs/38865261384/artifacts/12030797378)。不与正式打包源码测试混合。
- **真实根因状态**：存在源码可定位的旧形状覆盖、缺少 UUID 回退、旧数据拒绝、非法 clipboard Host 操作，现已修复并回归；但用户 Mac 上「只输入你好后保存失败」未获取原始 Host Console / installed package / storage 失败日志，因此不宣称已证明唯一真实根因。

### 尚待真实 Mac 和专家逐维评分

| 验收层 | 状态 | 不得推断 |
| --- | --- | --- |
| Node + 可信来源测试、正式包构建 | PASS | 不意味着安装 |
| 正式 HTML/CSS/JS 在 Chromium 模拟 Host | PASS | 不是真实 Chrome Host 存储 |
| 同 ID 已安装正式工具升级与数据保留 | NOT_TESTED | 尚未获取 Mac 安装身份和加载包哈希 |
| 真实 `chatgpt.com` 编辑器插入与回退 | NOT_TESTED | 模拟网页不等于真实输入框 |
| Mac 中文输入法、撤销、SPA/撤权与真实生命周期 | NOT_TESTED | 无原生交互证据 |
| 九维 95+ 独立评估 | NOT_SCORED | 只能设目标，不能以平均值或模拟分充数 |

后续实机最短路径：在用户 Mac 核对最新 main、实际安装版本/SHA、既有 `npm run dev` watcher，不覆盖其他 Agent 的环境；通过正式可信安装链同 ID 安全升级到 1.0.3；在真实 Host 只输入「你好」保存、关闭重开验证唯一一条、失败时记录来源与 ETag/Console；再在真实 ChatGPT 验证按钮插入而不发送、无法插入时剪贴板回退、选区右键、停用/撤权/SPA 与 IME，并上传产品截图。未进行这些步骤不标 Native PASS。


### R1.13 1.0.4 最终视觉审计增量（2026-10-16）

- 真实 Chromium 正式源码截图发现 P1 视觉回归：`src/main.js` 在设置 `use.className='ps-card-use'` 时丢弃共享组件 `od-button--quiet`，正文主点击区意外继承全局蓝色主按钮背景；**基于真实证据修复** `use.className='ps-card-use od-button od-button--quiet'`。新增真实 Chromium 计算样式断言，确保正文区域背景透明 `rgba(0, 0, 0, 0)`、文本 `rgb(27, 44, 73)`，与主按钮 `rgb(54, 94, 218)` 明显区分；保持共享 Token，不复制蓝色样式到工具代码。
- 正式版本安全递增为 **1.0.4**，经官方 CI 流水线 [38865919989](https://github.com/shopable-ai/opendesk-browser/actions/runs/38865919989) 最终取得两项 Job PASS（工具专项 20/20、共享 Sidebar 6/6、语法、候选生成、旧预览 Chromium、正式打包源码 Chromium）；官方唯一包同步提交 [10cba371](https://github.com/shopable-ai/opendesk-browser/commit/10cba371dffca3d4a88065a0add15973df06fa6a)。
- **最新 1.0.4 唯一正式安装包** 43,711 B；SHA-256 `c79bd798ca499cf50942fa2a99e85682f6d50701c88b544b25e0d342007a8af4`；同步后最新 main 官方 `--check-project` 为 `PROJECT_PACKAGE_MATCH`、`installed:false`。
- 最终正式源码截图：[artifact 12031276252](https://github.com/shopable-ai/opendesk-browser/actions/runs/38865919989/artifacts/12031276252)。其自动化报告 `kind=FORMAL_PACKAGED_UI_REAL_CHROMIUM_SIMULATED_HOST`, `version=1.0.4`, `helloSaveAndReload=true`, `uniqueCount=1`, 8 组跨宽度列表/百行表单截图、深色模式、`consoleExceptions=[]` 与共享 Quiet Button 透明背景断言均通过。
- 本项修复完结范围只为源码与真实 Chromium 模拟 Host 级；**已安装 Mac Chrome / 真实 ChatGPT / 中文 IME** 依然 `NOT_TESTED`，未达最终实机 95+ 验收，绝不以视觉截图冒充实机通过。

## R2.0 跨网站双选择器正式实施交接（2026-10-16）

**目标**：保留 ChatGPT 正式快捷按钮、原提示词管理及右键菜单；通过两个面向用户的选择器，使普通网站可自行配置，而不是为每个站点写固定扩展代码。

**源码归属及复用**：`examples/sidebar-tools/prompt-shortcuts/trusted/model.js` 提供 `sites` 规则校验，`trusted/policy.js` 管理 Origin/启用条件，`trusted/page.js` 负责可信元素选择、高亮、定位与安全插入；`src/main.js`/`index.html`/`style.css` 增加管理配置，`src/ui/sidebar-tools.js` 仅复用既有当前活动 Document/Tool Host 消息中转，绝不扩大为通用执行器。固定构建白名单仍通过 `scripts/bundle-provenance.mjs` 绑定对应 Git blob。

**通路**：工具「管理网站 → 配置当前网站」→ 页面选择容器 → 页面选择编辑器 → 页面双目标检查 → `sites` 单独带 ETag 保存 → 页面监听本工具存储 → 刷新/SPA 重新载入规则 → 独立快捷按钮 → 用户单击安全插入；任何不唯一/不可见目标、撤销、跨来源与未知编辑效果均 fail-closed。ChatGPT 默认入口不受其他网站配置损坏影响。

**测试入口**：`tests/environment/prompt-shortcuts-r14*.test.mjs` 增加定向可信页面/独立存储/UI 回归；`tests/environment/prompt-shortcuts-r20.test.mjs` 验证 Origin、路径边界与非可执行选择器。CI 工作流继续使用 `.github/workflows/prompt-shortcuts-r14.yml` 和真实 Chromium 的正式 UI/Mock Host 截图；不把 Mock Chromium 当作安装到真实 Chrome 的证据。

**实机待取得**：Mac 日常 `dist/development` watcher 身份、Chrome 扩展 ID、实际工具包 SHA、Claude/Gemini 登录站点编辑器框架状态/Undo/中文 IME、停用与安装升级验收。缺少原生设备或登录站点时标记 `NOT_TESTED`，不制造 ≥95/100 的测试评分。

**产品验收门槛**：两个选择器明确可见且能自选、没有新权限泛化、用户原草稿不被覆盖、实时网站匹配不会误写、多站规则独立保存、构建官方单包同源校验及 CI 原始链接可核实。只有完整闭环实证才能授予各维 ≥95 分。


## R2.1 双选择器与单行输入安全修复（2026-10-16）

- 固定可信 `trusted/page.js` 的取点原实现只捕获 `pointerdown/click`，不能阻止网页的 `pointerup/mouseup/dblclick` 或 Enter/Space 键盘副作用。改为全手势捕获、Esc 中止、取点后同目标尾随双击 750ms 防护；未新增 Host / SDK 能力。
- 单行 `input` 追加不再使用换行前缀；合法单行正文使用空格分隔。多行提示词或原生 `maxLength` 不足时在聚焦和原生写入之前失败，并复制完整正文，不修改旧草稿。
- 来源白名单及 Node 测试中的 `trusted/page.js` Git blob 只更新精准 SHA，没有放宽目录或特权目标名单。新增 Node 回归专测取点、Esc、单行插入和失败保留原文。
- `tool.config.json`、Sandbox UI、存储和唯一 `1.1.0` 正式 JSON 包均未改动，**用户真实 Chrome 必须加载新构建的固定可信代码**。此提交只能代表源码修复，Node / CI / Chromium / 已安装 Chrome / Claude / Gemini / Mac IME 必须分别依真实运行证据定级，不能自动宣称通过。

## R2.1 实际 Chromium DOM 回归与证据边界（2026-10-16）

- **变更来源**：正式可信页面适配器与定向 Node 回归已在 GitHub `main` 提交 [`68a32c4`](https://github.com/shopable-ai/opendesk-browser/commit/68a32c455ed30aea7bac90f4ad8c818ba9749c17)。`trusted/page.js` 的 Git blob 为 `2910b582d88bd3c3c46fbc1f2da110fc10475047`，bundle-provenance 仍为**精确单 blob**准入。
- **Node**：正式专项工作流在 [Run 38887978223](https://github.com/shopable-ai/opendesk-browser/actions/runs/38887978223) 获得 74/74 Prompt Shortcuts 定向测试和 6/6 Sidebar Tool 打包基础测试 PASS，4 项 R2.1 防误触与单行编辑前置回归 PASS。此结果仅证实 Node 和包装契约。
- **真 Chromium DOM Fixture**：新增 `scripts/tests/prompt-shortcuts-r21-page-chromium.mjs`，集成现有 `.github/workflows/prompt-shortcuts-r14.yml`，于 [Run 38889688026](https://github.com/shopable-ai/opendesk-browser/actions/runs/38889688026) 的 `prompt-shortcuts-scope` 和 `sync-project-package` 两个 job 均获得 SUCCESS。使用真实 Chromium CDP 鼠标对真实页面 DOM 完成 `#workspace` 容器选取、`#draft` textarea 选取、选择器检查、原草稿+中文 Emoji+空行完整插入、不误触网页事件、停用/重新启用、刷新后规则保留、单行输入安全复制回退；`consoleErrors=[]`；截图与 JSON 报告作为 CI artifact 保存。
- **必须标注的模拟边界**：上述 Fixture 通过 HTTP 测试网页、固定正式页面模块、真实 Chromium 浏览器和真实 DOM/点击执行，**但是扩展 Host、工具安装注册表和存储模拟**，不包含用户实际 Chrome Extension ID、`dist/development`、真实 Side Panel 安装更新、第三方站点账号、真实 Mac IME，因此只能标记 `CHROMIUM_FIXTURE_PASS`。其余分别保持 `INSTALLED_CHROME_PASS=NOT_TESTED`、`REAL_SITE_PASS=NOT_TESTED`、`MAC_IME_PASS=NOT_TESTED`，不得按 95+ 正式产品闭环发版。
- **正式可安装工具包**：唯一 `prompt-shortcuts.opendesk-tool.json` 仍为 `1.1.0`，未修改 Sandbox JS/HTML/CSS 或工具权限；最新同源 CI 生成 65,794 UTF-8 bytes，SHA-256 `39c94ed1ac02ceffbc804dabbf3b8343ef7982653f3878e06b0dbb0362d5406e`，正式包 Git blob `1db538839635434c1cace7d778eef1117b83a74b`。新的可信 `page.js` 只有用户的 Chrome Extension 重新加载新构建才会真正生效；仅导入旧/新 JSON 不能代替更新可信扩展。
- **仍需 Mac/真实网站验收**：在用户现有 `npm run dev` 和固定 `dist/development` 下核实原 Extension ID / Source SHA / 工具已装版本；从其他网站实际操作“双取点 → 测试 → 保存 → 刷新 → 真实原生插入 → Undo → IME → 撤权”，再按网站记录 ChatGPT / Claude / Gemini 的 PASS/FAIL/NOT_TESTED。ProseMirror、Lexical、React 受控编辑器的状态持久和 Undo 不能从 textarea Fixture 推断成功。各维专家评分无真实证据的部分一律 `NOT_SCORED`，禁止平均分掩盖。


## R1.17 正式 UI 图标化交接（2026-10-16）

- 来源：R1.16 `preview/index.html`，优先复用图标语义与键盘焦点规则，不再以新建原型替代独立工具源码。
- 范围：`src/index.html` / `src/style.css` / `src/main.js` 的新建 SVG、列表单一 More 与六操作图标、展开/Esc/排序/删除焦点、创建表单去冗余与保存并继续；未动通用 Host/SDK/Trusted 规则。
- 真实数据回执：继续通过 `storage.set` + `ifMatch` 与异常 `storage.get` 校对。失败与写入结果未知时必须保留输入，不将模拟点击记为成功。
- 安装状态：GitHub Actions Node/Chromium 只验证正式打包源及模拟 Host；Mac 已安装工具同 ID 更新、真实 ChatGPT、第三方编辑器与 IME 均须单独取得实测证据，不得提前评分 95+。

### R1.17 已核验构建与 Chromium 证据（2026-10-16）

- R1.17 正式 UI 已在 `main` 落地：列表默认仅一个 More 图标，展开后编辑 / 启停 / 上移 / 下移 / 复制 / 删除为六个独立纯 SVG 图标（无按钮可见文字），保留 `title` / `aria-label`、40px 目标、Esc、禁用与删除文字确认；新建 Plus 图标及条件存储计数、保存并继续均使用正式工具源码。
- [专项 CI Run 38892514805](https://github.com/shopable-ai/opendesk-browser/actions/runs/38892514805)：`prompt-shortcuts-scope` 与 `sync-project-package` 两项 SUCCESS；Prompt Node **76/76** PASS；共享 Sidebar Node **6/6** PASS；正式 HTML/CSS/JS 语法与打包一致性检查 PASS。
- 正式包真实 Chromium / **受控 Mock Host**：320/360/400/440px 六操作 SVG-only/无横向溢出、40px hit target、ARIA、Esc 关闭恢复焦点、连续保存并继续、重开读回等 PASS，`consoleExceptions=[]`。预览 Chromium 与 R2.1 网页 DOM 双选择器 Chromium Fixture 均 PASS；这些不是已安装的原生扩展测试。
- 唯一正式可安装 JSON：`prompt-shortcuts.opendesk-tool.json`，版本 **1.1.1**，**71,146 UTF-8 bytes**，SHA-256 **`d8194d106eaa4c171203c5ad3f131bbdb4b65864e8036d5cb7460abff4a4ffc5`**；自动同步提交 [2f4ddbc](https://github.com/shopable-ai/opendesk-browser/commit/2f4ddbc749badfcddc0412442dfdf1e15c5b0b36)；`--check-project` = **PROJECT_PACKAGE_MATCH**。
- 尚未取得 Mac 本地 `dist/development` 同 ID 安装升级、真实 Host 存储事务、已登录 chatgpt.com/第三方网站实际编辑器插入、撤权、中文 IME/Undo 的原生证据：分别为 **NOT_TESTED**。九维专家 95+ 是后续正式产品验收门槛，不得把模拟 CI 当成已满足。
