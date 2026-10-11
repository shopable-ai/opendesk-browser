# OpenDesk Browser R5：统一固定 JS 生产预算（2026-10-11）

## 结论及动机

本轮根据用户明确要求增大 `scripts/build-contract.mjs` 中的 **`productionBytes: 320 * 1024`**，使未来 Sidebar、页面 SDK 等固定产物增长不再因一个非 Chrome 官方限制的 320 KiB 数字而直接构建失败。

历史 R4 已把 `sw.js` 的生产硬限制设为 **512 KiB**，开发版 **768 KiB**；这次**不重复上调 SW**。仅把其他生成 JS 的生产/开发硬预算从 320 KiB 提高到 **512 KiB**，并为其保留 **320 KiB 非阻断人工审查阈值**。

Chrome MV3 的 Service Worker 受生命周期、内存与静态资源规则约束，但 **320 KiB 不是 Chrome 强制的 `sw.js` 单文件大小上限**。更高的构建允许值不会自行导致已安装扩展崩溃，也不代表性能/安全已经通过验收。

## 预算矩阵

| 入口 | 旧硬上限 | 新硬上限 | 审查提醒 |
| --- | ---: | ---: | ---: |
| 生产 SW | 512 KiB | **512 KiB** | 320 KiB |
| 开发 SW | 768 KiB | **768 KiB** | 通过独立开发报告监控 |
| 其他固定 JS（生产、开发） | 320 KiB | **512 KiB** | **320 KiB** |
| 原样第三方 vendor JS | 来源/哈希与 128 KiB 预算 | 不变 | 不变 |
| manifest / license | 原有 8 KiB 合同 | 不变 | 不变 |

`scripts/build-contract.mjs` 的 `entryByteBudget(target,mode)` 仍是正式 WXT 产物上限的唯一运行规则。同步更新了 `scripts/check-source.mjs`、`scripts/verify-package.mjs` 的精确合同；`scripts/audit-fixed-entries.mjs` 继续核实真实产物的字节数、模块归属、SHA-256，并对所有生产生成入口达到 320 KiB 输出 `BUILD_SIZE_REVIEW`。

严格保留：预先定义的固定入口、自包含 classic IIFE、CSP、Manifest、权限来源、Chrome 安装模式、校验器和哈希锁；不启用远程 JS，不通过增大预算扩大权限或默认加载额外依赖。

## 工程影响和验收

改动**只影响构建是否允许输出更大的代码**；不自动让代码变大，也不会改变运行语义。未来真的生成更大的 Sidebar、SDK、SW 文件时，需要实测冷启动、交互速度、内存/CPU、缓存以及后台重启。预算上调并不能代替压缩和按职责维护。

涉及回归：

- `tests/environment/sw-budget-policy.test.mjs`：SW 生产 512 KiB、开发 768 KiB，其他 JS 512 KiB，320 KiB 为审查线；
- `tests/environment/fixed-entries-audit.test.mjs`：实际物理数据/哈希、超过 320 KiB 警告、达到 512 KiB 可通过、512 KiB +1 字节拒绝；
- `tests/environment/package.test.mjs`：真实构建包的模式与超限边界；
- `tests/environment/native-agent-package.test.mjs`：预算合同及 Native 入口未变化。

在无并行任务占用同一 `dist/`/Chrome Profile 时执行：

```bash
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/environment/sw-budget-policy.test.mjs tests/environment/fixed-entries-audit.test.mjs tests/environment/native-agent-package.test.mjs
npm run check
npm run build
npm run build:dev
npm run verify
npm run build:size
npm run build:size -- --development
node --test tests/environment/package.test.mjs
```

必须以本次提交绑定的实际 CI、build receipt、实物 sha256 和包哈希为准，不以旧候选成果冒充最新原生 PASS；构建通过并不等于已经完成真实 Mac Chrome 全场景验收。超 512 KiB 是项目内部新硬规则，届时应复核依赖关系、运行耗时及 Chrome 实际状态后再决定架构调整，不建议无限提高上限。

## CI 验证记录（e5908c5）

- 代码提交：[e5908c5](https://github.com/shopable-ai/opendesk-browser/commit/e5908c55f4a1cae4fb5d4542da7e596765af7027)。
- [构建预算专项 Actions 38105025012](https://github.com/shopable-ai/opendesk-browser/actions/runs/38105025012)：**PASS**。合同/边界 25/25，Controller/下载/SDK 144/144、真实包模式/超限 8/8；生产与开发构建、verify、全资源容量报告全部通过。
- 本次同一候选生产包：`sw.js=319827 B / 524288 B`，`ui/tool-shell.js=304053 B / 524288 B`，`background-startup=356227 B`；均是本次物理文件统计（包 SHA `9a0128c09efc978ba9324b838e3c61e36b95a01e8a13b58d1c26e38489a13add`）。开发包 SW 319993 B / 786432 B。修改只影响构建策略，实际 JS 字节保持不变。
- [R15 完整回归 Actions 38105024992](https://github.com/shopable-ai/opendesk-browser/actions/runs/38105024992)：**PASS**。全量 Node **907 总数，900 PASS / 0 FAIL / 7 SKIP**；生产 ZIP `3d5e78cab81ea347b4efc18efd620377d61cde120786aa967df6bbe4d475f457`，开发 ZIP `d3ab716345b645d25b657fcbf5c28f2f3c63029df9f88ded8ddefd628365f277`。
- [固定入口前后比较 Actions 38105025025](https://github.com/shopable-ai/opendesk-browser/actions/runs/38105025025) 的原生 macOS smoke 为独立工序；不把其未完成/有限范围解释成完整 Side Panel、用户 Mac、F3 或 ZIP 安装验收。
