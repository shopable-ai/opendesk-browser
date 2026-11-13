# OpenDesk Browser · 独立 Controller Task 资产、内置脚本与跨扩展消费合同

> 历史基线：**R1.1 设计审计（2026-11-14）**。下述历史设计评分仍仅代表设计，实际研发进展以紧接着的 R2 落地证据段为准。
>
> 审查源码基线：`main@1d32cb04fd5c84c75a969704bda205d5c809b367`。下列评审是**同一模型的六专业视角模拟审阅与反方分析**，不是六名外部专家或六个独立代理的真实评审。设计自评分不代表代码、Chrome、安装或业务验收分数。
>
> 核心决定：**独立共享 Task 有自己的源码与发行身份；「我的」是统一管理入口；WebFlow/Subagent 是经授权的消费者；原 Task Catalog/Installer/Authority/Controller/RunHost/Durable Result 继续是唯一执行体系。** 不创建第二套运行器、安装数据库、权限系统或脚本市场。

## R2 实际实施与验收台账（2026-11-14，优先于历史 R1.1 文案）

当前 `main` 以 `6ca3bfcb245046132e93e4b0449e7a655b7cf4be` 为本次记录基线。仓库只用原 `main`，没有新增第二 Installer、Authority、Controller、RunHost 或 Durable Result，也未操作用户真实 Run/Result。R1.1 的“尚未实施”描述仅针对当时旧 HEAD；不得把它作为当前已完成/未完成的事实。

| 阶段 | R2 已落地源码/提交 | 实际验收边界 |
| --- | --- | --- |
| M0 影响分析 | 初始 main `6295c21c`；核对冻结包、测试、构建 pin、Subagent 引用与 WebFlow 原结果适配器 | SOURCE 实际读取；未读取本机并行未提交代码，本地 CodexPro 不可用 |
| M1 完整资产迁移 | `69a2228b`；ChatGPT 5 源+5 发行包、百度/Google 源与发行包，搜索测试迁移；运行时 `tasks/builtin/<taskId>/<version>.json` 不变 | Git 原 blob SHA 逐一相同，七组 `sourceUtf8` 与迁移源码一致；新增 `independent-task-pack-identity.test.mjs` |
| M3 初次默认策略 | `356227e2`；两搜索默认、ChatGPT 0.2.2 在目录可选，原 0.2.0 历史包保留；保护停用/卸载及防旧版误报更新 | Node 回归有 PASS；没有真实用户升级、浏览器多 Profile 的安装证据 |
| M2 结果契约解耦 | `8496e546`；Task 下新增固定 `contracts/result-v2.js`、`contracts/installed-result.js`；Subagent 不再从 WebFlow 私有 adapter 获取 0.2.x 结果校验；原 A 送达仍归 WebFlow | 仅两个精确 Git blob 固定编译准入；动态 Task source 不可进入特权 SW/UI |
| 迁移兼容和 CI | `899929e4` → `169d05d4` → `70a80a93` → `6ca3bfcb`；旧测试路径、旧默认假设、CI 独立运行及百度 1.1.5 测试夹具对齐 | R11、两个搜索及独立不可变检查分步 PASS；其它旧 ChatGPT 0.3/MD 测试仍有失败 |

**实际独立步骤证据：**
`https://github.com/shopable-ai/opendesk-browser/actions/runs/43502961780` 中 R11、原串行回归、Google、独立来源/结果契约、生产构建/发行校验各自 PASS；百度遗留旧夹具当次仍 FAIL。后继
`https://github.com/shopable-ai/opendesk-browser/actions/runs/43503313584` 在修正测试夹具后百度、Google、R11、独立契约步骤 PASS。Job/step 状态应按对应 commit 核查，不能宣称整个 CI 已全绿。

**没有完成或不得过度承诺：**

