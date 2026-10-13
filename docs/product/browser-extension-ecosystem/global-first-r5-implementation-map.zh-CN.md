# Global First R5 · TOP20 实施映射与七种真实产品入口

> **2026-10-13，工程证据映射，不是新建软件框架或第二套 OPP 账本。** 唯一 TOP20 队列存于 [原 OPP 机会主账本](opportunity-register.json) 内的 `globalFirstR5Portfolio.top20`；七类模块的实际源码和 Node 测试路径均以 GitHub main 树逐项核对存在。存在源码 ≠ 同版原生 Chrome 功能验证/可公开安装/用户收入。

## 为什么这份图存在

之前“先找第一”战略常落入两个错误：一是发现一个小功能立即写一个新浏览器框架；二是为刷 95 分投入低需求的手动 JSX 编辑。此映射要求每个候选必须指向**现有真实执行入口、哪位用户、要验收哪种结果、强对手与停止规则**。营销/业务工具不得借框架已有模块宣称自己已完整交付。

## TOP20 → 现有代码路径和最小演示

| 队列 | 真实 OPP | 推荐优先复用模块 | 用户实物任务 | 下一道真实验收 | 原 EXP |
| --- | --- | --- | --- | --- | --- |
| 1 | **OPP-059 受控网页操作按钮** | Controller Task 正式安装与 RunHost | 企业表单审批步骤核查 | 两次真实用户单独 Run 与误提交检查 | EXP-001 |
| 2 | **OPP-057 企业表单辅助** | Controller Task 正式安装与 RunHost | 企业内部字段填写与结果核查 | 企业授权模拟页面/实际审批记录 | EXP-001 |
| 3 | **OPP-015 商品 Listing 完整性清单** | 垂直业务仅复用底座，数据与规则尚需开发 | 卖家 Listing 必填字段核查 | 真实有权样本的误报/漏报及下周期自愿再用 | EXP-005 |
| 4 | **OPP-060 审批与操作审计** | 独立来源第三方库审核/共享 SHA | 工具安装前来源与变更审阅 | 同包升级、撤销许可和旧任务保守拒绝 | 无关联 EXP |
| 5 | **OPP-022 引用溯源网页剪藏** | Page USER_SCRIPT / 页面交互组件 | 网页证据与原始链接保存 | 下次打开原网址仍可找到出处 | EXP-003 |
| 6 | **OPP-025 来源证据核对** | Page USER_SCRIPT / 页面交互组件 | 引用断言与当前页面可见片段核对 | 失效文段/权限缺失标 UNKNOWN，不假造引用 | EXP-003 |
| 7 | **OPP-071 页面元标签即时审计** | Page USER_SCRIPT / 页面交互组件 | 自有网站 title/meta/canonical 检查 | 独立对照 DevTools/SEO 现成工具 | EXP-006 |
| 8 | **OPP-072 结构化数据现场检测** | Page USER_SCRIPT / 页面交互组件 | 自有页面 JSON-LD 完整性检查 | 独立对照 Rich Results/Schema 官方检查器 | EXP-006 |
| 9 | **OPP-016 SKU 表格人工导出** | 垂直业务仅复用底座，数据与规则尚需开发 | 授权后台合法 SKU 表格人工核查 | 对照官方 Export 与表格软件 | EXP-005 |
| 10 | **OPP-081 报表字段口径核对** | 垂直业务仅复用底座，数据与规则尚需开发 | 合法 CSV/表格字段口径核对 | 账期/币种/退款样本与人工解释准确性 | 无关联 EXP |
| 11 | **OPP-010 实际到手价计算器** | Side Panel「工具」内独立程序 | 明确输入税费运费的到手价计算器 | 真实公开价格字段和消费者自然第二次使用 | EXP-007 |
| 12 | **OPP-038 客户答复快捷模板** | Page USER_SCRIPT / 页面交互组件 | 客服模板在用户授权工单上的填写 | 对照 Text Blaze 的更简单模板流 | 无关联 EXP |
| 13 | **OPP-031 内容发布检查清单** | Page USER_SCRIPT / 页面交互组件 | 内容发布前可见字段检查 | 与 CMS 已有内建检查相比误漏报 | 无关联 EXP |
| 14 | **OPP-013 购物清单与规格记录** | Side Panel「工具」内独立程序 | 购物决策信息用户明确留存 | 对照 Chrome 自带书签/购物/Skills | EXP-007 |
| 15 | **OPP-073 重定向链路检查** | Page USER_SCRIPT / 页面交互组件 | 自有网站重定向链路诊断 | 对照 Requestly 和 DevTools | EXP-006 |
| 16 | **OPP-078 授权表格复制与导出** | 垂直业务仅复用底座，数据与规则尚需开发 | 官方允许的报表文件本地核对 | 只保存用户主动导出的数据，不扩展采集引擎 | 无关联 EXP |
| 17 | **OPP-027 提示词与输出版本比较** | Side Panel「工具」内独立程序 | 本地模型响应版本比较 | 对照模型官方历史/第三方剪藏，数据处理许可 | 无关联 EXP |
| 18 | **OPP-061 敏感字段发送提醒** | 独立来源第三方库审核/共享 SHA | 高风险字段操作的权限说明 | 不读取密钥/密码，误报与正确阻断案例 | 无关联 EXP |
| 19 | **OPP-082 定时审计报告** | 安装后的有限定时任务 | 已安装例行核查与恢复 | 长期无 Host/权限变化/过期测试逐项真实执行 | 无关联 EXP |
| 20 | **OPP-063 企业签名工具包投放** | Cloud Control 已安装 Task 按版本审批 | 客户批准的固定版本私有工具 | 企业授权、来源真实性及回滚; 不创建第二云 Runner | 无关联 EXP |

