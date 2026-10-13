# Global First R2 · 真实研究与原生验证工作流（2026-10-13）

## R4 AI 优先纠偏（覆盖下文旧 F01 市场优先级）

当前执行 [R4 AI 优先 Top 5 GOAL](../prompts/goal-global-first-r4-ai-first-niche-leadership.zh-CN.md)；[读者一页决策](../../product/browser-extension-ecosystem/global-first-r2-decision.zh-CN.md)。旧 R3 手动 JSX/Vue 编辑任务已在原 GOAL 标 SUPERSEDED_FOR_MARKETING，不删除历史证据。战略排序 GF-007→GF-004→GF-003→GF-002/GF-011→GF-009；均为未证明的争夺目标。R4 Chrome/排名/销售实证 NOT_TESTED，所有绝对排名获批 0。下文 R2 进度是原始历史状态。
> 任务归属：竞争研究 / 独立 F01-F02 验证；仅写独占文档及原始实验文件。唯一可写分支 main，不创建 PR / worktree，不覆盖并行 R24/R25、Native、SDK、依赖、Cloud 工作流。

## 历史 R3/F01 工程专项入口（已被 R4 竞争策略取代）

**历史工程 GOAL、非当前营销主线：** [F01 Developer 版本首次成功体验与真实 Chrome 证据](../prompts/goal-global-first-r3-f01-product-proof.zh-CN.md)。读者只需先看 [一页产品决策](../../product/browser-extension-ecosystem/global-first-r2-decision.zh-CN.md)，随后进入执行 GOAL。本工作流余下部分保存 R2 历史证据及未测试项，不代表 R3 已执行成功。

**当前记录状态：** R3 GOAL 已制定，R3 原生测试、Developer 新包公开发行、全球排他性研究与独立质量评分尚未因文档变化而自动完成。最新 SHA 必须由执行者在实际 Mac 工作目录中核查。任何 95+ 是目标不是当前事实。

## 本轮交付与证据等级

- GitHub 远端只读基线在研究中依次经过 `de52893a69d5107b4d60f837c9e570d7298ac588`、`5514f58715ab4ea77f17d64cd3c4056e3595ff73`，最终应用提交以实际 parent SHA 为准；**不能访问用户 Mac 的 git status、Chrome Profile、Native/Node 安装状态**。
- R1 现有 16 个竞品和 14 个 GF ID 原位保留；本轮补充 Stagehand、Midscene、Web Dev Kit、Codelifter 作为独立对象，计 20 个；版本/渠道来源分别在 competitor-timeline.json，不以 GitHub pushed_at 冒充 Release。
- R1 四份正式文档继续是唯一账本，新增 [给人看的单份 R2 决策](../../product/browser-extension-ecosystem/global-first-r2-decision.zh-CN.md)；不成立的 GF-013/014 维持 DISPROVED，**CLAIM_APPROVED = 0**。
- 不修改 `src/`、`native-agent/`、`examples/programs/**/src`、`tests/framework` 的任何运行时或测试原驱动。也未重新运行真实 Chrome。文档核查和 JSON 约束校验不能标作 Chrome PASS。

### 已有真实但仅限历史候选的证明

| 内容 | CI / SHA | 能证明 | 不能证明 |
| --- | --- | --- | --- |
| F01 无 Native 浏览器编辑 React JSX / Vue SFC → 点击交互 → Stop | [38225425847](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847), `9cdb3bf98fe410b88c456801855e2635f6b1a7b0` | 该候选的原生功能切片 | 今天可获得版或世界首创 |
| R24.5 Standard/Developer Chrome 真实版间差异、交互、错误修复、Stop | [38247467657](https://github.com/shopable-ai/opendesk-browser/actions/runs/38247467657), `176bb1916006ad98bb3d1b10c1b2f2d93a06d122` | 已固定双包候选 | 当前 main F3 / ZIP 全验收 |
| F02 React/Vue 各 20 次独立本地项目 Run/Stop | [38155034890](https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890), `1e532a8ba85131d10f666631e6b80a83b1146d75` | 历史 Native Chrome 循环 | 与 Vite 工具链效率排名 |
| 四项目独立 npm tarball 编译与修改后输入变更 | [38231722128](https://github.com/shopable-ai/opendesk-browser/actions/runs/38231722128), `8fe99dc853961b434c238bc68c1d25c3a8062b08` | 安装的 Node CLI 真实自动编译 | 浏览器同包 Native 结果 |

## 历史 F01/F02 工程验收方法（仅专项复用）

1. 在用户 Mac 的独占窗口核查 `git status`、`HEAD`、远端、其他 Agent CFT/profile/43111/dist 归属；若冲突先只读并交接，不通过另开分支规避。
2. 统一网页 `http://127.0.0.1:43111/demo-form.html`；服务由现有 `examples/tasks` 启动，确保没有占用别人的端口。固定受控 CFT 版本、实际 extension ID、packageHash、ZIP SHA、站点授权和 Allow User Scripts。
3. F01 用 **现有** `tests/framework/page-browser-worker-r243-cft.mjs` / R24.5 双版 CFT 测试：真实 Side Panel 输入 React/Vue，真实 Chrome 指针点击按钮，修复编译错误、修改再 Run、Stop；录制原生 sourceHash/previewId/documentId 和 DOM 清理。Standard 应无浏览器 JSX/SFC 直接编辑。
4. F02 用现有 `tests/framework/local-dev-native-acceptance.mjs` 和 `examples/programs/local-page-ui/`、`page-ui-react/`、`page-ui-vue/`、`local-controller/`。`page-framework-r243-loop-native.mjs` 只是导出 helper，**不可直接当 Node CLI 测试执行**。保存改变源码但不自动执行网页；必须主动 Run，并比较 sourceHash。
5. 对照组：OpenDesk；vite-plugin-monkey + Tampermonkey；vite-plugin-monkey + ScriptCat Stable；WXT。按同任务、同机器/Chrome、同网络/权限，分别做冷启动 5 次、热修改 10 次、恢复 3 次（实际可行时），保留每次原始毫秒、人工步骤、外部依赖、错误、录屏。对手使用自然可行流程，不能强制对手使用 OpenDesk 特有 UI。
6. 原始样本从 [未填成绩的 JSON 模板](evidence/global-first-r2-20261013/benchmark-template.json) 复制成新独立报告；`trials=[]` 和 `NOT_TESTED` 不是 0ms 或 FAIL。只在完整样本后计算每任务中位数/分布，并公开局限。现场受保护、CDP 不伪造 JS 执行或用户点击。

## 阻断与移交

- **F01**：Developer 公众实际可获得时间/稳定 ID、最新主线 CFT 完整版本证据、其他浏览器侧栏历史排他性检查：NOT_TESTED。
- **F02**：同设备、同任务冷/热/恢复竞品原始数据：NOT_TESTED。
- **F04**：依赖、版本、来源身份、网站权限、撤销、Stop 同候选 Chrome 完整链：NOT_TESTED。
- 当前与用户 Mac 本地 Git status/未提交并行工作不能互相证明：LOCAL_NOT_INSPECTED。
- 如源代码失败确需改动，先向相应 R24/R25/Native 工作流交接并核对所有权，不在本竞争研究中实现第二套编译器/Runner。
