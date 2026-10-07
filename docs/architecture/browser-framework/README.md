# OpenDesk Browser — Legacy → Current → Target 工程基线

> 基线日期：2026-10-07  
> Legacy 事实源：`shopable-ai/todo-user@0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5` 的 `src-bex`  
> Current 产品源码：`opendesk-browser@01b48dcb49b31844d30c0e6fdeed1756e5046f11`  
> 当前候选分支：`codex/p1-2-sdk-target-origins-20261004`；本轮观察 HEAD `3b7d6a361c05a8f40e26afae1776ed9e3b7b18e6`  
> 注意：候选 HEAD 相对 P1 交付 HEAD `5b265238…` 的后续提交只改文档、测试/证据和根 README，没有改 `src/` 产品代码。

本目录是 OpenDesk Browser 后续重构的长期基准。所有开发 Goal 应先回答：

```text
LEGACY
旧项目真实实现
  ↓
真实消费者 / 调用链 / 行为契约
  ↓
CURRENT
当前产品真实实现
  ↓
迁移状态 / 验证等级 / 差异
  ↓
TARGET
最小必要兼容目标
```

不得用“文件存在 / API 存在 / 测试文件存在”替代消费者级完成证明。

## 1. 结论先行

### A. Legacy 到底是什么？

**Legacy `src-bex` 是一个“后台单例 ChromePage 自动化外观 + 页面 MAIN-world SDK/service bridge”的浏览器扩展运行时。**

它确实是浏览器自动化框架的一部分，但不是 Puppeteer 本体，也不是完整的 `Browser → BrowserContext → Page` 对象系统。本轮固定源码中：

- 有 `ChromePage`、`ChromeElement`、`Keyboard` 和大量 Puppeteer 风格方法；
- 没有发现 Legacy `ChromeContext`、`BrowserContext`、`PageProxy` 或 Puppeteer/CDP 执行内核；
- background 持有共享的 `page` 单例；
- ChromePage 执行时常重新查询 active tab，再用旧 Chrome tabs/script API、页面脚本、cookies、captureVisibleTab 等完成动作；
- 另一条 Page SDK 主线把 `axiosx / AppStorage / AppLocal / log / getTime / bexUrl / requestResource` 等 API 注入网页，通过 `CustomEvent → content relay → runtime message → background service` 得到扩展特权。

```text
Legacy src-bex
│
├─ Browser automation
│   consumer / background script
│       ↓
│   global page : ChromePage
│       ↓
│   active-tab lookup
│       ↓
│   tabs.executeScript / tab update / cookies / captureVisibleTab / DOM
│       ↓
│   page effect + pendingEvents callback
│
└─ Page SDK / service bridge
    webpage MAIN globals
        ↓
    axiosx / AppStorage / AppLocal / utility
        ↓
    DOM CustomEvent
        ↓
    content relay
        ↓
    runtime/BEX message
        ↓
    background service
        ↓
    axios / storage / resource / notification / utility
        ↓
    callback injected/relayed back to webpage Promise
```

完整事实见 [legacy-src-bex-framework.md](legacy-src-bex-framework.md)。

### B. Current 到底是什么？

**Current 是一个“精确 tab/frame/document 绑定的浏览器自动化运行时 + 正式 Page SDK + 单一 authority/broker + platform drivers + durable state/artifact/download”的 MV3 框架。**

```text
Public API / Tool / Controller script / Page SDK
                  ↓
          ChromePage / OpenDeskSDK
                  ↓
             codec / transport
                  ↓
          single broker + authority
      source / capability / target / grant
       request identity / cancellation fence
                  ↓
        runtime / RunHost / controller / SDK
                  ↓
             platform drivers
 scripting / userScripts / tabs / webNavigation
 cookies / network / downloads / storage.session
                  ↓
 durable IndexedDB state + native receipts
                  ↓
 exact tab/frame/document or authorized HTTP origin
```

Current 不是把 Legacy 文件原样搬家：它保留 API/消费者意图，同时替换 active-tab、任意 background eval、临时 pending 状态和隐式权限模型。

