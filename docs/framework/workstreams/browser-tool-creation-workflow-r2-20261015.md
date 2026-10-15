# Extension Creation Workflow R2 · 一句话需求推理三案例验证

> 日期：2026-10-15；Owner：当前 Extension Creation Workflow R2 文档任务；状态：**THREE_CASE_REASONING_DESK_REVIEW / STRUCTURAL_CHECK_PENDING / REPEATED_MODEL_EVAL_NOT_TESTED / NATIVE_NOT_TESTED**。
>
> 写入边界：本文件与 `docs/framework/browser-tool-creation-workflow.zh-CN.md`；仅 GitHub `main`，基线 `f77e2ca143c96e9849107b0ceee6f55382867d9a`（写前只读，最终以每个文件的提交 SHA 为准）。不占用 Mac、Chrome/CFT、Native、`dist/development`、watcher、端口或共享本地 Git 索引；不写其他工具源码、已有交接和 Skill，不接管并行开发者。
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

## 写入、验证与下一次最小接续

- 写入所有权：只管理本文件与通用主工作流文档；Quick Notes README 版本漂移仅登记，不自行覆盖该工具 owner；Prompt Shortcuts 两份 HTML、Bookmark Manager 核心源码均只读。
- 可重复静态检查：校验各案例每个表格 F-ID 唯一且有对应 S-ID/A-ID、P0 含异常/撤权/保存/删除必需场景，反例确实引用功能编号；核对两篇仓库文档互相链接、工具目录与当前 SHA。它只证明静态追踪完整性，不证明模型泛化或产品。
- 待实证：独立多轮真实 AI 对话触发 Skill `REPEATED_MODEL_EVAL_NOT_TESTED`；HTML 交互 `NOT_TESTED`；三个候选同版本安装/权限/数据的 Mac Chrome `NOT_TESTED`；逐维 95+ `NOT_SCORED`。
- **最小下一步**：只选 Case A，按同一短句完成一次真实 Skill 读取→需求清单→可交互 HTML 的闭环，记录实际缺漏与纠正回合数；完成后再用 B/C 对照复杂权限和历史一致性，不提前添加新的编排器。
