# Extension Creation Workflow R2 · 一句话需求推理三案例验证

> 日期：2026-10-15；Owner：当前 Extension Creation Workflow R2 文档任务；状态：**THREE_CASE_REASONING_DESK_REVIEW / STRUCTURAL_CHECK_PASS / REPEATED_MODEL_EVAL_NOT_TESTED / NATIVE_NOT_TESTED**。
>
> 写入边界：本文件与 `docs/framework/browser-tool-creation-workflow.zh-CN.md`、`.agents/skills/README.md`、`.agents/skills/opendesk-sidebar-tool-dev/SKILL.md` 的最小上游路由说明；仅 GitHub `main`，基线 `f77e2ca143c96e9849107b0ceee6f55382867d9a`（写前只读，最终以每个文件的提交 SHA 为准）。不占用 Mac、Chrome/CFT、Native、`dist/development`、watcher、端口或共享本地 Git 索引；不写其他工具源码、已有交接和 Skill，不接管并行开发者。
>
> 这是**一次有源码佐证的人工/模型需求推理演练**，不是三个独立的联网模型盲测，不是 UI 交互实验，也不是产品已实现证明。测试输入每例仅一句；“参考答案”来自当前仓库和可核实的历史产品决定，后验对照不得偷换为“用户一开始说过”。

## 方法与证据基线

**实验步骤**：①只把“用户原话”作为输入；②先列应推导的用户动机、主路径及至少一个失败路径；③按 AGENTS → 已批准产品文档/原型 → 正式源码 → 测试，恢复真实约束；④生成不增补无关业务的 P0 功能树叶子；⑤逐叶标明 S-ID、A-ID、界面、权限/数据、成功/异常；⑥列出如果只按一句话直接写 UI 会漏什么；⑦将源码事实与真实运行状态分级。所有 F/S/A 只在**本案例内部**稳定，同一真实工具已有正式需求编号时应采用其权威编号并记录映射，不在工具 README 另造竞争编号体系。

- 源码锚点：`examples/sidebar-tools/quick-notes/{tool.config.json,src/main.js,README.md}`；`examples/sidebar-tools/bookmark-manager/{tool.config.json,src/main.js,src/service.js,README.zh-CN.md}`；`src/framework/workflow/{contract.js,compiler.js}`；`src/ui/workflow/provider.js`；`.agents/skills/README.md`。
- 历史决策锚点：`docs/framework/workstreams/prompt-shortcuts-r12-ui-handoff.zh-CN.md` 的 R1.2 双 HTML 与 R1.3 内容优先约定；`docs/framework/workstreams/bookmark-manager-r24-runtime-closure.md` 的 R2.5 写后核实和验证级别。
- **SOURCE_VERIFIED 只说明本次读取到源码、文档或已有原型；“项目是否已实装”必须另看运行路径与证据**。Prompt Shortcuts 当时目录扫描未发现 `examples/sidebar-tools/prompt-shortcuts/`，这是该次快照的发现，不保证以后仍不存在。
- 发现真实文档漂移：Quick Notes `tool.config.json` 写 `version=1.1.9`，其 README 多处仍写 `1.1.8`。本任务不抢改另一工具文档，但未来交接必须以配置/打包产物为当前版本，不能把 README 数字当实时包身份。

## Case A — Quick Notes：防止简单工具被过度设计

**唯一模拟输入**：「我想在浏览器侧栏随手记点东西。」

**R2 候选功能树（先有树，后有 UI；编号只对叶子做验收）**：

```text
F-QN-000 快速侧栏笔记
├─ 进入与内容维护 [P0]
│  ├─ F-QN-001 入口与首次空态
│  ├─ F-QN-002 输入、保存与重开
│  ├─ F-QN-003 多笔记编辑及未保存保护
│  └─ F-QN-004 删除前确认
├─ 本地可靠性 [P0]
│  ├─ F-QN-005 并发/失败与草稿保护
│  └─ F-QN-006 重开/卸载生命周期
└─ 已有附加能力 [P1，非本句 P0]
   └─ F-QN-007 用户主动关联网页
```

**用户旅程 S（模型候选）**：从扩展中心主动打开 → 空态输入 → 明确保存 → 切换或再打开验证内容；编辑现有内容 → 保存/取消；删除要确认；保存失败/并发/工具关闭时给出可恢复反馈。**用户只请求随手记，不等于请求网站注入、云同步、AI 总结、账户体系或后台自动上传。**

| F-ID / 等级 / 依据 | S-ID、用户在哪怎样操作 | A-ID：可观察成功与失败恢复 | 数据/权限与归属 |
| --- | --- | --- | --- |
| `F-QN-001` P0 `AI_INFERRED` | `S-QN-001` 「扩展→应用」打开笔记，首次显示空态和输入区 | `A-QN-001` 用户可识别主操作；初始读取失败不能假设空集合并覆盖旧数据 | Side Panel 沙箱；安装/打开依官方 Tool Host |
| `F-QN-002` P0 `USER_CONFIRMED`+源码 | `S-QN-002` 在当前编辑区写正文、按保存、重开 | `A-QN-002` 真实存储读回一致才可认定持久；写失败保留输入并提示未保存 | `storage.local`，`OpenDeskTool.request`，不用网络 |
| `F-QN-003` P0（已有产品）`SOURCE_VERIFIED` | `S-QN-003` 新建/选择其他笔记、编辑、返回 | `A-QN-003` 未保存草稿在切换前明确确认；取消返回原编辑，焦点可恢复 | 已有 `src/main.js`，不另建第二个编辑器存储 |
| `F-QN-004` P0（已有产品）`SOURCE_VERIFIED` | `S-QN-004` 点击删除当前笔记 | `A-QN-004` 显示二次确认；取消无更改；失败/结果未知不自动再次删除 | 工具自有笔记存储，非 Chrome 原生书签 |
| `F-QN-005` P0 `AI_INFERRED`+源码 | `S-QN-005` 双窗口编辑冲突/配额不足/保存超时 | `A-QN-005` `withEtag/ifMatch` 拒绝旧写，正文保留并要求核对；不得假报成功 | `notes` 单键受 8 KiB 与工具总额限制 |
| `F-QN-006` P0 `SOURCE_VERIFIED` | `S-QN-006` 关闭/重开，或审阅卸载影响 | `A-QN-006` 已保存内容可恢复；草稿不是崩溃备份；卸载工具会清除该工具数据并明确告知 | 现有安装/卸载协议，未增加同步/备份 |
| `F-QN-007` P1（非一句话 P0）`SOURCE_VERIFIED` | `S-QN-007` 用户**主动**选择关联当前网页 | `A-QN-007` 有权限才取标题/URL；受限网页时仍可离线记笔记 | 已有 `currentPage.read`，不自动读取全文 |

