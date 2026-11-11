# AI Insight R5 · 差量交付与验收记录

任务：`OD-AI-INSIGHT-PROBLEM-OBSERVATION-PREVIEW-R5`。依据：`projects/ai-insight/docs/product-research.zh-CN.md`，只做设计合同、纯模型、模拟预览和定向验证，不接入正式采集。

## 本轮实际完成与状态

| 范围 | 状态 | 严格证据 |
| --- | --- | --- |
| T01 仓库复核 | **DONE_VERIFIED（GitHub）/ BLOCKED（本机）** | 已读当前 main、AGENTS、目录归属、Time Review、预览体系及 R4 迁移；本机 CodexPro UNAVAILABLE，不能核查 Mac 未提交变更 |
| T02 Schema 与对象关系 | **PARTIAL** | 19 个 JSON Schema 对象定义、Event、Consent、纯模型、24 个 Node 测试用例、非私密 fixture 已写；完整 JSON Schema Validator、生产持久化/Schema 迁移未跑 |
| T03 长任务与并行模型 | **PARTIAL** | 已写状态机、幂等去重、40+25/重叠25、60 分钟模拟、缺口/删失测试；两家真实站点的完整状态适配与真实长任务验证未做 |
| T04 PC/Side Panel/网页轻提示预览 | **PREVIEW_SOURCE_READY / BROWSER_NOT_TESTED** | `preview/index.html` + `preview/preview.js`，共享 `src/insight-core.js`；含关联、拒绝、拆分、撤销、证据、授权与数据场景；尚无真实 Chrome 逐按钮读回 |
| T05 Codex/Chrome | **BLOCKED / NOT_TESTED** | CodexPro 返回 UNAVAILABLE；OpenDesk 文件桥与 Browser Core 返回 Session terminated；未接触用户私人站点、未启动原生 Chrome 或 Codex |

## 可复核的本轮检查

- 纯计算核心、关联与权限：在 GitHub 读回后，于连接器 **V8 隔离运行环境**执行 21 项断言，21 PASS / 0 FAIL；涵盖跨对话关联、误合并撤销、父子、重复事件、再生成、30/60 分钟缺口、40+25 并行、撤权、删除、模拟 UI 脚本语法及静态控件存在。**这不是本机 Node 测试或真实浏览器交互测试。**
- 后续最小修复：授权 `consentRevision` 纳入幂等键；删除 Problem 后清理无其他有效 Problem 引用的 Conversation；兼容严格 Event `eventType` + `observedAt` 形态。修复已入 main，需新候选复验。
- Node 测试文件实际共 **24 个 `test()` 场景**；尚无真实 Node exit code，不报 `NODE_PASS`。
- 预览 HTML 及 JS 均从 GitHub 读回检查，脚本可通过 JavaScript 语法解析；未运行真实 DOM、360px、键盘、对话框和黑暗主题的浏览器证据。
- 本阶段没有生成任何 Mac Chrome 截图、浏览器录屏、真实 AI 页面观察数据、正式安装包或生产业务程序。

## 运行命令与恢复步骤

使用本机正确仓库、现有 `main`，首先运行 `git rev-parse HEAD` 与 `git status --short`；必须保留无关未提交改动和其他 Agent writer，不覆盖。
 
1. 验证领域测试：`node --test projects/ai-insight/tests/insight-contract.test.mjs`；记录 Node 版本、SHA、完整退出码，遇 FAIL 定向修复。
2. 启动仓库内一个只读静态预览：`python3 -m http.server 8765 --bind 127.0.0.1`，访问 `http://127.0.0.1:8765/projects/ai-insight/preview/index.html`。**不需要加载正式扩展**。
3. PC：先确认主问题 2 段对话，点击“确认关联 Claude B”，检查变成 3 对话/2 平台、累计 65 分钟、并集 40 分钟；撤销后变成 2 对话、累计 40 分钟。拒绝 Gemini 相似候选，检查没有误合并。
4. 侧栏：同一演示状态下拆分对话 C、切换 PC、查看新 Problem ID 与派生统计；切到成果界面，先确认用户成果仍无测试证据，再点击“记录模拟测试通过”核对清晰 DEMO 标记。网页提示只展示轻层，不自动提交 AI 请求。
5. 异常与隐私：模拟无数据、部分覆盖、观察错误、隐私关闭，逐站点撤权后验证 `OBSERVE_EVENT` 被拒；删除问题后确认关联、独占派生统计和无其他引用的对话元数据清除。
6. 视觉/可访问性：1280px、360px 宽度及深浅模式；Tab、Enter、Escape、弹窗焦点返回、滚动、禁用按钮与错误提示。保存同候选截图与实际点击 DOM 状态读回，缺失的项标 NOT_TESTED。
7. **只有在另行获得明确真实 AI 站点授权后**，才分别对至少两个指定 Origin 的 DOM 提交、首次输出、完成与再生成观察做实站测试；不发送私人 AI 请求、不读取历史正文、不绕过登录。

报告截图应存原项目已有证据习惯的位置并记录完整源码 SHA、Chrome 版本、Profile 和观察的实际 URL；`PREVIEW_PASS` 与 `CHROME_PASS` 必须分开。没有得到截图/DOM 回执不得写 PASS。

## 八视角模拟专家审查（非真实外部专家）

| 视角 | 评分 /100 | 主要扣分与上线阻塞 |
| --- | ---: | --- |
| 用户研究 | 95 | 用户恢复收益、误关联成本尚无实际用户样本 |
| 产品战略 | 96 | MVP 取舍清楚，但北极星未经过市场验证 |
| Agent / Workflow | 94 | 多 Provider 生产适配与 UNKNOWN 恢复未实证 |
| 数据分析 | 94 | 口径审慎；完整 JSON Schema 合规验证与跨设备时钟缺证据 |
| Chrome 架构 | 92 | 未审验真实运行、安装身份与权限链 |
| 隐私安全 | 94 | 默认拒绝正确，但撤权/删除仅在模拟域测试 |
| UX 交互 | 93 | 有完整可点击源码，缺浏览器实操、键盘和窄屏读回 |
| 商业化增长 | 90 | 留存、付费意愿与效果改善全部尚未验证 |

**算术平均：93.5 /100**（748÷8）。属于模型模拟的候选审查，未达 95，不是上线批准、真实用户反馈或外部专家结论。评分不能抵消 Node 与原生 Chrome 未测。

## 下一轮唯一优先动作

**先执行本机 Codex 的 20 项 Node 测试及真实静态预览交互验收，修复真实失败。** 通过后，再做两个经明确授权 AI 站点的有限观察探针；两站实证、正式授权撤权与数据删除前，**不直接进入完整生产采集开发**。不得重新做 R4 16 领域研究，不复制本合同、Time Review 计时器、Knowledge Inbox 或 WebFlow 引擎。


## R5 验收记录更正（同一候选，未执行本机 Codex）

- GitHub 读回后于连接器 V8 隔离环境运行旧版完整 Node 测试的实际断言（注入 Node `URL/readFileSync/assert` 的最小测试适配）：**22/22 PASS**。该结果不是 Node.js 的 `node:test` 命令回执。
- 又补充 **2 项测试源码**（删除共享记录保护、拒绝无效观察事件），当前文件共 **24 项**；本机 Node 跑测与正式 Schema Validator 均仍 `BLOCKED/NOT_TESTED`。其他独立 V8 合同检查 21/21 PASS 是不同检测集，不应加总冒充 Node 测试数量。
- 预览网页轻提示明确标注 AI 状态未知（模拟），避免从提示外观推断真实请求完成。
