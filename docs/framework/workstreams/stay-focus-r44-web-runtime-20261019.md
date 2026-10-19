# Stay Focus R4.4 — 公共受管后台提取阶段记录（2026-10-19）

- 负责人：当前 Stay Focus R4.4 对话；仓库仅 main；起始 HEAD `def46133becb0d2531403e285f2c27e31c405520`。
- 写入范围：`src/platform/chrome/browser-managed-site-policy.js`、`tests/environment/browser-managed-site-policy-r44.test.mjs`、Stay Focus `trusted/service.js`、`trusted/model.js`、`trusted/rule-ownership.js`、`scripts/bundle-provenance.mjs`、`.github/workflows/stay-focus-r1.yml`、本记录。
- 公共契约：新增固定编译的 Chrome 受管前台观察、保守预算结算和 DNR 归属读回原语。原 `focus.*` RPC、存储键、规则 ID、Host 可信文档验证、packageHash/epoch 与用户权限流程不改。未公开新的沙箱 SDK 操作；禁止任意安装包后台 JavaScript。
- 真实消费者：Stay Focus SW `trusted/service.js` → 公共前台观察；`trusted/model.js` → 公共结算；`trusted/rule-ownership.js` → 公共 DNR 对账。原有静态 Service 仍保留，不把此阶段误报为全部后台 Runtime 独立升级。
- 本次仅新增可由 Node 验证的隔离/休眠/跨日/DNR 对账测试；原生 Chrome、固定宿主跨版本安装、独立应用升级仍需真实证据。
- 写入前无共享本地文件/进程使用，远端 main 更新用 expected HEAD 栅栏；无分支、worktree、PR、强推或覆盖他人文件。
- 状态：实施提交待 CI 验证；此记录不是正式版本验收。

## R4.4 用户修改结果未知修复

- 修正 SidePanel/Sandbox 桥对于 `focus.*` 写入超时误标 `E_TOOL_TIMEOUT` 的问题，改为 `E_OUTCOME_UNKNOWN`，提示先读取真实 Host/DNR 状态，不盲目重复写入。
- 修正应用自有可信 Host 写入后 sender 已退役、与 worker 消息失联时的结果未知分类；只读 status 出错单独标注，不假称授权失败。
- 新增有真实包、安装代际、可信 Host mock driver 的定向消费测试。真实 Chrome 网络断开/原生 DNR 的测试仍待 CI。

## 公共安装身份与权限栅栏

- 新增 `src/platform/host/managed-site-authority.js`，只读取已有 Sidebar Tool Registry、enabled、revocation epochs，并对单个已安装工具做严格能力、包哈希及安装代际校验；完全没有新建 Registry/Host/Storage。
- Stay Focus 真实 `service.js` 的 `authority()` 与可信 mutation dispatch 已改为上述共享入口，仍使用应用自有 `focusPackageHash`、`focus.control` 和原始 `FOCUS_STORE`。真实 Origin/Host 文档检查依旧由现有 `hostDocument` 执行。
- 单独覆盖损坏/重复/撤权/禁用/旧包哈希/旧 epoch 的拒绝测试。本节属于固定可信后台基础设施，尚未注册成对沙箱开放的公共 SDK 新方法。
