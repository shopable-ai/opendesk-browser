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

## 五、R3 EXP-005 第一阶段源码入库（2026-10-13）

- **操作位置**：仓库 `examples/programs/listing-sku-inspector`，启动入口为已有 Side Panel「开发 → 本地项目 → 运行本地项目」或构建后的 Page 草稿导入/手动预览；在 `examples/tasks/demo-form.html` 的商品区域编辑数据并点页面 Shadow UI 的「检查当前商品」。不是普通 Side Panel sandbox 工具自动读取 DOM，不需要第二个扩展。
- **输入/权限/结果**：Page USER_SCRIPT 已授权当前 tab 的 `document`；项目规则仅 `http://127.0.0.1/*`，运行时再严格限定 `http://127.0.0.1:43111/demo-form.html` 与唯一 `data-opendesk-listing-fixture="seller-listing-v1"` 区域；用户点击才调用 `readListing`；结果显示错误/提醒与字段路径，关/Stop 由既有受管 UI 释放。无跨域请求、无写入业务表单、无 Cookie/API 密钥、无存储。
- **已入库的实际源码**：`src/listing.js` 纯业务与有界读取；`src/view.js` 按钮及文本安全呈现；`src/main.js` 复用 `@opendesk/ui`；`assets/ui.css` Shadow 样式；新增专属 Node 测试、本地 Fixture 场景切换 JS，并向原有 `examples/tasks/demo-form.html` 增加明确标记的商品表单。没有改 Browser SDK、Host、Authority、市场、官方 Catalog 或生产构建命令。
- **P0 检查**：已在 GitHub `main` 只读确认旧产品、专属 factory 包、专属 build/pack/verify 路径不存在，默认 npm 脚本仍在；未运行完整 `git grep` 和当前源码构建，不能把此项记为回归 PASS。
- **组件实际结果**：在 `/mnt/data/opendesk-r3-staging` 的隔离候选源码目录中执行 `node --check`（main/listing/view/fixture/test）通过，`node --test tests/environment/listing-sku-inspector-r3.test.mjs` **8 pass / 0 fail**。Node 测试涵盖四种数据场景、重复规格/主 SKU、允许范围、缺失/歧义字段、UI 点击触发/重检/失败清理、DOM fixture 按钮切换。由于 Mac 仓库不可用，针对仓库实际全量 demo-form 源码的 Node/Build 尚未执行；这是“测试基于隔离组装 Fixture”的证据限制。
- **浏览器阻断**：尝试临时 localhost 43111 + 本环境 Linux Chromium Playwright；导航返回 `net::ERR_BLOCKED_BY_ADMINISTRATOR`，未形成任何浏览器正常运行 PASS，资源已关闭。Mac Chrome、用户脚本真实安装/授权/撤权/Stop、包 SHA/ZIP 一律 `NOT_TESTED`。
- **并行保护**：GitHub `main` 使用原子树提交与预期 HEAD 校验，仅改本工作流 11 个路径；不创建分支/Worktree/PR，不强推。用户 Mac 本地 Git、Chrome profile 和测试资源不可访问，不能凭远端提交推定本地安装或原生成功。
- **下一步**：在能访问 Mac 的串行执行环境核对 `git status --short --branch` 与 `origin/main`，保护未提交文件后安全同步远端（不再应用旧补丁）；执行项目校验、受影响构建、真实 Chrome 用户脚本/网站授权/导航/Stop/重复运行，并追加绑定候选 SHA 的回执。EXP-007 与条件性 P3 保留待办。


### CI 路径回归修复（2026-10-13）

- 初次源码提交 `76e7e0125b49a80a901ec4402bfc9da161a02406` 的 GitHub Actions 显示：四个传统任务被 `tests/environment/basic-browser-page.test.mjs` 的「仅一个内联 JavaScript、禁止外部脚本」合同拦截。根因是新增的 `<script src="./listing-sku-fixture.js">`，而不是 Listing/SKU 检查算法的八项 Node 测试。
- 已将原测试场景逻辑并入 `examples/tasks/demo-form.html` 原本唯一的内联脚本，并以 `typeof document.querySelector === 'function'` 守护原 Node DOM 测试替身；新 R3 测试从实际 HTML 内联源码运行场景，移除独立重复的 `listing-sku-fixture.js`。没有放宽或删除原 `basic-browser-page` 断言。
- 此次修正需要以新的远端提交与 GitHub Actions 回执重新判定；独立组件测试不代表整个构建或 Mac Chrome 完成。