完整实现与 Target 理由见 [current-and-target-framework.md](current-and-target-framework.md)。

### C. 两者的关系

| 类型 | 代表能力 | 当前判断 |
|---|---|---|
| API 外观保留、执行重写 | `ChromePage.goto/click/type/wait/evaluate`、`axiosx`、`AppStorage/AppLocal` | MIGRATED 或 PARTIALLY MIGRATED |
| 旧机制由新机制替代 | active-tab 目标、background raw eval、pendingEvents 作为唯一事实、宽泛服务权限 | REPLACED |
| Current 新增可靠性/安全模型 | RunContext、PageProxy、single authority、request identity、durable cancel、effect_unknown、artifact/download lifecycle | CURRENT ONLY |
| 旧消费者仍需兼容验收 | 旧动态 controller 脚本、全部旧业务脚本、部分 evaluate/$/$$/world 语义 | PARTIALLY MIGRATED / UNKNOWN |

**不能把 Current 的 authority / broker / runtime / driver 倒写成 Legacy 原有架构。**

## 2. 当前 P1 在整个框架中的位置

P1.2 / P1.3 / P1.4 只覆盖完整框架的一条纵向切片：

```text
Page SDK
  ↓
P1.2  source + capability + exact targetOrigins + grant lifecycle
  ↓
P1.3  trusted approval UI + native permissions + exact document
  ↓
P1.4  real SDK/axiosx consumer → broker → network driver → result
```

它不等于：

```text
Browser automation 全部完成
+ 所有 Legacy consumer 已兼容
+ artifact/download 全部候选验收
+ 所有 lifecycle/native Chrome 场景均通过
```

P1 候选交付证据明确区分：

- 239 项 SDK/component 测试 PASS；
- 237 项 compiled/control/environment 测试 PASS；
- production/development build 与 CI PASS；
- 当前 P1 包的 native user-chain acceptance：**NOT_TESTED**。

历史真实 Chrome 证据仍有价值，但不能继承为当前候选 L6：
- 历史 SDK native package `99d6d078…`：17/17 PASS；
- 历史 ChromePage/API48 package `99d6d078…`：真实 Chrome 后续 run PASS；
- 当前 P1 production package `61ac11ca…`：不是同一个包哈希。

详见 [legacy-to-target-map.md](legacy-to-target-map.md)。

## 3. “完成”的统一证据等级

```text
L0 源码存在
 ↓
L1 API 存在
 ↓
L2 真实消费者入口已接通
 ↓
L3 组件测试
 ↓
L4 集成 / compiled-product 测试
 ↓
L5 历史真实浏览器用户链
 ↓
L6 当前候选源码/包的真实浏览器用户链
```

规则：

- L3/L4 不得写成 Chrome PASS；
- L5 不得自动继承到新 package；
- typed rejection 可以证明安全边界，但不能冒充某项 Legacy 正向能力已迁移；
- wrapper 存在但没有真实执行点，只能算 L0/L1；
- 内部测试直接调用 authority，但正式 SDK 不经过它，不能算 L2。

## 4. 迁移状态词

本目录统一使用：

- **LEGACY ONLY**
- **LEGACY + CURRENT**
- **CURRENT ONLY**
- **MIGRATED**
- **PARTIALLY MIGRATED**
- **REPLACED**
- **NOT YET MIGRATED**
- **UNKNOWN**

“IMPLEMENTED”若出现在旧历史文档中，不等同于本目录的“消费者级迁移完成”。

## 5. 当前整体完成度：按能力看，不给虚假总百分比