**推理审计**：忽略的必要项是存储失败、未保存草稿和删除确认；若只画一个 textarea 会造成“假保存成功”。反向过度设计是为一句笔记请求增设同步账户、AI、全网页访问权限或任务调度：全部 **OUT_OF_SCOPE**，并非新用户批准。现有 `tasks.open` 是源码已有能力，不因一句话自动提升为 P0。**设计结论：一个 Side Panel 主界面足够**；现有额外能力保持但不强迫普通用户理解。

## Case B — Prompt Shortcuts：历史产品决定不能被一句话覆盖

**唯一模拟输入**：「我想在 ChatGPT 页面左边放几个常用提示词按钮。」

**R2 候选功能树（保持 R1.2 双界面）**：

```text
F-PS-000 提示词快捷按钮
├─ 独立侧栏管理 [P0]
│  ├─ F-PS-001 正文唯一必填、自动短标签
│  ├─ F-PS-002 列表/编辑/排序/删除确认
│  └─ F-PS-003 两个互不影响的总开关
├─ ChatGPT 网页快捷使用 [P0]
│  ├─ F-PS-004 主内容左边缘按钮和 Tooltip
│  └─ F-PS-005 安全插入草稿、不自动发送
├─ 多入口与状态 [P0]
│  ├─ F-PS-006 选区右键预填并确认
│  └─ F-PS-007 持久存储与跨页面同步
└─ 权限和扩展边界
   └─ F-PS-008 ChatGPT 许可/清理 [P0]；其他 AI 站点 [P1]
```

**恢复前提**：若仅看这句话，会漏掉已核实 R1.2/R1.3 交接中的两个独立 HTML、右键选区快速添加、两个独立开关、**正文唯一必填**、ChatGPT 左主内容边缘、**点击只插入不发送**、未来多 AI 平台架构等。它们不能凭空改为新站点支持，也不能把既有模型原型当生产实现。界面 1：`prototypes/sidebar/chatgpt-prompt-shortcuts-r12-preview.html`；界面 2：`prototypes/sidebar/chatgpt-prompt-shortcuts-r12-sidebar-preview.html`。

| F-ID / 等级 / 依据 | S-ID、用户在哪怎样操作 | A-ID：可观察成功与失败恢复 | 数据/权限与归属 |
| --- | --- | --- | --- |
| `F-PS-001` P0 `USER_CONFIRMED`（历史记录） | `S-PS-001` 在独立 Side Panel 只输入多行正文后保存 | `A-PS-001` 空正文不可存；名称/短标签缺省时取最前两个非空白 Unicode 字素簇并保留 auto 标志；保存失败保留草稿 | 独立 `prompt-shortcuts` 工具存储，不新建第二 ID |
| `F-PS-002` P0 `USER_CONFIRMED` | `S-PS-002` 在侧栏查看、编辑、启停、排序、复制和删除 | `A-PS-002` 改动可读回；危险删除二次确认；取消、冲突或离开不丢未保存输入 | 侧栏列表/表单/确认；授权原宿主存储 |
| `F-PS-003` P0 `USER_CONFIRMED` | `S-PS-003` 分别打开/关闭网页按钮栏与选中文字快速添加开关 | `A-PS-003` 两开关互不影响；禁右键时菜单不出现；关闭按钮栏不删除已存提示词 | 已有原生菜单与安装/Origin 许可链（接口仍待正式接线） |
| `F-PS-004` P0 `USER_CONFIRMED` | `S-PS-004` 已获授权 ChatGPT 页面显示主内容左侧居中短按钮 | `A-PS-004` 左侧定位、可见短标签和多行 Tooltip；窄屏安全折叠，不移到右边；权限失效清理 | 网页 ISOLATED/经审计固定适配器，非工具 iframe 任意 DOM |
| `F-PS-005` P0 `USER_CONFIRMED` | `S-PS-005` 用户已写草稿、把光标置于中间后按提示词按钮 | `A-PS-005` 完整多行正文插入正确草稿位置，原文本、光标和 IME 不被破坏，**绝不自动发送**；编辑器不存在则拒绝 | 可信 ChatGPT 编辑器适配；真实站点输入仍 `NOT_TESTED` |
| `F-PS-006` P0 `USER_CONFIRMED` | `S-PS-006` 网页选中文字→Chrome 原生右键→侧栏新建 | `A-PS-006` 一次性选区预填正文，用户审阅后明确保存；取消不落库、撤权/文档变更后票据不可消费 | `browser.contextMenu`、`browser.launch.consume`；不得自造 Worker |
| `F-PS-007` P0 `AI_INFERRED`（源契约需要） | `S-PS-007` 管理页更新后返回多标签网页、同时修改同一条 | `A-PS-007` 列表/按钮与两个开关最终同步；ETag/配额/未知结果时保留草稿，不用两个独立 HTML 的内存冒充真实同步 | `storage.get/set`、`ifMatch` 和官方消息/授权边界，尚无真实产品证据 |
| `F-PS-008` P0 安全边界 + P1 扩展 `USER_CONFIRMED` | `S-PS-008` 首次授权、离开网站、停用/卸载、将来新增 AI 网站 | `A-PS-008` 首批只允许 `https://chatgpt.com`；撤权/SPA/关闭后无陈旧按钮或请求；新增站点必须单独审查适配器与 Origin | 多 AI **架构预留**≠多 AI 网站已交付；不上传聊天历史 |