- `CHROME_NATIVE`、真实用户已有 Profile 升级、真实搜索网站与 A→B→A 端到端业务验收：**NOT_TESTED**；Node mock 和 Linux 构建不能替代。
- `CHROMIUM`：仅在实际对应带浏览器门禁日志时才可标记通过；此记录没有这类证据。
- 旧 ChatGPT 0.3 PREPARE/SUBMIT 和 Markdown 工作流有其它回归失败。必须与本次重构的回归区分，查最早失败 HEAD，不得借目录迁移重发原 B。
- 默认首次判断目前基于已有 Task namespace 的持久安装/候选/移除记录；**旧 Profile 从未有任何 Task 记录时，不能凭该空 namespace 分辨新用户和历史升级用户**。发布前必须通过原扩展首次安装证据/保守显式初始化完善并在真实升级环境验证，避免隐式批量安装。不可另造安装数据库。
- WebFlow「从我的」的通用**动态**选择/委托仍未实现；已有 `tasks.configure` 是针对声明的依赖与固定安装身份的可信 UI-only 入口，不可冒充任意 Task 授权接口。
- 搜索 `limit` 当前仍固定为 `[3]`；`showExecutionTab` 仅控制执行标签页。泛化 1～10 条必须另建受审版本及兼容测试，**不得原地改旧包**。
- 六视角 R1.1 设计模拟均分 95.83，不是 R2 实施质量评分；实际 CI 未全过、真实 Chrome 未测，因此不得宣称实现 95+ 或上线验收通过。

**原始 Task ID 与源码家族名分开：**

```text
task-packs/
  baidu.search/src, releases, tests              # baidu.search.top3@1.1.5
  google.search/src, releases, tests             # google.search.top3@1.0.3
  chatgpt.conversation.create/src, releases, contracts
                                                # 0.1.0/0.2.0/0.2.1/0.2.2/0.3.0
```

**下轮只有三个优先闭环：** 先核对最新 main CI 中 0.3/MD 的历史与新回归区别；再证明新旧 Profile 首次预置、防复装和可选 ChatGPT 目录操作；最后在真实 Chrome 测试「我的」/WebFlow/Subagent Side Panel 与 PC，共用同一安装/授权/Run，不新建第二 B，不重放 UNKNOWN。M4 可变条数另开新版本，不应阻塞上述安全验收。

---

## 1. 原始目标与范围

用户要解决三个问题：ChatGPT 自动化脚本不应被误认为 WebFlow 内核；百度/Google 可以作为开箱可见、可停用和卸载的入门脚本；「我的」与 WebFlow 不应重复安装、复制运行器或产生相互矛盾的状态。

本轮设计对象仅为 `shopable-ai/opendesk-browser` 中已确认的共享 Controller Tasks：`chatgpt.conversation.create`、`baidu.search.top3`、`google.search.top3`，以及它们实际依赖的安装、委托、展示与结果边界。不重新开发 A→B→A，不涉及 GitHub Issue，不扩展其他产品，也不把所有项目私有的附属 Task 一律搬走。目录位置本身不能证明运行时已经耦合或解耦；本例迁移依据是独立安装身份、多个消费者及现有跨产品依赖，而不只是路径外观。

`projects/webflow/` 继续拥有工作流产品和其业务配方；`projects/subagent/` 继续拥有 Mini Chat。网页增强 Page USER_SCRIPT、沙箱 Sidebar Tool、Controller Task 是不同类型，不能因为 UI 都写“脚本”而合并其权限和执行世界。

## 2. 已核实事实及新增缺口

以下是上述源码基线的静态事实，不是当前用户电脑的安装或运行证明。

