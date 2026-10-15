# Platform UI R32 · 方案沉淀与容量政策修订

日期：2026-10-15。负责人：本次 ChatGPT 网页对话 UI 平台方案保存任务。
状态：COMPLETE_DOC_SCOPE / IMPLEMENTATION_PENDING。起始只读基线：`1c2d2623eeec0b74182e0ab185c328e7ef43bccf`；范围登记提交：`75bdb316326dcd1074464a2c541a2e08f0fa7ea1`。

## 授权、已保存文件与资源

用户要求直接保存 UI 平台方案，并纠正“工具包上限不可修改”的前提。仅 main 正常提交；没有分支/worktree/PR、强推、正式发布。本轮只改 Markdown/Skill，没有修改运行时代码、依赖锁、CSP、安装身份或实际容量常量。

| 文件 | 保存内容 | 已写入 main 的提交 |
| --- | --- | --- |
| `docs/architecture/browser-ui-r23.zh-CN.md` | 现行平台方向、候选状态、原始预算依据、可调整容量政策、持续回写责任 | `faeceacbb9ea0c86a2ff4b2629a2386b4f730ac6` |
| `docs/framework/prompts/goal-ui-platform-r32.3-document-driven.zh-CN.md` | 普通网页版增量续接 GOAL，保留已有方案并要求逐阶段保存 | `57a88a897cfa7edc8fff077e9a5b94bd7168a52e` |
| `.agents/skills/opendesk-sidebar-tool-package/SKILL.md` | 可调整预算、单位区分、源读取至沙箱/升级全链一致性 | `abc59b9dd4328edd0bde15f03262cc4b18b1ddd7` |
| `.agents/skills/opendesk-ui-preview/SKILL.md` | 平台组件预览、候选/模拟证据区分、阶段结论回写 | `42e304889710a7440842b84947c145fb3b72937c` |
| 本工作流 | 来源、决定状态、真实保存与未完成项 | 以包含本段的实际 Git 提交为准 |

资源为 GitHub 文档读取与串行 main 保存；不占用用户 Mac watcher、dist/development、端口、Chrome Profile、SDK 或构建。记录不是全局锁，不修改其他工作流。

## 原始容量来源

本轮基线 `src/ui/sidebar-tools/package.js` blob 为 `e541c4538a3b040212f04a7e48d3f418214aba0c`。`MAX_PACKAGE_BYTES = 320000` 检查 JSON 的 UTF-8 字节；`LIMITS.js = 220000` 经 `.length` 检查 JavaScript UTF-16 code units，不是 gzip 字节或严格意义的 Unicode 字符数。

该文件首版 `59153b6460c453cd2f548cc23586d91a5c2959ef` 已包含这些值（初始源码 blob `99f5eadb732869ac3bc8630a939b7d3fa961c63b`）。同提交 `docs/product/sidebar-custom-tools-r1.zh-CN.md`（blob `c7bac8d602cee6677f7e06989bd5bc95ccc6409c`）明确写明：

> 容量是 R1 的预算，扩大时须复核整个消息与存储链。

因此查到了“R1 资源预算、允许复核后扩大”的初始依据；不能当作 Chrome 官方工具包硬上限。本轮查阅的初始源码、提交说明和相关文档未提供为什么具体取 220000/320000 的量化推导或这些数字的用户批准证据。不据此断言数值必错，也不臆造原作者/AI 的内部思路。

