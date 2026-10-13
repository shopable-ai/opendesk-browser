# Time Review R1.4 · 旧版业务蒸馏、可选同步与候选状态

日期：2026-10-13。单一集成目标：`shopable-ai/opendesk-browser` 的 `main`；旧来源仓库仅只读。

## 仓库身份与并行写入

- 旧版 `todo-user` 核查 SHA：`0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5`。
- 开始读取的新 `main`：`7a4da3e6e2cb88bbfba7015f7ee5b21fab50e2a3`。
- 审核期间 `main` 已推进到 `de52893a69d5107b4d60f837c9e570d7298ac588`，对比期间 3 个提交修改 Browser SDK/测试，未改 Time Review 指定文件。集成前观察到并行写入；本轮经用户明确授权，只以最新主分支为父提交、HEAD 租约校验的原子树提交合入，不强推、不覆盖并行修改。
- R1.3 原生历史成功：[Actions 38254766089](https://github.com/shopable-ai/opendesk-browser/actions/runs/38254766089)，`e1e82ea7501c41713e6215883adac1f7836ab367`；其 Time Review 候选测试不能升级成 R1.4 当前状态。

## 已实施及已验证（已纳入本次集成；真实浏览器仍待验证）

- `[PASS · SOURCE_READ]` 旧 `TimeReview.ts`、`background.ts`、`my-content-script.ts`、`detect_focus.js`、`TraceTimeUtil.js`、`TraceTimeCore.js`、`custom_event.js`、旧 Manifest。
- `[PASS · SOURCE_READ]` 新 `model.js`、`service.js`、`policy.js`、`host-controls.js`、`src/sw.js`、`src/ui/sidebar-tools.js`、工具配置/README、测试指南与历史验收。
- `[PASS · DESIGN]` 判断旧 focus/click/keydown 仅注册，Time Review 主消费者为 mousemove；拒绝全站内容脚本复制。
- `[PASS · ISOLATED_NODE]` `src/time-review/sync-outbox.js`：可恢复的本机同步准备队列、基线、稳定身份、修订 ACK、限额、重试、账号隔离。
- `[PASS · ISOLATED_NODE]` `src/time-review/sync-transport.js`：HTTPS 原点/权限/凭据显式要求、最小字段 PUT、ACK 严格检查；无真实联网激活入口。
- `[PASS · ISOLATED_NODE]` `tests/environment/time-review-r14-sync-outbox.test.mjs`：12 / 12 PASS、0 FAIL；运行环境 Linux Node 22，使用注入 `fetch` 观察请求，不是生产服务器。
- `[PASS · DOCUMENTED]` `examples/sidebar-tools/time-review/LEGACY-DISTILLATION.zh-CN.md` 迁移矩阵和边界。

## 不得提前关闭的任务树

```
Time Review R1.4
├── 旧版业务蒸馏 [SOURCE_READ PASS]
│   ├── detect_focus → background → TimeReview 调用链 [PASS]
│   ├── 云端协议、身份、时间聚合风险 [PASS · 静态源码]
│   └── 迁移矩阵及长期插件原则 [COMMITTED]
├── 后台活动检测 [REUSE_RECORDED_PASS · R1.3 原候选]
│   ├── tabs/windows/idle/alarms + 权限 [PASS · 历史原生]
│   ├── 无内容脚本、Side Panel 关闭与 Worker 恢复 [PASS · 历史原生]
│   └── R1.4 新包实机／DST/长视频精度 [NOT_TESTED]
├── 可选云同步 [PARTIAL]
│   ├── 最小 HTTPS v1 协议草案与单机准备队列 [ISOLATED_NODE PASS]
│   ├── 与真实可信 Host 同次持久写接线 [IMPLEMENTED · 新包待回归]
│   ├── 账号体系/Token 权限与显式用户授权 [BLOCKED · 缺已确认账号/服务]
│   ├── 旧 todo6 服务可达性与新 upsert 接口 [BLOCKED · 无已验证契约]
│   ├── 原生 alarms 触发、重试、ACK、Chrome 重启 [NOT_TESTED]
│   ├── 服务端真实保存、去重、响应丢失对账 [BLOCKED]
│   └── 跨设备合并、云端删除和账号切换 [BLOCKED]
├── 工具设置与生命周期 [PARTIAL]
│   ├── 旧的可信本地 UI [REUSE_RECORDED_PASS]
│   └── 真正可用的云账号和同步控制 [BLOCKED · 不展示假入口]
└── 正式验收与安全集成 [PARTIAL]
    ├── 新模块隔离单元测试 [12 PASS]
    ├── 本仓库 check/build/build:dev/verify [NOT_TESTED]
    ├── macOS Chrome 新包 [NOT_TESTED]
    ├── 真实生产 HTTPS 服务及原始保存结果 [BLOCKED]
    └── main 原子提交 [COMMITTED]；CI hash/SHA [NOT_TESTED]
```

## 交付状态（必须按实际证据）

| 项目 | 状态 | 原因 |
| --- | --- | --- |
| 源码蒸馏与设计 | PASS | GitHub 旧新源代码实读 |
| 离线同步协议与队列 | 组件测试 PASS | 12/12 隔离 Node 单元，不假装原生 |
| 与正式可信 Time Review Host 的持久化闭环 | 源码接线已合入 / Chrome NOT_TESTED | 需用最新 main 验证真实持久写、状态恢复和性能 |
| 真实 Mac Chrome | NOT_TESTED | 当前环境不是用户 Mac，不能用 CI 原候选冒充 |
| 旧服务器可达性 | BLOCKED | 公网检查无法读取 API 响应，且无已验证凭据和协议 |
| 真实服务器同步、幂等、对账 | BLOCKED | 缺生产 HTTP ACK、服务端状态和账号隔离验收 |
| GitHub main commit SHA | 本次合入提交 | 详见 GitHub main 历史及本轮交付记录；禁止将历史候选当作新候选 |
| R1.4 包 SHA、SW 体积 | CI_PENDING | 需等待本次构建真实日志；不伪造数值 |

本轮不提供无证据的八维度 95 分。待上述 BLOCKED 被解除后，以**同一最终候选**分别评估功能、时长准确性、隐私、安全、UI、性能、恢复、可维护性和证据可信度。性能的任务专注于局部新队列，基于 R1.3 旧包的性能比较才可算新版本成本。
