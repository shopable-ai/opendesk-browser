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