| 证据入口 | 核查结论 |
| --- | --- |
| `projects/webflow/src/tasks/`、`projects/webflow/tasks/` | ChatGPT 固定任务的多个源码版本和冻结安装包仍归 WebFlow 路径；仅移动 0.2.2 不能宣布整个 Task 家族完成拆分。 |
| `src/platform/tasks/builtin-releases.js` | 默认预置集合包含百度 1.1.5、Google 1.0.3、ChatGPT 0.2.0；ChatGPT 0.2.1/0.2.2/0.3.0 属额外随包受审资源。资源存在不证明它已列入可选安装 UI、已安装或被某个应用授权。 |
| `src/platform/tasks/service.js#ensureBuiltinTasks` | 已有首次预置、已有安装保护、移除记录保护和事务回滚；不能再造一个 WebFlow 私有预置服务。当前判断依据主要是每个 taskId 的记录，不足以直接声称已有全局“仅新 Profile 一次”的产品策略。 |
| `service.js#installInTransaction`、`contract.js#installedKey` | 当前安装记录以 namespace + taskId 定位，一个 taskId 只有一个当前安装版本；多份发行包或历史源码不等于多版本同时可调用。 |
| `ensureBuiltinTasks` 的已安装分支 | 仅凭 `installed.version !== version` 就投影 `updateAvailable: version`。结合默认 0.2.0，已装 0.2.2 时存在把旧版本作为更新候选提示的静态路径；本轮未执行 UI 或修复此代码。 |
| `service.js#setInstalledTaskEnabled/uninstallTask` | 已有安装代际检查、撤权围栏及 `task-removed-v1`；卸载保留不可变源码供历史 Run/Result 引用。 |
| `src/platform/tasks/delegation-installation.js` | 委托来自原应用安装投影，检查应用包身份、启停、撤销代际和精确 Task pin，并非 WebFlow 自建授权表。 |
| `projects/webflow/tool.config.json`、`src/ui/main.js` | Sidebar 当前仅声明/投影百度和 Google 两个固定 Task；不能把 ChatGPT Bridge 或 Subagent 的权限当作 WebFlow Sidebar 权限。 |
| `projects/subagent/src/transport.js`、`trusted/result.js` | Subagent 已走原 Page→Task 请求；其结果读取仍经固定 Bridge 再依赖 WebFlow 的结果适配器，需按职责拆分，不能只改源码目录。 |

WebFlow R11 的旧 A 送达仍有 UNKNOWN 对账边界，以其 README 和执行计划为准。任何迁移都不得借旧任务补发、另建 B 或把旧 UNKNOWN 改成成功。

## 3. 所有权与目录决定

本范围采用 `task-packs/<taskId>/`，含义是独立 Controller Task 的源码/发行资产，不是一个新扩展、新包格式或新的运行时注册中心。其他项目的目录约定保持不变，实施时仅为这三个共享 Task 在原目录规范中登记例外和真实 owner。

```text
task-packs/
  chatgpt.conversation.create/
    src/          # 迁移现有源文件；第一阶段保持原文件字节
    releases/     # 受审不可变 .opendesk-task.json
    contracts/    # 确有消费者时放纯输入/输出业务校验
    tests/        # Task 自身行为及版本边界
    README.md
  baidu.search/
    src/          # Task 家族源码
    releases/     # baidu.search.top3 的冻结包
    tests/
  google.search/
    src/          # Task 家族源码
    releases/     # google.search.top3 的冻结包
    tests/
projects/webflow/   # 工作流调用、步骤、原 A 交付等产品逻辑
projects/subagent/  # Mini Chat 与其结果投影
src/platform/tasks/ # 原通用安装、授权、委托及执行服务
src/ui/             # 原「我的」、Task Catalog 与共享 TaskRunSheet
```

不把这些业务脚本搬入根 `scripts/`：该目录的构建/维护脚本不是用户可安装 Task。也不放入通用 `src/platform/tasks/`，以免把网站操作重新变成框架逻辑。不要求每个简单 Task 新建 package.json、npm 依赖、构建器或空 tests/contracts 目录。版本化历史源文件先完整保全；后续维护以唯一活动源和不可变发行快照为原则，不继续按每轮会话制造平行实现。

必须分开四个对象：

| 对象 | 真相来源 | 不允许混同 |
| --- | --- | --- |
| 源码工程 | Task 自己的 owner | 源码存在不是安装成功 |
| 发行资源 | 原包格式、版本、manifest/content hash | 随包提供不是运行授权 |
| 当前安装 | 原 Task Catalog/Authority 的安装 ID 与代际 | 多个历史包不是多个活动版本 |
| 应用委托 | 原应用安装/委托合同及其撤权代际 | 列表收藏或关联偏好不是授权 |

结果职责进一步分开：Framework 验证原 Run/Result 来源和访问权；Task 纯契约验证网站业务结果；WebFlow 校验原 A 的交付/消息回执；Subagent 只按自己的合同投影 Mini Chat。不可把 `chatgpt-result-adapter.js` 整文件移动而连带转移 WebFlow 交付逻辑。

`contracts/` 不是动态特权入口。只有精确审阅、固定编译的验证器可被可信 Host 使用；用户安装包中的任意 JS 不能借此进入 SW。仅仅增加网站 Task，不应该在通用引擎里新增网站 DOM 分支；未知结果契约不能靠可信 success 标签放行。