**推理审计**：最危险的漏项是把“左侧几个按钮”直接画成 HTML，而忘记创建/保存/编辑、右键选区、两个开关、草稿插入与网站授权。最危险的无依据新增是自动发送、自动采集历史、默认所有网站 host 权限、创建第二个独立 Chrome 扩展。R1.2 两份 HTML 的**位置与交互决定**保留，仅做受影响的局部修订；`S-PS-007` 所要求的真实跨页面同步尚未因模拟原型存在而通过。

## Case C — Bookmark Manager：写入回执、用户确认与原生效果必须分开

**唯一模拟输入**：「我想像整理文件夹一样管理浏览器书签，编辑起来方便一点。」

**R2 候选功能树（编辑 UI 是候选，SDK 权限不是候选）**：

```text
F-BM-000 书签管理
├─ 浏览已授权的原生树 [P0]
│  ├─ F-BM-001 Full 授权与拒绝态
│  └─ F-BM-002 分页/树/搜索及过期恢复
├─ 整理和操作 [P0]
│  ├─ F-BM-003 就近编辑/取消的易用性候选
│  ├─ F-BM-004 新建与移动
│  └─ F-BM-005 非空文件夹删除确认与票据
└─ 原生数据可信性 [P0]
   ├─ F-BM-006 写后读回、冲突与未知结果
   ├─ F-BM-007 事件缺口/撤权/旧请求清理
   └─ F-BM-008 卸载工具不删除原生书签
```

**恢复前提**：源码 `examples/sidebar-tools/bookmark-manager/` 为独立工具，配置 `version=0.3.5`，使用 `OpenDeskSDK.browser.bookmarks.*`、可选 Chrome Bookmarks 与 `browser.bookmarks.full`。R2.5 的主从编辑属于当前源码候选；“完全原位编辑、不进入子视图”可作 UI 候选，但不能仅凭这句话称用户已批准或源代码已实现另一轮 R2.6。当前源码的 `mutation()` 写后重新读原生树并验证是**SOURCE_VERIFIED**，当前候选的真实 Mac Chrome 保存仍 **NOT_TESTED**。

| F-ID / 等级 / 依据 | S-ID、用户在哪怎样操作 | A-ID：可观察成功与失败恢复 | 数据/权限与归属 |
| --- | --- | --- | --- |
| `F-BM-001` P0 `SOURCE_VERIFIED` | `S-BM-001` 从扩展中心安装/打开，首次请求全量书签 | `A-BM-001` 必须经 Tool Full Consent 与 Chrome optional 权限；拒绝/撤权时清除受保护树、可恢复授权，不冒充空树 | `browser.bookmarks.full` + Chrome `bookmarks` |
| `F-BM-002` P0 `SOURCE_VERIFIED` | `S-BM-002` 搜索、展开目录、浏览大量书签 | `A-BM-002` 分页读取完整授权范围，结果与原生 ID 一致；快照过期/漏事件重新同步，不把首屏视为全部 | 既有 Full SDK `getTree/search`，不直接 `chrome.*` |
| `F-BM-003` P0 易用性候选 `AI_INFERRED` | `S-BM-003` 选中某一书签，就近修改名称/URL 或目录名、保存/取消 | `A-BM-003` 编辑不要求反复打开无关子页面；焦点、原草稿及失败反馈可恢复；需与真正 R2.6 最新已批准 UX 核对才定稿 | 独立工具侧栏，沿用 `src/main.js` 与 Service，不直接修改宿主树 UI |
| `F-BM-004` P0（已有 CRUD）`SOURCE_VERIFIED` | `S-BM-004` 新建书签/目录、移动至目标文件夹 | `A-BM-004` 验证目标父级和来源；来源网页变动或目标不可写则拒绝；未核实写后结果不提示已保存 | SDK `create/move`，网页收藏有 documentRef/tabRef 二次检查 |
| `F-BM-005` P0（危险动作）`SOURCE_VERIFIED` | `S-BM-005` 删除普通书签或非空目录 | `A-BM-005` 用户明确确认；非空目录先 `prepareRemoveTree` 后持一次性 `ticket` 调 `removeTree`；变更、过期则拒绝 | 必须由可信 Host 验证子树；不能只看客户端弹窗 |
| `F-BM-006` P0 `SOURCE_VERIFIED` | `S-BM-006` 编辑保存遇到网络中断、外部改变、未知结果 | `A-BM-006` RPC resolve 不等于原生成功；Fresh Full SDK 读回 ID/名称/URL/位置证实才显示成功；未知结果锁住重复危险提交、保留草稿并提示核对 | 现有 `mutation()/confirmedWrite()`；Chrome 无原子 CAS |
| `F-BM-007` P0 `SOURCE_VERIFIED` | `S-BM-007` 外部窗口更新书签、当前工具停用/撤权/关闭 | `A-BM-007` 观察事件缺口/Worker session 失效触发重读，不重放写入；撤权清屏且旧回调不可再显示受保护树 | SDK `observe.start/read/stop`、现有安装/会话栅栏 |
| `F-BM-008` P0 生命周期 `SOURCE_VERIFIED` | `S-BM-008` 卸载 Bookmark Manager 工具 | `A-BM-008` 仅撤销工具数据和访问，不删除用户 Chrome 原始书签；删除书签必须另有用户明确操作 | 原生书签由 Chrome 所有，不是 Tool 沙箱存储 |