原 Top20 顺序是研究优先级，不等于世界排名或实际市场规模；这里的类型只是**建议走哪条既有代码和产品入口**，不代表该业务小工具已经安装或打包。EXPs 的真实阶段、所有者、用户与付费信息以 [原商业实验账本](commercial-experiments.json) 为准。

## 七类产品入口：已有真实源码，哪些可用、哪些尚不算验收

### Controller Task 正式安装与 RunHost（controller）

**已定位的源码（实际仓库存在，不推断当前用户 Mac 已实测）**
- [`src/ui/workflow/workflow-view.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/ui/workflow/workflow-view.js)
- [`src/ui/task-workbench.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/ui/task-workbench.js)
- [`src/ui/local-project-install.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/ui/local-project-install.js)
- [`src/platform/tasks/contract.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/platform/tasks/contract.js)
- [`src/platform/tasks/service.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/platform/tasks/service.js)

**已有可复用的组件合约**
- `node --test tests/environment/workflow-r15.test.mjs`
- `node --test tests/environment/task-package-flow.test.mjs`
- `node --test tests/environment/local-project-install-r251.test.mjs`

**使用方式**：在当前合法网页 Side Panel「工作流」提出需求、审核步骤/参数 → Save Revision → 原 Task Candidate → 真实 Run/Verify → Available → Installed →「我的任务」重复 Run

**真实证据等级**：`SOURCE_PRESENT_COMPONENT_EVIDENCE_NATIVE_FULL_CHAIN_NOT_TESTED`。

**安全边界与最小问题**：错误/未知网页副作用不得自动重复提交；模型草稿或保存Revision不能跳过正式验证

### Page USER_SCRIPT / 页面交互组件（page）

**已定位的源码（实际仓库存在，不推断当前用户 Mac 已实测）**
- [`src/ui/page-program-library.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/ui/page-program-library.js)
- [`src/scripting/user-scripts/installed-programs.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/scripting/user-scripts/installed-programs.js)
- [`src/scripting/user-scripts/page-install-authorization.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/scripting/user-scripts/page-install-authorization.js)
- [`src/ui/local-project-install.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/ui/local-project-install.js)

**已有可复用的组件合约**
- `node --test tests/environment/page-program-library.test.mjs`
- `node --test tests/environment/page-program-package.test.mjs`
- `node --test tests/environment/local-project-install-r251.test.mjs`

**使用方式**：AI 或用户准备 Page JS/UI 候选 → 审核被允许的站点与依赖 → 在真实网页试运行 → 原 Page Verify/Available/Installed →「工具」找回、启停

**真实证据等级**：`SOURCE_PRESENT_SELECTED_OLD_NATIVE_NATIVE_FULL_CHAIN_NOT_TESTED`。

**安全边界与最小问题**：Page world 不拥有 Controller page/params；React/Vue 的构建入口与 Standard/Developer/Native 依实际版本

### Side Panel「工具」内独立程序（tools）

**已定位的源码（实际仓库存在，不推断当前用户 Mac 已实测）**
- [`src/ui/sidebar-tools.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/ui/sidebar-tools.js)
- [`src/ui/sidebar-tools/installation.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/ui/sidebar-tools/installation.js)
- [`src/ui/sidebar-tools/package.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/ui/sidebar-tools/package.js)