## 4. 默认内置：产品选择，而不是权限捷径

**修正 R1 理由：安装不等于执行。ChatGPT 能发送消息，并不意味着它在架构上禁止预置；百度和 Google 搜索也会把关键词发送到外部网站，并非无副作用的本地只读自测。** ChatGPT 暂选可选安装，是为降低首用复杂度、避免把尚未完成端到端验收的功能当作默认承诺，不是用“不预装”替代运行授权。

| Task | 目标发行策略 | 默认执行策略 |
| --- | --- | --- |
| 百度搜索 Top3 | 保留随包发行与首次预置，默认显示在「我的」；用户可停用/卸载 | 不自动发起搜索；缺网站权限时通过原可信手势申请 |
| Google 搜索 Top3 | 同上；两者并列，不根据猜测地域强制二选一 | 不自动发起搜索；不因百度阻断而擅自跨站回退 |
| ChatGPT 创建对话 | 随包可选；新用户显式选择受审兼容版本后安装，旧安装不动 | 不自动建 B、填入或发送；真实发送仍受已有明确批准范围约束 |
| 本地自测 | 优先发现既有受控页面和测试 Task；无合适资产才最小补充，非本轮前置 | 仅用户主动运行，不能用真实搜索站点可达性作为唯一引擎健康检查 |

默认预置的目标语义为：新安装/确认的首次初始化可预置批准的入门集合；既有 Profile 后续升级新增 taskId 不应仅因“当前无该任务记录”而暗中安装。复用原初始化与安装存储实现，不建另一套状态库；旧数据不能证明首次初始化时采用保守不自动安装策略。用户停用/卸载优先于默认策略，支持显式恢复。该规则仍须实现和测试，不把当前每 Task 初始化逻辑直接标为已满足。

“已预置”“已启用”仅指具备被申请运行的安装状态。真正执行还必须满足：精确安装有效、来源应用/文档可信、该来源委托有效、参数及目标合法、Chrome 站点权限满足、已有手动 Run 或受限自动计划批准、原副作用/幂等围栏允许。

已有合法安装与权限正常复用，不增加一轮通用“启用”或每次到站重复申请。只有权限缺失、范围变化、身份失效或原合同要求的真实发送审批才进入对应审阅。Chrome optional permissions 的官方规则要求通过用户手势申请，不能由目录初始化代替。

从默认集合移出 ChatGPT 0.2.0、让可选资源可发现、调整初始化范围都是**后续独立行为变更**；目录迁移阶段禁止顺手修改。随包存在不等于会自动出现在现有 Task Catalog 中，需要沿原目录服务明确接线。

## 5. 「我的」与 WebFlow 的交互、卸载与版本规则

### 5.1 一份安装，多个受限消费入口

「我的」作为统一管理视图，显示已安装、可安装与导入/开发入口，提供来源、版本、启停、卸载、升级、参数和运行记录。它不是另一份脚本源码仓库，也不是替代 Authority 的 UI 数据库。

WebFlow「脚本」显示自己的受审任务引用和实时可用性；收藏、排序、参数预设可以是应用偏好，但 Task 安装、授权及原执行记录只能来自可信系统。运行按钮复用已有可信 TaskRunSheet，保留「我的」手动运行与 WebFlow 已有审阅流程的区别，不再重做抽屉。

当前 WebFlow 仅消费其已声明的固定任务。未来「从我的选择」必须使用真实存在或经缺口论证后实现的通用可信选择/委托入口。沙箱不得自行扫描私有数据库、把所有已安装任务当作授权任务，或仅在配置里加 taskId 就获得执行权。通用动态关联尚未确认实现，不能把此设计画面当成现成功能；沿原 Authority/委托体系扩展，不新建 grants 数据库。

Subagent 的单 Task 调用保留原 Page→Task 链，不因为资源共享而强制经过 WebFlow UI；实际需要工作流编排时才依赖对应工作流合同。

### 5.2 操作必须讲清影响范围