| 能力域 | 当前结论 | 最高可信证据 |
|---|---|---|
| Browser automation | 主体 MIGRATED，若干语义有意改变；当前候选需重验 | 历史 native + 当前源码/组件 |
| Page SDK | MIGRATED；raw background execute 被 REPLACED | 历史 native + 当前 P1 L4 |
| HTTP / axiosx | P1 主体 MIGRATED，权限/credential/redirect 语义改变 | 当前 P1 L4；历史 native |
| Runtime / transport | MIGRATED | 当前 L4；部分历史 native |
| Authority | CURRENT ONLY，P1 主体完成 | 当前 L4；历史 native |
| Tool approval UI | P1.3 已接真实入口 | 当前 L4；历史 UI native，不是当前包 |
| Storage | REPLACED/MIGRATED：persistent + session 语义正式化 | 当前 L4；历史 native |
| Artifact / download | CURRENT ONLY 的强生命周期模型 | 当前源码/历史 native；当前候选需重验 |
| Lifecycle / recovery | Current 显著强于 Legacy | 当前 L4 + 历史 native；候选需同包重验 |

## 6. 下一工程顺序

### 第一优先级：当前 P1 候选真实 Chrome A/B/C 验收

Legacy 绑定能力：`axiosx / AppStorage / AppLocal / SDK injection`。  
Current 缺口：`01b48dcb…` 对应 P1 当前包仍没有 L6。  
重点：`src/ui/sdk-approval.js`、`src/ui/tool-shell.js`、`src/platform/host/sdk-methods.js`、`src/platform/host/sdk-broker.js`、`src/platform/chrome/network.js`、`src/framework/sdk/*`、`src/agents/page-relay.js`。  
验收：真实 permission gesture、A→B 成功、未授权 C 零效果、撤权、导航换 document、SW effect_unknown 不重放、快速 regrant 不复活旧调用。

### 第二优先级：Legacy 真实消费者兼容验收

Legacy 绑定能力：background `executeScript`、global `page`、ChromePage API、旧页面 SDK globals。  
Current 缺口：API/driver 已强，但旧消费者脚本是否在正式 Controller/SDK 入口保持行为还没有逐消费者闭合。  
重点：`src/framework/ChromePage.js`、`src/framework/context.js`、`src/scripting/sandbox/*`、`src/framework/control/native-driver.js`。  
验收：选取可追溯 Legacy consumer 作为 fixture，逐项标记保持/改变/拒绝，禁止用内部方法测试代替旧消费者。

### 第三优先级：同一候选重验 automation + lifecycle + artifact/download

Legacy 绑定能力：navigation/click/type/evaluate/wait/screenshot/upload/cookie；同时覆盖 Legacy 没有显式建模的 stop/restart/unknown-effect。  
Current 缺口：有历史 native 证据，但与当前 P1 包哈希不同。  
重点：`src/run-host.js`、`src/framework/control/native-driver.js`、`src/platform/host/authority.js`、`src/platform/downloads/index.js`、`src/platform/storage/*`。  
验收：exact document、navigation handoff、tab close、stop/deadline、SW restart、screenshot/upload/cookies、download hash 与资源释放。

## 7. 证据边界

用户指定本机路径：

- `/Users/shopme/Documents/workspace/todo-user-vue/src-bex`
- `/Users/shopme/Documents/workspace/opendesk-browser`

当前执行环境没有挂载这些路径，因此本轮不能直接读取本机工作区 HEAD。Legacy 使用已连接 GitHub 账户中的私有仓库 `shopable-ai/todo-user`；仓库描述与 `src-bex` 结构对应旧 `todo-user-vue`。

因此：

**本轮不能声称 Legacy 远端 SHA 与用户本机未提交工作区完全一致。**

未来一旦本机路径可读，应先做本机 SHA/diff 复核；如果有差异，以本机旧源码为 Legacy 优先事实源，再修订本目录。

## 8. 文档阅读顺序

1. [legacy-src-bex-framework.md](legacy-src-bex-framework.md)：只记录旧系统真实事实。
2. [current-and-target-framework.md](current-and-target-framework.md)：记录 Current 以及每个 Target 层为什么必要。
3. [legacy-to-target-map.md](legacy-to-target-map.md)：核心迁移表、行为契约表、完成度矩阵、P1 覆盖。
4. 本 README：日常入口和“完成”口径。

以后新的开发 Goal 应至少引用：Legacy 能力、Current 文件、行为差异、要求关闭的验证等级，以及本次 candidate/source SHA。
