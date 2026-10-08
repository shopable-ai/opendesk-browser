# OpenDesk Browser · 一页看懂运行架构（D2）

> 更新：2026-10-08。这里只说明**真实源码已接线的能力**，不是功能愿景或 Chrome 验收通过声明。详细技术约束见 [D1 ADR](userscript-dependencies-d1-adr.zh-CN.md)。

## 1. 先记住三个概念

**依赖锁**回答「执行哪一份第三方 JS 字节」；**运行授权**回答「这次能不能操作当前网页」；**任务安装**回答「以后是否允许自动匹配运行」。这三件事互不替代。

下载 JS ≠ 自动执行。审核 SHA-256 ≠ 代码安全。组件测试通过 ≠ 浏览器实际注入成功。

## 2. 源码写法与执行环境要分开

复杂项目优先采用 [多文件 ESM + package.json](program-project-authoring-r1.zh-CN.md)，传统油猴脚本保留 @require。多文件只是源码的组织与构建输入，不是第三种高权限执行世界。当前已有静态校验器和单文件 ESM 构建工具，可将页面项目编译为 JS 并手动导入 Sidebar，Controller 项目还能生成符合 Task v1 的待验证 JSON；**Chrome 原生多文件流程及正式 Page 安装仍未验收/实现**。

## 3. 目前只有两条脚本执行路线

```text
                       OpenDesk Browser Sidebar
                     （我的任务 / 发现 / 开发）
                                │
                  编辑 / 粘贴 JS / 以后 AI 生成
                       ┌────────┴────────┐
                       ▼                 ▼
                  页面用户脚本        Controller 自动化
                 DOM / @require       ChromePage / page
                       │                 │
                 解析元数据            RunHost + Worker
                       │                 │
                 审核固定资源            自有授权/运行身份
                 SHA-256 缓存与锁         │
                       │                 │
                USER_SCRIPT.execute      受控浏览器操作
                （单次手动预览）           │
                       │                 │
                  原生页面 DOM           持久 Run Result

   页面脚本的未来安装：Page Revision → Candidate → Verification →
                        Available → Installed → userScripts.register
                       （目前尚未打通，不能称作已安装）
```

Controller Worker **绝不自动接收**页面脚本 `@require` 下载的代码；共享的是受信宿主与资产管理理念，不是同一权限世界。用户粘贴的 `@require` 属于 **Page USER_SCRIPT**。

## 3. 为什么不再需要固定的 jQuery 勾选项

```javascript
// ==UserScript==
// @name 网页标题
// @match https://example.com/*
// @require https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js
// @run-at document-idle
// ==/UserScript==

async function main() { return $('h1').first().text(); }
```

现有数据链：`dependency-metadata.js` 识别声明 → `dependency-manager.js` 读取扩展内固定 jQuery、HTTPS 或本地文件 → 用户检查**实际字节**与 SHA-256 并批准 → IndexedDB v2 `frameworkKV` 保存共享资产和独立批准锁 → `preview.js` 只读取已锁资源，调用 `chrome.userScripts.execute()` 在 USER_SCRIPT 中执行。没有第二套 jQuery 执行器。

同哈希可以共享存储，但**不同来源的批准不能共享**；正文修改可复用锁，依赖声明、来源身份或入口模式变化须重新锁定。离线运行不访问 CDN，但缓存缺失/损坏时会失败，而不是悄悄重新下载。

## 4. 两种页面入口，不能互相冒充

| 入口 | 适合什么 | 运行结果的实际含义 |
| --- | --- | --- |
| `classic-userscript` | 原样粘贴经典油猴脚本、顶层 IIFE、全局声明 | 只确认顶层同步求值完成，不等待异步 IIFE、监听器、计时器 |
| `async-main` | OpenDesk 页面调试：定义 `async function main()` | 等待 main Promise 并接收本次返回值/异常 |

这两种页面模式都默认隔离的 `USER_SCRIPT`；不会因 `@grant none` 改到 MAIN。当前仍不提供 GM_*/@resource/@include 的完整兼容或任意 ESM 远程 import；不支持的语义应明确报错。

## 5. 三道准入门：正确性靠谁保证

| 准入 | 真实负责人 | 最重要的失败关闭条件 |
| --- | --- | --- |
| **字节是否固定** | Metadata Parser、Dependency Manager、不可变依赖锁 | URL/SRI 不符、哈希变化、锁与源码不一致、缓存损坏 |
| **本次页面可执行** | Chrome 网站权限、可信 Broker / Authority、精确 tab/frame/document、USER_SCRIPT 世界 | 撤权、导航、宿主关闭、Controller 占用、隔离验证失败 |
| **长期自动运行** | *未来* Page 专用 Revision、Verification、Available、Installed 及注册对账 | 尚无类型对应的验证或允许安装时，绝不注册运行 |

**不要把一份“可编译的注册描述符”误认为可以自动安装。** 目前 P2 只有 Page 资产合同/注册描述编译器，还没有正式安装与启停闭环。

## 6. 目前到底实现到哪里

| 用户可见目标 | 当前状态 |
| --- | --- |
| 识别多条标准 `@require`、无哈希 URL | **已实现，组件测试通过** |
| 下载/审核/锁定，缓存资产、离线读取路径 | **已实现，组件测试通过** |
| 开发区不保存草稿直接调用原生 `userScripts.execute` | **源码已接线，模拟消费者测试通过；真实 Chrome 未验收** |
| 已安装 Page 脚本自动匹配、停用、重启恢复 | **尚未完成** |
| 全面油猴 GM_*、MAIN、ESM 兼容 | **尚未实现；明确拒绝不支持的运行语义** |

上轮受控 CFT155 启动在加载扩展前遭到环境 AF_UNIX EPERM 阻断。因此 *CHROME_NATIVE_VERIFIED / USER_FLOW_VERIFIED / FINAL_FRAMEWORK_ACCEPTED* 均不能标记通过；参考[环境证据](../../framework/workstreams/2026-10-08-d1-native-environment-evidence.zh-CN.md)。

## 7. 接下来按最短路径推进

1. **先验收 P1 的真实 Chrome 页面链**：同一候选版本、真实 Allow User Scripts 与站点授权，jQuery 和另一普通库按序生效，修改正文、离线重复调试、MAIN 不污染、错误和撤权阻断。此项未完成之前不删过渡入口。
2. **再完成 P2 正式安装**：补类型专用 Verification / Available / Installed，统一处理页面脚本世界数量、重复注册、卸载、权限变化及浏览器重启对账；不得复用 Controller 的验证结果冒充 Page 验证。
3. **最后扩展语义与来源**：GM_*、@resource、ESM/npm/Git 等单独评审，最终仍使用相同资产锁模型，不增加第二执行器。

这份说明的原则是：**先讲使用路径，再讲谁负责正确性，最后讲已证明与未证明。** 不根据测试数或主观评分宣布 95 分验收通过。
