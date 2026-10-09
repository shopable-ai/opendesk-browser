# 用户脚本依赖 D1：当前实现与兼容边界

更新：2026-10-09（R9 复核）。本文保留 D1 依赖架构及历史记录；**“开发”页已改为普通 JavaScript 源码优先，不再提供 @require 地址输入、插入声明、读取审核、版本下拉框和旧版 jQuery 勾选界面。** 原文“静态自评 97/100”撤回：没有完整兼容、正式 Page 安装和真实 Chrome 回执，不能据此认定达到 95 分。

## 当前推荐：直接编辑 JavaScript

- 在“开发”页编辑单文件 JavaScript，或用现有多文件 ESM / package.json 本地构建，导入完整 JS 构建产物。**不需要** `// ==UserScript==` 元数据，也不应让一个参考竞品的协议主导通用开发界面。
- “运行草稿”使用 Controller 的 `page` / `params`；“网页 JavaScript 试运行”使用独立的隔离 DOM 执行入口。后者支持普通顶层语句，以及声明 `main()` 后等待其返回结果；运行均需要真实网站授权。
- 第三方依赖优先在源码/构建阶段通过 `import` 与 `package.json` 明确版本并打包；**不会**在 MV3 扩展里根据远程 URL 自动下载并执行脚本。旧格式 `@require` 仅为兼容：如已有**唯一**已审核本地依赖锁，则继续复用并在运行时复验；无锁或多锁时明确拒绝，并提示迁移到本地构建。没有新增批准入口，不能声称支持直接安装新的远程 `@require`。
- 兼容解析器、底层不可变依赖锁和 Page 候选合同仍保留；这里简化的是界面和默认工作流，不是放宽来源审核、GM 权限或隔离世界。

## 以下为 2026-10-08 历史 D1 界面记录（现已退役）

## 已接通的用户路径

开发界面自动解析源码中的标准 `@require`；用户选择扩展内置资产、当前 HTTPS 资源或已批准缓存，点击读取资源，再查看实际来源、原字节 SHA-256、大小、许可证状态与风险，明确批准为不可变锁。当前文档试运行通过原有可信 Broker、Host 和站点准入，读取同一依赖管理器中的固定字节，交给 `chrome.userScripts.execute`。修改正文、保留依赖声明及入口模式后，可直接复用锁，不要求保存 Program Revision，也不在运行时访问 CDN。

```javascript
// ==UserScript==
// @name 网页增强脚本
// @match https://example.com/*
// @require https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js
// @run-at document-idle
// ==/UserScript==

async function main() {
  return $('h1').first().text();
}
```

上述代码选择页面 `async-main` 入口；普通顶层脚本、IIFE 则明确选择 `classic-userscript`。不根据 `@grant none` 切换 MAIN，不将这两种页面模式转换为 Controller Worker 入口。内置 jQuery 的准确别名映射只属于来源适配器，审核时显示真实扩展资源来源；其他 HTTPS 库走相同资产、审核、锁和编译器。

## 现在应采用的设计

- [D1 架构 ADR、四方案评审及反方意见](userscript-dependencies-d1-adr.zh-CN.md)
- [依赖与 Page Program v1 数据合同](userscript-dependency-contract.v1.zh-CN.md)
- [本轮独立工作记录与验收等级](../../framework/workstreams/userscript-dependencies-d1-20261008.json)
- [真实 CFT 环境失败证据与最短原生验收入口](../../framework/workstreams/2026-10-08-d1-native-environment-evidence.zh-CN.md)

## 阶段和限制

| 范围 | 本轮实际能力 | 尚未完成 |
| --- | --- | --- |
| P0 | 解析与运行准入分开；保留声明；多依赖顺序；无哈希 URL 可审核；相对来源及 SRI 明确解析 | 所有油猴指令与 GM API 的完整实现 |
| P1 | 三类资产来源、内容寻址、二次审核批准、原生 API 消费者接线、未保存调试、缓存离线组件链 | 真实 Chrome 中的 jQuery DOM、第二个远程库、授权、世界隔离及浏览器重启验收 |
| P2 | 独立 `opendesk.page-program.v1` 合同及共享依赖的注册描述编译器；旧 R3 走显式 legacy 路径 | Page Candidate/Verification/Available、明确安装启用、自动匹配与注册对账、正式资产引用 |
| 后续 ESM | 预留独立构建模式，来源最终仍归一为固定资产 | 静态依赖图、模块转换及安装验证；普通用户脚本不采用远程动态 import |

当前限制为：源码 128 KiB、头部 64 KiB、最多 64 个依赖、每项 1 MiB、按执行顺序累计 4 MiB、每次 HTTPS 获取 20 秒。所有重定向均拒绝；不支持的指令保留但阻断执行。强 SRI 采用显式 `all-strong` 校验规则，不冒称与各用户脚本管理器的冲突选择策略完全一致。

经典模式保留顶层结构，依赖和正文合成同一编译单元以确保同步异常阻断后续执行；顶层严格模式及变量声明可能相互影响。完成回执只证明顶层同步部分返回，不等待异步 IIFE、计时器或监听器。USER_SCRIPT 能读改 DOM，也可能通过网页允许的渠道外传数据；它不是网络沙箱。

每个文档最多分配六次预览世界，且每次先向浏览器核验命名世界没有回退到默认 USER_SCRIPT。达到预算后要求刷新；配置 reset 不会销毁当前世界或撤销已产生的效果。正式自动运行还需统一解决每文档的世界容量准入，不能借预览探针宣称 P2 已完成。

**上述 checkbox 描述为 2026-10-08 历史计划，不代表现行页面存在这个控件。** 2026-10-09 起不再提供 jQuery 勾选、@require 输入和版本下拉；已有批准锁继续复用，新依赖使用本地 ESM/npm 构建。Sidebar 保留既有页面结构，不增依赖配置标签页。