来源：
- [首版提交](https://github.com/shopable-ai/opendesk-browser/commit/59153b6460c453cd2f548cc23586d91a5c2959ef)。
- [首版容量源码](https://github.com/shopable-ai/opendesk-browser/blob/59153b6460c453cd2f548cc23586d91a5c2959ef/src/ui/sidebar-tools/package.js)。
- [R1 产品预算说明](https://github.com/shopable-ai/opendesk-browser/blob/59153b6460c453cd2f548cc23586d91a5c2959ef/docs/product/sidebar-custom-tools-r1.zh-CN.md)。
- [本轮基线容量源码](https://github.com/shopable-ai/opendesk-browser/blob/1c2d2623eeec0b74182e0ab185c328e7ef43bccf/src/ui/sidebar-tools/package.js)。

## 已确认与待验证

| 项目 | 状态 | 当前结论 |
| --- | --- | --- |
| 平台 UI 目标 | DIRECTION_CONFIRMED | 降低用户/AI 反复开发复杂控件成本，不只修宿主 CSS |
| 能力分层 | DIRECTION_RECORDED | 一个 Design System，原生轻量与复杂 React 路径，模板/Skill/预览复用既有入口 |
| 第一试点 | PRIORITY_RECORDED | 独立书签 Tree、Select/Combobox、Menu；保护原服务/SDK，真实保存故障单独验 |
| UI 库 | CANDIDATE_PENDING | React Aria 优先研究，Radix + 明确 Tree 为强候选；尚未封版 |
| 历史预算可调整 | POLICY_CONFIRMED | 用户已明确允许，原 R1 也允许复核后扩大；旧数字不否决组件路线 |
| 具体新容量 | NOT_SELECTED | 本轮没有构建/性能数据，不拍新数值；运行时尚未扩容 |
| 安全与有限资源机制 | PRESERVE_AND_RETEST | 可调数值，不关闭权限/身份/CSP/沙箱/异常拒绝 |
| 分阶段保存 | REQUIRED | 决定形成就回写理由、证据、版本、限制和下一步 |
| 真实产品评分 | NOT_SCORED | 聊天 80/93/96 为未验证预评，不升级为验收 |

## 并行保存与验证边界

已读 AGENTS、并行协议、测试复用指南、架构及两项 Skill。远端在保存期间持续推进；先核对变更文件无重叠，尝试 expected-head 非强制更新。分支更新接口返回错误后均先回读确认，没有把失败候选当成已推送；没有强推或覆盖主线。

随后使用 GitHub Contents API，按各文件当前 blob SHA 串行保存，既有文件若变化由接口拒绝，其他路径提交保留。未集成的候选对象 `4e8e226c`、`a50ad50a`、`8e656e30` 不作为交付或测试证据；实际交付为上表的 main 文档提交。没有创建额外分支。

文档级人工核对包括职责、现行/历史关系、预算单位、候选与实施状态、关键链接入口。运行时代码保持不变；没有执行本地 Node、全仓构建、React 体积实验、HTML 交互或用户 Mac Chrome，均为 NOT_TESTED。容器公开 GitHub API 读取遇 DNS 失败后，使用已连接 GitHub 完成实际读写，不据此宣称用户 Mac 故障。GitHub CI 只认准确提交的实际状态，不从文档保存推导任何产品 PASS。

## 接续位置

执行 [R32.3 GOAL](../prompts/goal-ui-platform-r32.3-document-driven.zh-CN.md)：先在现有书签与 React Starter 上做最小可操作候选，再形成库选择和工作预算，立即写回 [现行架构](../../architecture/browser-ui-r23.zh-CN.md)。容量代码实施必须覆盖打包、导入、Host、消息/预览、存储、Sandbox 和升级，不能只改一个常量。

没有在本轮选新容量，不代表后续不能直接合理调整；它只是文档任务缺少定值实测依据。下一轮无需重新寻找全部历史或重建总体 GOAL。资源状态：RELEASED_DOC_SCOPE；没有本地服务被启动或占用。

## R32.3 NEXT · 自包含 GOAL 可读性修订（2026-10-15）

用户指出前一份聊天启动词仅要求读取仓库文件，无法直接看出核心目标、关键任务步骤和完成标准。已将现有 `docs/framework/prompts/goal-ui-platform-r32.3-document-driven.zh-CN.md` **原位重写**为可独立复制的执行 GOAL：最高目标是平台级可复用组件能力；第一可见成果是书签 Tree/文件夹选择/更多菜单的可交互预览；其次比较原生、React Aria 与 Radix+Tree，再形成 UI Kit 最小实现、可调整容量的实测方案、独立工具试点及逐阶段回写。保留安全、并行开发和证据等级，不要求重复创建新的总 GOAL。Markdown 排版校订提交 `8bde6ed4bc43e50a262203c98b100ffcc9e4e5b1`；本次修改仅文档，真实 React/Chrome/容量改码保持 NOT_TESTED。