**已有可复用的组件合约**
- `node --test tests/environment/sidebar-tools.test.mjs`
- `node --test tests/environment/sidebar-tools-host.test.mjs`

**使用方式**：独立工具官方 Catalog/已安装列表 → 明确安装/授权 → Tool Tab 或完整工具页输入本地数据 → 用户主动操作 → 关闭/撤权

**真实证据等级**：`GENERAL_TOOL_FRAMEWORK_SOURCE_PRESENT_INDUSTRY_TOOL_NOT_IMPLEMENTED`。

**安全边界与最小问题**：独立业务产品规则未实施时不得宣称已在 Tool Tab 提供，下载数据处理需单独合法授权

### 安装后的有限定时任务（schedule）

**已定位的源码（实际仓库存在，不推断当前用户 Mac 已实测）**
- [`src/ui/scheduled-task-workbench.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/ui/scheduled-task-workbench.js)
- [`src/ui/scheduled-task-host.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/ui/scheduled-task-host.js)
- [`src/platform/tasks/schedule-service.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/platform/tasks/schedule-service.js)

**已有可复用的组件合约**
- `node --test tests/environment/scheduled-tasks-r1.test.mjs`
- `node --test tests/environment/scheduled-task-ui-r1.test.mjs`

**使用方式**：已正式安装固定 Task → 用户设置具体时区/条件/目标网页/授权 → 到期由原 Scheduler FireId 触发原 RunHost → 查看 Run/Result 与未触发理由

**真实证据等级**：`SOURCE_AND_HISTORICAL_CHROME_PARTIAL_NATIVE_RECOVERY_NOT_TESTED`。

**安全边界与最小问题**：无 Host/浏览器关闭/权限变化不能冒充永久后台运行；FireId 和外站副作用须可检查

### Cloud Control 已安装 Task 按版本审批（cloud）

**已定位的源码（实际仓库存在，不推断当前用户 Mac 已实测）**
- [`src/cloud-control/service.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/cloud-control/service.js)
- [`src/ui/cloud-control-console.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/ui/cloud-control-console.js)
- [`src/platform/tasks/service.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/platform/tasks/service.js)

**已有可复用的组件合约**
- `node --test tests/cloud-control/generic-delivery.test.mjs`
- `node --test tests/cloud-control/approval-pin-contract.test.mjs`

**使用方式**：本地真安装 Task → 按版本/网站/参数/结果许可审批 → Provider 仅投递已批准任务 → 原 Authority/RunHost → 持久结果

**真实证据等级**：`COMPONENTS_AND_FIXED_IDENTITY_PRESENT_MULTI_TASK_NATIVE_LONG_RUN_NOT_TESTED`。

**安全边界与最小问题**：云端投递不能绕过本地授权、Host 占用和实际客户端可用条件

### 独立来源第三方库审核/共享 SHA（deps）

**已定位的源码（实际仓库存在，不推断当前用户 Mac 已实测）**
- [`src/scripting/user-scripts/dependency-manager.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/scripting/user-scripts/dependency-manager.js)
- [`src/scripting/user-scripts/installed-programs.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/scripting/user-scripts/installed-programs.js)
- [`src/ui/page-dependency-install.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/ui/page-dependency-install.js)

**已有可复用的组件合约**
- `node --test tests/environment/page-program-package.test.mjs`
- `node --test tests/environment/page-program-library.test.mjs`

**使用方式**：先检查来源、代码和许可证 → 用户批准 HTTPS 下载与 SHA → 每程序独立审查/锁定 → 复用固定字节而不继承另一程序的许可

**真实证据等级**：`R7_1_COMPONENT_VERIFIED_REAL_NEW_EXTERNAL_LIBRARY_CHROME_NOT_TESTED`。

**安全边界与最小问题**：缓存复用不是自动授权；JS USER_SCRIPT 不等同 Controller ESM 或 npm 任意包

### 垂直业务仅复用底座，数据与规则尚需开发（business）

**已定位的源码（实际仓库存在，不推断当前用户 Mac 已实测）**
- [`src/ui/sidebar-tools.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/ui/sidebar-tools.js)
- [`src/ui/workflow/workflow-view.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/ui/workflow/workflow-view.js)
- [`src/platform/tasks/contract.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/src/platform/tasks/contract.js)

**已有可复用的组件合约**
- `node --test tests/environment/task-package-flow.test.mjs`
- `node --test tests/environment/sidebar-tools.test.mjs`

**使用方式**：实际拥有权限的用户给出重复问题 → 合法测试/官方导出 → 确定性规则与人工核对 → 单个 Tool/Task 受控交付 → 下一周期自然复用