**推理审计**：一句“方便编辑”不能自动放宽 Bookmarks Full 权限，也不能通过 RPC 成功就说保存成功；缺少安全删除、观测缺口恢复、数据/卸载归属都属于 P0 致命漏项。反之，没有明确用户许可不能自动批量删除、同步书签到云或开启全站点注入。原位编辑是**待对照最新产品决策的 UI 设计候选**，不借本 R2 工作流验证任务擅改 Bookmark Manager 页面。

## 反例与通过定义（反方审计）

| 输入/错误候选 | 必须拦截的失真 | 所属门禁 |
| --- | --- | --- |
| A：草稿文本仅存在于 textarea，却反馈“已同步到所有设备” | 无 `storage.local` 写入证据、无同步授权；`F-QN-002/005` 不成立 | Gate A + Gate C |
| A：一上来为笔记加入云服务/AI 或自动读所有网页 | 需求扩张，`USER_CONFIRMED` 不成立 | Gate A |
| B：按钮位于聊天输入框右侧，点击后自动发送 | 冲突 R1.2 明确位置及不自动发送；`F-PS-004/005` 不成立 | Gate A + Gate B |
| B：双 HTML 原型互相共享同一存储，所以产品“跨标签同步 PASS” | 模拟文件独立内存，不能代表已正式接线；`F-PS-007` 不成立 | Gate C |
| B：只声明 `page.prompts` 即宣称网页注入和原生右键完成 | 能力名字非实现/授权/撤权证据；`F-PS-006/008` 不成立 | Gate C |
| C：`sdk.bookmarks.update()` resolve 后立即提示“保存成功” | 缺原生 Fresh Readback；`F-BM-006` 不成立 | Gate C |
| C：非空文件夹前端确认后直接 `removeTree`，或撤权仍保留旧树 | 缺可信票据/授权与旧回调清理；`F-BM-005/007` 不成立 | Gate A + Gate C |
| 任意案例：因新对话重新编号并重画全套原型 | 没有差异影响追踪；历史决定和原测试身份丢失 | Gate D |

**本次实测边界**：已经逐案产生一次具体的场景→功能→验收候选，并与所列源码/产品决定做桌面审阅；不是通过独立 AI 重复运行得到的成功率。下一步真正验证 AI 稳定性时，固定每例的**单句输入**与可读 source SHA，在独立隔离会话多次调用同一主 Skill，盲判 P0 缺失、捏造能力、越权以及冲突历史决定；AI 自己写的样例不能直接担任独立评分者。**本轮不报 95+**。

## 本轮已执行的静态结构与负向校验

2026-10-15 通过已连接的 GitHub 读取真实 main 文件内容，在本对话运行只读 JS 结构核对（**未运行仓库 Node/CI、未调用另一个 AI 模型或 Chrome**）。输入身份：通用合同 blob `1c30a788e49b998adff4823db1a2161114689208`，案例 blob `58d3e692dd7018e537b6b8574aec5b0765cafbb4`。

- 9/9 阶段均包含门禁/恢复合同，**静态 PASS**。
- 3/3 案例包含位于追踪表**之前**的分层功能树；23/23 F-ID 叶子在本案例内恰好出现一次且有对应 S-ID 和 A-ID，**静态 PASS**。
- 三个故意破坏的样本：复制重复 F-ID、移除 S-ID、从树中删去一个叶子；校验均按预期捕获错误（**负向控制 PASS**），这些反例不代表用户行为已实测。
- 两个 Prompt Shortcuts 既有 HTML 原型文件均可读取；Quick Notes 配置 `1.1.9` 与 README `1.1.8` 漂移可复现；Bookmark Manager 配置 `0.3.5` 可核对。
- Markdown 围栏初次检查曾出现字面转义，已按失败结果定向修正并**重新检查 PASS**，保留该异常事实而不是伪称一次成功。

**结论只到 `STATIC_TRACE_PASS`**，不等于“AI 能稳定从一句话推理完整需求”已达 95。独立多次 AI 调用、网页交互、真实安装、数据/权限、同候选生产验收均 `NOT_TESTED`。改变树或 F/S/A 后必须重新核对；新的源码版本/原型需单独重新绑定其证据。

## 写入、验证与下一次最小接续

- 写入所有权：只管理本文件、通用主工作流与现有 Skill 路由/工具开发 Skill 的简短上游指引；Quick Notes README 版本漂移仅登记，不自行覆盖该工具 owner；Prompt Shortcuts 两份 HTML、Bookmark Manager 核心源码均只读。
- 可重复静态检查：校验各案例每个表格 F-ID 唯一且有对应 S-ID/A-ID、P0 含异常/撤权/保存/删除必需场景，反例确实引用功能编号；核对两篇仓库文档互相链接、工具目录与当前 SHA。它只证明静态追踪完整性，不证明模型泛化或产品。
- 待实证：独立多轮真实 AI 对话触发 Skill `REPEATED_MODEL_EVAL_NOT_TESTED`；HTML 交互 `NOT_TESTED`；三个候选同版本安装/权限/数据的 Mac Chrome `NOT_TESTED`；逐维 95+ `NOT_SCORED`。
- **最小下一步**：只选 Case A，按同一短句完成一次真实 Skill 读取→需求清单→可交互 HTML 的闭环，记录实际缺漏与纠正回合数；完成后再用 B/C 对照复杂权限和历史一致性，不提前添加新的编排器。