| 用户操作 | 应有行为 |
| --- | --- |
| 取消收藏/隐藏快捷入口 | 只改变展示，不冒充撤销调用权 |
| 解除 WebFlow 调用授权 | 原可信委托失效，阻止该来源的新调用；其他合法消费者和全局 Task 安装保留。若当前合同不能单独撤销，说明真实可用入口，不能用隐藏卡片假装撤权 |
| 停用 Task | 当前安装保留，所有消费者的新执行被阻止；在途任务沿原围栏与停止流程处理 |
| 卸载 Task | 删除当前安装、保留 removal tombstone；依赖它的工作流显示“依赖未安装”，不可自动重装或换脚本 |
| 卸载 WebFlow | 撤销其调用/触发能力；不级联卸载独立共享 Task，也不替其他应用撤权 |
| 显式重新安装 | 沿原安装审阅产生有效身份；旧安装 ID/代际的准备与委托不能直接复活 |
| 删除用户开发草稿 | 与卸载分开确认，不误删已冻结发行资源、已有 Run/Result 或必要恢复材料 |

停用、撤权、停止和卸载都不能撤回已经产生的网站副作用。停止 ACK 也不是全部副作用清理完成的证明。保留原在途 Run、结果与 UNKNOWN 的安全恢复；保留历史不等于继续授予旧应用结果读取权。

内置资源可从已安装列表卸载并在可安装目录恢复，但不能在 UI 中承诺从已发行的只读扩展包中擦除字节。移除记录保证范围是当前仍保留数据的 Profile；清空全部数据或新 Profile 不具备凭空恢复用户卸载偏好的能力。运行历史/个人数据清理由单独明确操作处理，不与卸载自动绑定，也不承诺永久不可删除。

### 5.3 版本冲突与更新

当前合同为每个 Profile/namespace 的每个 taskId 一个当前安装版本。两个应用分别固定不同版本时，应展示依赖冲突，保留原安装，直到用户选择已审阅的兼容版本/消费者配置。**不静默升级、降级、切换版本、复制第二份同 ID 安装或选择 latest。** 多版本并存不是本轮承诺。

更新提示必须区分“可升级版本”“明确恢复的旧版”“另一不兼容合同版本”。`版本不相等` 不是升级判断，单纯挑最高 semver 也不等于兼容；例如 ChatGPT 0.3.0 的两阶段流程不能因版本号较大替换 0.2.x。升级后按原精确 pin/安装代际复核依赖；旧版本仍合法可运行时，不应因在线目录失效或新版本出现强制停用。

同一 taskId/version 不同字节是冲突，应拒绝，不允许同名覆盖。官方/内置标识来自原受审发行资源核验，不由导入包的 author/source 文本自报。用户修改官方脚本应成为明确的新草稿/新发布身份，不能覆盖受审版本。

## 6. 差量实施：迁移内容与行为变更分开

### M0：冻结本次影响面

在当前 main 读回目标文件、并行改动和原 owner；记录源文件/包哈希、原构建输入、运行时资源路径、引用与相关测试。既有历史报告不批量改写。真实业务 UNKNOWN 单独保全，不阻塞无关只读审查和离线迁移工作。

### M1：修复完整 Task 家族的源码归属

可先用 ChatGPT 0.2.2 做不改变字节的路径探针，但它只叫“试点通过”。该 Task 家族所有当前仍被构建/验证/恢复引用的源码、冻结包和专属测试都完成唯一 owner 迁移，才算 ChatGPT 归属整改完成。混合测试按职责处理，公共安装/权限测试仍留框架；不按 chatgpt 前缀整批搬走。

第一阶段保持 Task 源码、package 原始字节、taskId、版本、manifestHash、contentHash/sourceHash、内嵌 sourceUtf8、权限和 Schema 完全不变，不迁移或重写用户数据库。原 `tasks/builtin/<taskId>/<version>.json` 运行时输出路径可保持不变，只更新源码 sourcePath 和真实引用。通过后再按同样门禁迁移百度/Google 资源，不先批量铺开。

### M2：按职责拆结果契约

共享的 Task 结果验证留单一受审实现；WebFlow 原 A 交付、工作流 key 和消息证明仍在 WebFlow；Subagent 投影仍在 Subagent。必要兼容入口只转发，不再持有第二份业务实现，记录真实消费者和退出条件。

