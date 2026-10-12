# Product Ecosystem R3 — 工程工作流与证据交接

> 建立日期：2026-10-12。工作流拥有范围：`docs/product/browser-extension-ecosystem/product-ecosystem-r3-roadmap.zh-CN.md`、`docs/framework/prompts/goal-product-ecosystem-r3.zh-CN.md` 及本文件的 **R3 导航与增量进度**；本轮不声明任何新业务功能完成。  
> 本工作流不取代原 Browser SDK、Cloud Control、Program、UserScript、市场或 R8 项目各自的 source-of-truth 与验收责任。

## 一、本轮实际工作：R3 文档落库（仅文档）

- 实施形式：**新增 R3 路线图、可复制执行 GOAL、本工程记录；更新生态 README、`next-goals.zh-CN.md` 和 Extension Factory 架构导航**。不新增业务源码、WXT 入口、npm 命令、Chrome 权限或运行时代码。
- 本轮只读核对的起始 `main`：`95bb544a36f54e3cc8363ee3baf61cc4bb3ab634`。这是审查时点，非后续开发或 Chrome 包的冻结身份。真正文档提交以 GitHub `git log -- docs/framework/workstreams/product-ecosystem-r3.md` 可查。
- Page QA 清理事实来自 [代码提交](https://github.com/shopable-ai/opendesk-browser/commit/6d71854b49fc2fcbace0047b8703b9c2c154211b) 与 [文档提交](https://github.com/shopable-ai/opendesk-browser/commit/9122d8d8c29b5f15e417d0d4fab39bae645d5c0a)；`DEPRECATED / NO_RELEASE / SOURCE_REMOVED_FROM_MAIN`。本轮不重新创建或验收。
- 下一轮工程读取 [R3 Roadmap](../../product/browser-extension-ecosystem/product-ecosystem-r3-roadmap.zh-CN.md) 和 [R3 GOAL](../prompts/goal-product-ecosystem-r3.zh-CN.md)；商业研究使用 [电商 R2 GOAL](../prompts/goal-ecommerce-tool-universe-r2-commercial-validation.zh-CN.md)，两者不可互相冒充完成。
- GitHub Connector 不提供 Mac 本地工作目录或实时 Chrome 浏览器原生证据；本轮不宣称本地清洁、完整 Node 回归、Chrome 安装或 CWS 批准。

## 二、当前 R3 任务状态

| 节点 | 状态 | 已知依据 / 缺口 |
| --- | --- | --- |
| P0 Page QA 清理 | `COMPLETED`（既有历史提交） | `6d71854b` 删除专用源码与命令；最新构建候选回归仍需按输入评估 |
| P0 默认包回归 | `NEEDS_REVIEW` | `build` / `pack` 脚本已静态检查未改，但本 R3 未运行完整回归 |
| P1 框架可复用能力地图 | `PLANNED` | 以原 Browser SDK 与 Page/Market workstream 为准，不能凭文件存在提升 |
| P2 EXP-005 卖家 Listing/SKU Demo | `PLANNED` | 需求/权限/可运行入口尚待本任务实施 |
| P2 EXP-007 消费者到手价 Demo | `PLANNED` | 合法数据源或手动输入、真实 UI/错误处理尚待实施 |
| P3 通用独立 Extension Factory | `CONDITIONAL` | 需独立产品需求证据、非商业 Fixture、产品级权限与构建验收 |
| P4 R3 新业务原生/包验收 | `NOT_TESTED` | 本轮只保存文档，不宣称原生/ZIP/付费证据 |
| P5 统一文档入口 | `DOCS_ONLY` | 本次新增与导航更新；不等于上述工程产品已实现 |

## 三、真实工程工作记录模板（后续增量追加，禁止伪造结果）

~~~text
日期 / 负责人或工作流：
读取 main SHA：
涉及路径及并行占用检查：
用户操作与受影响执行世界：
旧行为 → 新行为：
源码修改 / 真实消费者与入口：
定向测试命令与实际输出：
候选 commit、源码/资源/ZIP 哈希：
复用证据（原来源和级别）：
未测试 / 失败 / 阻断与风险：
提交推送结果（真实 SHA 或 BLOCKED）：
下一步最小可安全执行任务：
~~~

成功的历史证据不能改写；只有相关源、合同、构建输入、Fixture 与真实 Chrome 环境一致时才允许引用 `REUSE_RECORDED_PASS`。多 Agent 同步写入 `main` 时，只按仓库 `AGENTS.md` 做安全检查，不创建分支/Worktree/PR、不强推、不抢占别人的 Chrome Profile/端口/dist。

## 四、下一轮最小推进

1. **P0**：查活跃引用和相关已存在验收证据，确认 Page QA 清理没有造成默认构建入口或包验证回归。
2. **P1**：逐一把 EXP-005/EXP-007 的动作映射到实际工具、UserScript、Host、权限与测试入口。
3. **P2**：从最低权限且可合法验证的 A/C 场景实现至少一个真正可运行的 Demo，另一场景提供尽可能真实的基础版或具体阻断报告。
4. **P3**：只在用户明确需要独立安装发行、差异化/买方/维护成立后实施通用 Factory；两种非商业测试 Fixture 不应变成新商业产品。
5. **P4/P5**：做受影响验证，按证据更新工程状态与下一 GOAL，不重复其他工作流的真实测试。

**本文件是 R3 工程进度导航，不是第二份 R8/OPP/EXP 台账，也不是 Page QA 产品复活入口。**