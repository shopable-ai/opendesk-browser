# OpenDesk Browser R4：Service Worker 构建预算修正（2026-10-10）

状态：预算策略源码已实施；CI、构建及 macOS 真实 Chrome 结果按本次提交的真实运行记录确认，不用旧候选冒充最终验收。接续 R3 容量优化，不重新开发 Side Panel、下载同步事件监听或独立库。

## 结论及原因

旧版 `sw.js` 生产 320 KiB 构建上限（327680 B）是项目自己的 `scripts/build-contract.mjs` 规则，**不是 Chrome MV3 对 SW 的统一单文件大小上限**。超过它会使新一次 WXT 构建失败，但并不能据此推断已经安装的扩展随时崩溃。Chrome 允许 package-local `importScripts` 或模块 SW 静态 import，本次不改变原 classic SW 类型和权限边界。

R3 曾在其固定 CI 候选测得 SW 319248 B、SW + Native transport 355648 B；其原始证据仍在 `bundle-capacity-r3-20261010.md`。这不是本次最新 main 的构建结果。

## 新规则

| 范围 | 非阻断预警线 | 超过则失败的硬上限 |
| --- | ---: | ---: |
| 生产 `sw.js` | 达到 320 KiB | **512 KiB（524288 B）** |
| 开发 `sw.js` | development 独立报告 | **768 KiB（786432 B）** |
| 其他固定 JS | 80%/90% 预算使用率预警 | **320 KiB（327680 B）** |
| raw vendor / license / manifest | 维持原有审计 | 原预算不变 |

`entryByteBudget(target,mode)` 是 WXT 生成、最终包校验、实体文件体积审计的同一预算来源。越过旧 320 KiB 软线时，`BUILD_SIZE_REVIEW` 及 `reviewRequired` 将显示需审查，但 **不会中断成功构建**；越过 512 KiB 的生产硬线或 768 KiB 的开发硬线时，继续 fail-closed。

当前固定入口数量由合同自动获取；全部产物、源码来源、SHA-256、CSP、权限、单入口 classic IIFE、远程代码阻断、版本锁仍按现有校验器执行。全资源报告仍应呈现 `background-startup` (`sw.js` + `native-agent/transport.js`) 的实际总文件大小，不能通过简单拆文件虚报节省量。

## 本地验证（避免多个 Agent 争用同一个 dist/Chrome Profile）

```bash
git status --short --branch
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/environment/sw-budget-policy.test.mjs tests/environment/fixed-entries-audit.test.mjs
npm run check
npm run build
npm run build:dev
npm run verify
npm run build:size
npm run build:size -- --development
node --test tests/environment/package.test.mjs
```

关键行为合同：生产 SW 达到 320 KiB +1 字节仍通过；达到 512 KiB +1 字节必须拒绝。开发 768 KiB +1 必须拒绝；其他所有固定 JS 超过 320 KiB 必须拒绝。包模式、source map、Manifest、hash 不得混用或跳过。

更大的预算只是避免人为阻断开发，并不证明加载速度/内存/运行时安全。性能仍需在真实 Chrome 上测量后台冷启动、唤醒、权限撤销、持久任务恢复、Native 连接与同一安装包。不会把文件字节数直接换算为运行内存或崩溃概率。

官方技术资料：https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics 与 https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle 。