**哈希规则必须精确：** M1 的不可变 Task 字节和哈希不变；M2 如果确有受信模块拆分/import 更新，其源码与 SW/UI 构建产物哈希可以合法变化，必须审阅新依赖闭包、更新精确来源映射并定向验证，不能伪造旧 hash，也不能通过放宽整目录 allowlist 让测试通过。不可变 Task 哈希与可信宿主构建哈希不是同一对象。

### M3：独立改默认策略与管理文案

单独处理新用户默认集合、可选 ChatGPT 发现、已装高版本被误报旧版更新、首次初始化范围、卸载/恢复文案与状态同步。保持已有用户版本和停用/移除决定。此阶段不能与 M1 混提交而使目录调整带来隐式升级。

### M4：动态关联仅在确认通用缺口后实施

核对原公开 SDK 和可信选择入口；有真实缺口才由平台 owner 设计最小通用能力，保存到原授权体系。不得伪造接口，不把它变成当前目录迁移前置。原 WebFlow 两个固定委托仍可作为兼容起点。

不新建打包器/Runner/Installer/数据库/市场，不建立压缩包交接依赖，不创建分支或 PR，不改变旧 Task 语义来追求评分。

## 7. 反方攻击与验收门槛

下表是**必须验证的预期行为**，不是已执行测试的 PASS 表。

| 编号 | 反方构造 | 必须得到的结果 |
| --- | --- | --- |
| A01 | 新环境打开「我的」，尚无网站许可 | 允许受控预置/展示；不得搜索、打开业务执行页、发送消息或主动申请无手势权限 |
| A02 | 用户停用/卸载百度，再刷新、重启、升级扩展 | 停用保持停用，卸载不复活；已有 Profile 新增默认项不得暗中安装 |
| A03 | 已装 ChatGPT 0.2.2，默认集合仍为 0.2.0 | 不把 0.2.0 当可升级版本，不覆盖当前安装；旧版恢复必须明确标识 |
| A04 | 两个应用分别要求同 taskId 的不同版本 | 明确依赖冲突，不通过第二安装、latest 或静默切换规避 |
| A05 | 运行抽屉打开后，Task 被卸载/重装、停用或升级 | 确认前重新核对安装 ID/代际/版本；旧准备不可执行 |
| A06 | 只隐藏 WebFlow 卡片，或应用已被卸载/撤权 | 隐藏不谎称撤权；真实撤权后原调用/结果访问依原合同拒绝，不能只靠 UI 按钮禁用 |
| A07 | 一个应用停止/卸载 Task，另一应用也用相同网站权限 | 不误删另一任务的安装或粗暴撤销扩展共享站点权限；Task 全局停用影响范围需如实显示 |
| A08 | 移动源码后原 Run/发送处于 UNKNOWN | 只查原 Run/Result/回执，不另建 B、不补发、不重置幂等围栏 |
| A09 | 导入者自称 OpenDesk 官方，或同 ID/version 改字节 | 官方标识不由自报文本产生；哈希/身份冲突拒绝，不能覆盖 |
| A10 | 打包器仍读旧路径，或新 contracts 放入任意特权代码 | 来源/字节/依赖闭包检查失败；不得放宽 allowlist、使用 symlink 或保留双 owner 掩盖 |
| A11 | 搜索站点验证码、离线、区域不可达、DOM 变化 | 区分网站阻断与引擎运行结果；不伪造三条数据，不擅自切换搜索网站 |
| A12 | 「我的」与 WebFlow 对同一逻辑请求重复提交/回执丢失 | 原请求身份只产生原 Run 或 UNKNOWN；不同明确新请求仍按原槽与授权处理，不能按 taskId 把所有请求误合并 |
| A13 | 旧安装不在最新发行目录或目录读取失败 | 不仅因“非最新版/目录失效”否定有效旧安装；仍验证真实安装身份、能力和撤权 |
| A14 | 把带 JS 的 JSON 包或目录改名当成安全/商店合规依据 | 拒绝此推理；保留当前隔离执行世界和可信边界，外部分发/商店发布另做真实合规验收 |

每项落地验收记录输入 commit/文件 hash、操作、原始结果或测试日志、实际状态、失败原因和责任阶段。NODE/PACKAGE/CHROMIUM/CHROME_NATIVE/INSTALL/BUSINESS 分开；Mock、组件测试、审阅分数不能替代真实业务回执。