## R2 交接提交与状态（供新对话直接读取）

- **通用工作流**：`docs/framework/browser-tool-creation-workflow.zh-CN.md`，R2 正式内容最后格式修复提交 [`05349bfe`](https://github.com/shopable-ai/opendesk-browser/commit/05349bfe95e93428957551346b12c6b4687312bd)。
- **三案例证据**：本文件首次建立 `c10ac8e3`；完成显式功能树、Markdown 修正和静态检查账本前的提交 `88ae56f6`。当前文档内容以远端最新 blob 为准，不用旧 SHA 冒充当前成果。
- **只增加上游路由文字**：`.agents/skills/README.md` [`1ebebf44`](https://github.com/shopable-ai/opendesk-browser/commit/1ebebf44406caeec3698f05ac143aa6d3c2c7a4e)；`.agents/skills/opendesk-sidebar-tool-dev/SKILL.md` [`09b37872`](https://github.com/shopable-ai/opendesk-browser/commit/09b37872bd03b5909296fd193ba6650b667e378d)。未增加第九个 Skill、Runner、产品发布入口或 Runtime 代码。
- **最后一次远端回读**：上述四文件可读，R2 内容和引用均存在，Markdown 转义缺陷清除；当时 `main@8ee6c2c3999de7a68bb9f8e80ea242a9bf60c9bf` 已包含本次最后 Skill 提交，并已被其他独立提交正常快进。新对话重新取 HEAD/各 blob，而不把这个 HEAD 写成永久冻结。
- **完成边界**：`DOC_INCREMENT_COMMITTED` / `THREE_CASE_DESK_REVIEWED` / `STATIC_TRACE_PASS`；真实重复 AI 推理、现有 Skill 自动调用成功率、HTML 交互、Mac Chrome 产品验收 **NOT_TESTED**；工作流一键安装 **NOT_IMPLEMENTED**。下一轮先 Case A 原样复现，不能借此声明产品 ≥95。


## R2.1 Quick Notes 同源执行链（唯一低风险样板，新增可验证追踪）

**产品目标原句**：「我想在浏览器侧栏随手记点东西。」此任务已有独立实现 `examples/sidebar-tools/quick-notes/`，不复制新的 Quick Notes 工具。Source `tool.config.json` 的正式 ID 是 `quick-notes`，当前版本 **1.1.9**；README 仍有 1.1.8 历史引用，不能用它作为包身份。权限来自现有配置的 `storage.local/currentPage.read/tasks.open`；不申请远程同步、网站 DOM 或静默安装。

**以下是从第 1 案例 F/S/A 到真正文件的静态源码追踪表（不是新 Registry）。** UI 列为 `src/index.html` 的 ID，CODE 列为 `src/main.js` 的实际标识符，TEST 列为 `tests/environment/sidebar-quick-notes.test.mjs` 的已存在测试标题。此映射只证明能找到对应测试、未改变现有笔记行为；真正 PASS 必须再执行测试，数据/权限与 Chrome 另计。

| F-ID | S-ID | A-ID | UI（同源 HTML ID） | CODE（实际 JS 标识） | TEST（现有 Node 用例标题） |
| --- | --- | --- | --- | --- | --- |
| F-QN-001 | S-QN-001 | A-QN-001 | note-count,note-list | renderList | offline mode restores R1 note, preserves content on upgrade, and supports multiple notes |
| F-QN-002 | S-QN-002 | A-QN-002 | note-text,save-note,note-status | saveNote | Cmd+S saves after focus moves from the editor to another tool control |
| F-QN-003 | S-QN-003 | A-QN-003 | note-list,add-note,note-confirm | confirmDiscard | sandbox inline confirmation cancels and accepts dirty navigation without native modal APIs |
| F-QN-004 | S-QN-004 | A-QN-004 | delete-note,note-confirm-cancel,note-confirm-accept | deleteConfirmed | inline delete cancellation has no write and explicit acceptance removes migrated note |
| F-QN-005 | S-QN-005 | A-QN-005 | note-text,note-status | notesEtag | R18.1 two panels reject stale whole-array writes while keeping the losing draft |
| F-QN-006 | S-QN-006 | A-QN-006 | note-text,note-count | restore | offline mode restores R1 note, preserves content on upgrade, and supports multiple notes |
| F-QN-007 | S-QN-007 | A-QN-007 | attach-page,page-summary | refreshPage | HTTP page metadata is opt-in and never requires network for offline save |

**实际同源预览路线，不能用模拟执行冒充安装：**

```text
用户一句话 → R2 Phase 0–3 / Gate A（本 R2 案例推理与追踪）
→ 已有 quick-notes 的真实 index.html / main.js / style.css
→ scripts/build-sidebar-tool.mjs（原 JSON 包，稳定 tool ID）
→ scripts/preview/build-preview.mjs（同包 UI，仅替换安全 Mock SDK）
→ tests/environment/sidebar-quick-notes.test.mjs（保存/删除/并发/恢复 Node）
→ scripts/preview/check-preview-contract.mjs（包/Token/Source 新鲜度锁）
→ scripts/tests/sidebar-preview-runtime-chrome.mjs（离线 Chrome 模拟 HTML 与异常）
→ 真正安装扩展并确认安装 Quick Notes → 真机输入/保存/重开/升级/撤权读回
```

**运行的唯一现有 CI**：`.github/workflows/sidebar-preview-contract.yml`。它在 GitHub runner 上构建正式工具 JSON、生成 source-bound HTML、运行 Node 与 headless Chrome **离线 Mock**，这不授予真实 Chrome Extension、storage 或原生用户授权。未拿到本 R2.1 对应真实日志前这些步骤仍标 `CI_PENDING`。Mac 固定 `dist/development` 或正式候选 Profile **没有在本会话安装**。

**原生最后一段最小用户验收**（必须在可用 Mac Chrome、受控正式候选中执行，不盲用现有日常 Profile）：

1. 核对 `main` SHA、扩展实际加载路径/ID、`quick-notes` 包版本和 Hash；通过已有「扩展 → 导入/安装 → 审阅权限 → 确认安装 → 主动打开」完成实际授权，不得直接改 storage 伪装安装。
2. 新建「中文🙂两行笔记」→ 保存 → 退出工具→重开→读回完全一致；两窗口分别改同一条，验证旧 ETag 拒绝并保留败方草稿；错误/配额状态须可恢复。
3. 选择删除→取消应仍在；再次确认删除后必须真正重开仍无该笔记；未经确认不触发。
4. 使用旧格式 `note` 的**独立测试数据**演示升级到 `notes` 并验证旧数据未丢；版本更新要通过原安装器审阅而非卸载重装；安装失败/效果未知先查真实安装版本/包 Hash 和数据，禁止盲重试。
5. 检查停用/撤权/卸载的界面与数据效果，记录 Chrome 版本、Profile、扩展 ID、包 Hash、动作、原始结果、失败/截图及具体 A-ID。是否需要真实网页信息与 Tasks 是已有可选能力，不能被新一句话推定为 P0。

**最小状态投影（文档断点，不是运行时状态机）**：`需求/场景/功能树=DESK_REVIEWED`；`UI/正式源码=SOURCE_VERIFIED`；`Mock/Node/构建/离线 Chrome=CI_PENDING`（请以本轮相关 Actions 复核）；`安装/升级及用户数据读回=NOT_TESTED`；`自动调 Skill 完整交付=NOT_IMPLEMENTED`。

## R2.1 可测增量差异、对照实验与所有权

### 定向需求变化示例

- Prompt Shortcuts：「从输入框旁改为主内容左边缘」已经符合历史 R1.2 决策 → 先按最新两份原型与目标源码读回，当前只需确认 `F-PS-004 / S-PS-004 / A-PS-004`，不改两开关、`storage`、选区右键或 Host。若真实可信网页模块尚不存在，记 `CODE_NOT_IMPLEMENTED` 而非编造文件名。
- Quick Notes：「在刚才的笔记增加搜索」 → 候选为已有 `notes` 的本地只读过滤。先确认是否搜索标题/正文、列表范围、空结果；影响 `F-QN-001/003` 的列表操作、新的 A-ID、同源 HTML 及相应 Node/预览测试；默认不新建 Tool ID、不加权限或云端、**不迁移旧数据**。若采用持久搜索索引/新 schema，才重新分析迁移并再次确认。

### 有证据才报告效率提升

`scripts/agent-skills-r22-eval.mjs --mode reasoning` 在原 Codex 只读评测入口提供六个短句（简单/复杂/模糊/冲突/危险）× base/guided 共 **12 次候选独立推理会话**。模型实际调用会使用用户本地已登录账户，输出私有 JSONL。评测中关键词覆盖是人工语义审阅的提示项，**不是正确率 PASS**；至少检查不完整输入补齐能力、重大错误、用户确认状态、最新源码、禁自动删除/发送、零新权限与 P0 覆盖。Base 只是未显式要求阅读 R2；若模型主动读规范，应记录此污染，不能制造不公平对照。

此会话**未在用户 Mac 运行 12 次模型**，所以目前没有 base/guided 的实际耗时、追加问答、返工次数或效率百分比。只能记录真实开发所需修改/测试文件数，不能以 23/23 静态功能追踪冒充模型语义正确率。

### 文档/Skill/执行归属核对

| 唯一 Owner | 保存内容 | 本 R2.1 实际操作 |
| --- | --- | --- |
| `docs/framework/browser-tool-creation-workflow.zh-CN.md` | 唯一通用阶段、推理、状态投影、恢复、变更、升级合同 | 更新 |
| **本 workstream 文件** | 三案例对照、Quick Notes 映射、真实测试/阻塞/提交断点 | 更新 |
| `.agents/skills/README.md`、各现有 SKILL | 主 Skill 路由、自己职责的进入/退出；不复制十阶段全文 | 复用，不新建 |
| `examples/sidebar-tools/<id>/README` 或唯一正式需求 | 单一工具的用户决定、功能/场景/验收及数据边界 | **本轮对并行工具只读**；演练映射暂存在本 workstream，正式迭代再经其 owner 回写 |
| `prototypes/sidebar/` / `scripts/preview/` | 可交互 HTML 源、共享预览、Mock 与同包来源 | 复用既有工具；不创建重复 Quick Notes 原型 |
| `examples/sidebar-tools/<id>/src/` / `tests/environment/` | 正式代码及真实测试 | 工具业务源码不改；仅在本轮范围内增量测试评测合同 |
| `src/framework/workflow/` / `src/platform/tasks/` | 受限网页自动化/Task 与 RunHost Authority | **不改**；不得把它冒充扩展源码自动生成入口 |


## R2.1 同候选 CI 核验与下一步（2026-10-15）

**在 GitHub 上实际执行的证据，不是预写 PASS**：

- `scripts/agent-skills-r22-eval.mjs` 增量修复八 Skill 预检查并新增 `--mode reasoning`（六个短句×base/guided 共 12 个待运行只读评测）。首次提交 [`f98df764`](https://github.com/shopable-ai/opendesk-browser/commit/f98df764f132ec9830ae16c04fd940cd487243b0) 的 [Agent Skills governance #38723888175](https://github.com/shopable-ai/opendesk-browser/actions/runs/38723888175) **SUCCESS**；原始日志包含 `SELF_TEST_PASS`、Skill 目录 12/12、其他治理测试 5/5。其后仅修正“6 对/12 次”的自测文案，提交 [`bb648101`](https://github.com/shopable-ai/opendesk-browser/commit/bb648101d8783c7277f4646de202bc4545f9c48c)，自身治理 CI [#38725043435](https://github.com/shopable-ai/opendesk-browser/actions/runs/38725043435) **SUCCESS**。以上仅是静态配置/评分保守性测试，**并未真正执行 12 次 Codex 模型推理**。
- 新增 `tests/environment/browser-tool-creation-workflow-r21.test.mjs`，只使用已有 Node `node:test`，校验 10 阶段映射、7 个 Quick Notes F↔S↔A、真实 HTML ID/JS 标识/既有测试对应，以及三个故意缺失/伪造的反例；没有新增 Runner、状态 Registry 或工具业务代码。测试合入既有 `.github/workflows/sidebar-preview-contract.yml`，源提交 [`98dae8d1`](https://github.com/shopable-ai/opendesk-browser/commit/98dae8d1db4a22acb06e54847695574d97b4f2f2) 的 [Sidebar Preview Contract #38724726739](https://github.com/shopable-ai/opendesk-browser/actions/runs/38724726739) **SUCCESS**。
- 该 Actions 完整日志：`check-preview-contract` 返回 **SOURCE_LOCK_AND_DETERMINISM_PASS**；含 R2.1 新测试的 Node **65 PASS / 0 FAIL**；真实工具源码经原 packer 产生 JSON 和 source-bound HTML；Linux Chrome for Testing **155.0.8059.79** 的 Quick Notes 离线 Mock **13 场景通过**，日志状态 **STATIC_OFFLINE_CHROME_PASS_NOT_INSTALLED**；同 CI 的 Bookmark Manager 离线 Mock 2 视口通过，不代表 Bookmark Manager 已安装。原始截图/HTML： [Quick Notes Artifact 11968300211](https://github.com/shopable-ai/opendesk-browser/actions/runs/38724726739/artifacts/11968300211)。这个 CI 的 `head_sha` 明确是 `98dae8d1...`，与以后独立文档提交不能无条件混为一件原生验收。
- 此 GitHub 对话通过远端 Connector 增量改动并正常推进 `main`；没有访问用户 `/Users/shopme/`、Mac Chrome、真实扩展 ID/Profile 或 Native 的能力，也没有更换 `dist/development` 或运行第二个 watcher。

| 链路检查点 | 当前真实状态 | 继续条件 |
| --- | --- | --- |
| 一句话需求→S/F/A 产品推理 | `DESK_REVIEWED`；静态映射 **PASS**，独立模型正确率 `NOT_TESTED` | 本机 `--mode reasoning` 实际运行 + 人工语义/过度推断盲审 |
| 功能树→既有 Quick Notes UI/正式 JS/Node | `SOURCE_VERIFIED / TRACE_NODE_PASS`（本次 65 Node 含源追踪） | 变更 F-ID 或源码时重新验证影响映射 |
| 源码→正式 JSON→同源 HTML→离线 Chrome | `PACKAGE_BUILD_CI_PASS / STATIC_OFFLINE_CHROME_PASS_NOT_INSTALLED`，证据 SHA `98dae8d1...` | 固定同候选真实扩展安装/Chrome 手势/权限存储验证 |
| 已安装 Side Panel 的真实用户保存、删除、重开、升级 | **NOT_TESTED**，没有 Mac 设备/授权/包身份回执 | 依上一节 5 步清单作独立真实 Chrome 验收 |
| 用户一句话→AI 自动路由 Skill→写工具源码→安全安装 | **PRODUCT_ENTRY_NOT_IMPLEMENTED**；当前只可由 AI/人按既有 Skill 分阶段工作 | 先完成一条完整真实样板证据，再决定是否需要原产品入口最小接线 |
| 与无规范流程的实际工时/返工/成本对比 | **NOT_TESTED**（未运行 6 对 Codex，未有独立评价） | 固定同一模型/HEAD/输入，存私有原始事件，评审语义与返工/文件改动量 |

**当前重要阻塞不是再加需求文档，而是最后的两类真实证据**：一是独立 Codex 自然语言推理的实际正确性/返工测量，二是候选工具在用户授权的真实 Chrome 里的实际安装/更新、数据持久化和恢复。R2.1 不把 `Node+Mock` 升格为这两类 PASS。

**下一次最小执行**：先在用户 Mac 的当前 `main` 只读核对并运行 `node scripts/agent-skills-r22-eval.mjs --repo "$PWD" --mode reasoning --max-tests 2`（一对真实模型输出，需已登录/知晓费用，不动源码）；由独立评审识别 P0 遗漏及未经授权新增。随后选 `quick-notes`，在明确的隔离 Chrome 验收 Profile 通过唯一安装器升级并真实验证 A-QN-002/004/005/006。无需重跑已同源且输入未变的模拟视觉测试。

## R2.2 · 2026-10-15 AI Workflow 所有权迁移（不重写历史证据）

- **唯一规范所有者**迁为 `.agents/workflows/extension-creation.md`，包含原 R2/R2.1 的需求推理、F/S/A、Gate A–D、十阶段检查点、增量恢复、数据迁移约束。原 `docs/framework/browser-tool-creation-workflow.zh-CN.md` 仅为兼容导航，不再维护规则副本。
- **现有 Skill 主责不变**；`.agents/skills/README.md` 和 `opendesk-sidebar-tool-dev/SKILL.md` 只改上游链接；公共工具开发指南和 R2.1 测试改为读取新规范。
- **GitHub Agentic Workflows 专用适配**为 `.github/workflows/extension-creation-intake.md`：手动、一句话、AI 只读分析到 Gate A，编译期导入同一 `.agents/workflows/extension-creation.md`；不等于自动改码、Git 提交、安装或真实 Mac 访问。其对应 `.lock.yml` 必须由真实 gh-aw 编译产物写入，不能手工仿制。
- **原有 CI 沿用**：`sidebar-preview-contract.yml` 保持 Node/Mock/Chrome 预览测试，增监听新规范；不新增 SDK、Host、Runner、注册表、发行路径或目录专属 Skill。
- 本轮调整属于源码所有权和工作流编排入口迁移；旧 65/65 Node、13 个离线 Chrome 结果仅是当时同候选历史证据。**迁移后结果以新 CI 为准；模型现场推理/gh-aw 运行以及真实 Chrome 安装仍为 NOT_TESTED。**
- 基线（写入前）`main@700764a1022edb003b3082f06a087fe94cf6320e`；与其他 Agent 并行时，只更新上述明确文件，不强制覆盖最新 main。


## R2.2 .agents/workflows 迁移与 gh-aw 实际编译闭环（2026-10-15）

**实际写入范围和所有权**：唯一可复用 AI 工作流现为 [`.agents/workflows/extension-creation.md`](../../../.agents/workflows/extension-creation.md)。原 `docs/framework/browser-tool-creation-workflow.zh-CN.md` 缩为旧链接兼容导航；历史 R2/R2.1 全部规则保留在新文件，`workstreams/` 继续仅保存证据。根 `AGENTS.md` 新增唯一入口指引；`.agents/skills/README.md`、开发 Skill、`docs/api/sidebar-tool-development.zh-CN.md`、R2.1 追踪测试与既有 Sidebar Preview CI 均更新来源路径。没有新建第二 Skill/Runner/SDK/Host 或业务安装器。

**GitHub Agentic Workflows 正式适配**：
- [`.github/workflows/extension-creation-intake.md`](../../../.github/workflows/extension-creation-intake.md)：`workflow_dispatch` 输入一句话，`imports: /.agents/workflows/extension-creation.md` 编译期复用唯一规范。采用 `engine: copilot`、`contents: read`、`copilot-requests: write`（仅用于模型推理计费授权）、`safe-outputs.upload-artifact`，**不提供仓库写入、PR、静默安装或发布**；默认不计划触发。实际模型执行需拥有组织 Copilot 推理权限，未验证账户授权时标 `MODEL_RUN_NOT_TESTED`。
- [`.github/workflows/extension-creation-intake.lock.yml`](../../../.github/workflows/extension-creation-intake.lock.yml) 是真正 `github/gh-aw@v0.92.0` 在 GitHub Actions 编译生成并恢复的 **131250 字节**原始文件，不是人工编造。首次官方编译 [run #38747263061](https://github.com/shopable-ai/opendesk-browser/actions/runs/38747263061) 的 `gh aw compile extension-creation-intake` **PASS**；同轮首次“检查已提交锁文件”因尚未提交而按预期 FAIL，并在成功生成后正常补交锁文件 `f4a6d71e`。
- 现有 [`.github/workflows/agent-skills-governance.yml`](../../../.github/workflows/agent-skills-governance.yml) 增加官方 CLI 编译和 `git diff` 新鲜度校验，不再打印临时锁文件内容；在提交 `f4a6d71e` 后的 [run #38747741250](https://github.com/shopable-ai/opendesk-browser/actions/runs/38747741250) **SUCCESS**，移除临时导出后的 [run #38747816713](https://github.com/shopable-ai/opendesk-browser/actions/runs/38747816713) **SUCCESS**。这只证明真正编译和稳定性，并非 gh-aw 已调用 Copilot 或已生成/安装工具。
- 首次归属迁移提交 [`f1130454`](https://github.com/shopable-ai/opendesk-browser/commit/f11304545b37ad1c82c5340a307b1be35cab37ba)，CI 接线 [`2e1743a1`](https://github.com/shopable-ai/opendesk-browser/commit/2e1743a1844132230df05b1081a3ef8ef87aa35e)，锁文件 [`f4a6d71e`](https://github.com/shopable-ai/opendesk-browser/commit/f4a6d71e710a75353ce2a32d2d904a6419e4857a)，正式编译检查收敛 [`75ac5d36`](https://github.com/shopable-ai/opendesk-browser/commit/75ac5d36a3e8d31f6f2ac8db55bea8306011e3a6)，根入口 [`9732cd20`](https://github.com/shopable-ai/opendesk-browser/commit/9732cd20ac08e9f0e3bd7dd8b2dbbb2f71c2dabb)。均是 `main` 非强制提交。

**证据分级与并行边界**：迁移后原 `sidebar-preview-contract` 的新运行 [#38746996098](https://github.com/shopable-ai/opendesk-browser/actions/runs/38746996098) 中 Node 追踪及 Quick Notes 离线 Chrome 已 PASS，但最终 Job 因独立 AdBlock 交互预览的 `fail-closed permission-denied` 断言失败，**总体仍 FAIL**；与本流程目录迁移无关，不擅修其他 owner 的 AdBlock。并行 Agent 同时修改 `tests/environment/browser-tool-creation-workflow-r21.test.mjs`，本轮一次可选额外测试写入遭遇 GitHub 409，已停止覆盖并保留对方改动。真实用户一句话触发 Copilot、真实源码开发、Mac Chrome 安装与业务结果读回仍是 `NOT_TESTED/NOT_IMPLEMENTED`，不能冒充 95+ 产品验收。

**下一最小行动**：在仓库 Actions 页主动运行已编译的 **Extension Creation Intake**，输入 Quick Notes 单句需求并核对真实模型推理结果与历史决策；只有用户授权并具备真实 Chrome 环境，才继续复用既有 Sidebar Tool 打包/安装链验证实际数据持久化。不要创建另一个总 Workflow 或重新审计整仓。