**真实证据等级**：`BUSINESS_MVP_RESEARCH_NOT_IMPLEMENTED_NO_CUSTOMER_PROOF`。

**安全边界与最小问题**：禁用未经授权网页采集、未经确认的财务解释、未核实的商业广告；行业规则不属于框架已实现


## AI 用户的一条可理解、可以复测的流程

1. 用户想要“每周审核一次合法后台的必填字段”，不要求写代码。Side Panel「工作流」提交自然语言需求，选择真正可用的 AI 服务/本地 Codex，并确认可发送的数据。
2. AI 返回有限动作/参数，不直接提升系统权限；用户可阅读这些操作、目标页面、模型请求和具体可执行源码。若只能拿到文字草案，就明示并停止，不把人工复制接力宣传为自动闭环。
3. 点击保存固定版本，得到真实 `sourceHash`；用户在自己的合法站点明确运行以取得真正 Chrome `runId/resultId`，原 Authority/RunHost 验证页面与 Worker 结束。失败不能偷偷重新提交。
4. **这里是目前最重要缺口**：原 Task 目录用同一来源真实 Run 收据完成 `Candidate→Verified→Available→Installed`，拥有安装身份、版本、网站范围、参数和主动授权。Page USER_SCRIPT/UI 通过自己的验证系统，不能冒用 Task Controller 的运行世界。
5. 关闭 AI Provider/Codex/开发目录，在「我的任务」中选择**已安装版本**两次独立 Run，获得两个不同的真实结果；人工不再重复给模型提示词。若模型请求无法实际追踪，记 UNKNOWN，不能编造0次。
6. 检查撤权/站点变化/版本升级/Stop/失败保护。外部网站已有副作用不会因 Stop 被回滚。记录首次模型费、配置/审核/安装分钟数、重复20次实际费用和自然7日再用。
7. 与 Chrome Skills/Claude 录制、Axiom、UiPath 和 ScriptCat 等**自然用户流程**比较，不能拿 OpenDesk 完整工具与对手单个 SDK API 比；无法亲测的竞品为 NOT_TESTED。

**首次可向外发布的证据**不是“某模块测试 95 分”，而是可信同包场景录像/原始回执、完整身份、真实用户二次独立使用、最强反例的相同成本与风险说明。随后才开展地区/行业第一的申请。

## 结构化工程质量与具体测试

- 当前产品复用已存在对应 Node 契约；`tests/environment/global-first-r5-product-evidence.test.mjs` 直接调用真实 Task Package 和 WorkflowCompiler（非复制实现），`tests/environment/global-first-r5-benchmark.test.mjs` 防止把不完整结果计算成世界排名。
- [独立公平实验计划](../../framework/workstreams/evidence/global-first-r5-20261013/benchmark-contract.json) 包括 5 次首次使用、20 次重复、3 次撤权、3 次恢复、2 次版本、2 次自然再用；实际测量、版本日期和结果均没有伪造。
- 不改已有 Task/SDK/RunHost/Browser Native 等共享实现；它们正由其它专职工作流推进，交叉源修改需要唯一原负责者核对资源/测试。
- 行业产品 OPP-015/016/081、OPP-031 等复用源码只是技术可能性，**垂直规则、合法数据处理、最终 UI、发行和商业证据未实现或未核实**；不能把它当成已经上架 20 款工具。
- R4 GF-013/014 世界首创已 DISPROVED；GF-007 广义 AI 重复运行也有强反例，当前 0 项正式第一称号。全部质量维度缺独立完整验收均 NOT_SCORED。

## 当前下一次代码变更优先级（不要求再开第二运行框架）

**如果 AI→真实 Installed 同版阻断来自已有 UI**：优先由 Task/AI 所属负责人修复必要一步的状态引导和原始回执透传；不要新建“自动安装”的非可信快捷方式。

**如果 AI 真实工具还不能进入指定云端对话**：先登记实际账号和模型工具权限阻断，允许本机 Codex 路径独立作为一个可交付入口，但不能降格成每次人工读写/复制发送的“自动”产品。

**如果同版安装可运行但普通用户不会完成首次使用**：优先优化授权文案、状态可见性、错误恢复和一步合法 demo 的入口，再考虑新增 84 个机会中的功能。

**如果业务需求不成立**：先测其它现成 20 项而不是同时开发；一个渠道/客户中至少要观察自然第二次使用，才值得延伸行业包。

**如果竞争端已经能用原生功能更便宜完成**：记录对手最佳方案及退出规则，不为争“第一”制造极小细分赛道。