**一票否决：** 越权执行、卸载后自动恢复执行、静默换版本、重复不可逆副作用、丢失原 Run/Result 恢复能力、动态包提权到 Host、伪造验收证据，任一未解决都不允许标记对应实现通过，不能靠其他高分平均抵消。

## 8. 六视角讨论结论与评分

评分对象仅为本文件的设计完整性与可实施性。每个视角独立按 100 分计算，统一五项准则：需求准确 20、职责边界 20、生命周期/异常 20、验证可操作性 20、增量实施清晰度 20。分项独立计分不等于审阅者独立；本轮六个视角由同一模型完成，未调用外部专家或独立评审代理。

| 专业视角 | R1 本轮回评 | R1.1 五项得分 | R1.1 总分 | 主要裁决与保留扣分 |
| --- | ---: | --- | ---: | --- |
| 架构与源码所有权 | 90 | 20/20/19/19/18 | 96 | 保留独立 owner；否决只搬一个版本就宣布解耦。迁移依赖闭包仍须在实际 diff 复核，扣 4。 |
| 安装、版本与生命周期 | 87 | 20/19/20/19/18 | 96 | 明确单活动版本、旧版非更新、卸载优先及首次初始化范围。旧数据兼容分支需实证，扣 4。 |
| 权限与可信边界 | 91 | 20/20/20/19/18 | 97 | 安装不执行，委托不等于全局权限；旧授权代际不能复活。动态选择接口签名未定义且不在本轮实现范围，扣 3。 |
| 产品交互与可理解性 | 88 | 20/19/19/19/18 | 95 | 区分隐藏、解除授权、停用、卸载；缺授权才审阅，复用有效许可。尚无真实交互走查，设计可用性保留 5 分。 |
| 工程迁移与兼容交付 | 86 | 20/20/19/19/18 | 96 | 字节保持与宿主合法 hash 变化分开，先迁移后变行为。实际构建/回滚兼容待证，扣 4。 |
| 测试设计与反方审计 | 88 | 20/19/19/20/17 | 95 | 14 个攻击场景与否决门槛；不以外站搜索替代稳定健康测试。故障注入和真实浏览器证据尚未获得，设计覆盖保留 5 分。 |

R1 回评平均为 `(90+87+91+88+86+88)/6 = 88.33/100`；R1.1 设计模拟平均为 `(96+96+97+95+96+95)/6 = 95.83/100`，六项均至少 95。分数为主观设计评审，不是正确概率、独立背书或产品验收分。

本轮已通过讨论补齐反方发现的设计缺项；其运行效果仍须按第 7 节验证。**真正独立评审：NOT_PERFORMED；源码迁移、实现测试、Chrome、安装、业务验收：本轮均 NOT_TESTED/NOT_IMPLEMENTED。** 不得将本节改写为“六名专家已一致确认上线”或“代码已达到 95”。

## 9. 接续与证据入口

下一实施者先读本文件和原 `AGENTS.md`、`docs/architecture/extension-project-layout.zh-CN.md`，确认当次 main/并行修改。沿 M0→M1 完成最小非破坏性迁移，再评估 M2；不得重写已有 Task、绕过原安装服务或先做动态市场。用同一文件维护设计，不每轮另建重复方案或复制接续清单。

必须核对的原入口：`src/platform/tasks/{builtin-releases,service,contract,delegation-contract,delegation-installation}.js`、`scripts/packaged-task-resources.mjs`、`src/ui/task-workbench.js`、`projects/webflow/tool.config.json`、`projects/webflow/src/ui/main.js`、`projects/subagent/`、固定 Bridge 及原结果适配器/来源 pin 测试。历史 evidence 与原 UNKNOWN 请求保持原样。

外部边界核查（官方文档，2026-11-14 查阅）：
- Chrome Declare permissions / permissions API：optional permissions 与站点权限仍经真实用户手势和当前授权检查，不由默认目录赋权。
- Chrome Deal with remote hosted code violations / userScripts API：JSON 扩展名不使其中执行的 JavaScript 自动变成纯数据；用户脚本执行世界不是任意特权代码加载的替代。本轮不改变分发模式，不据此宣布商店合规。

本轮交付只有设计审计与文档修订；现有 README 链接仍指向本文件。没有新运行、安装变更、发布包或本地 Codex 验收回执。
