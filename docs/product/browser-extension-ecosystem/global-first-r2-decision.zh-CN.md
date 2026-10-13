# OpenDesk Browser · Global First R2 产品决策（先读这份）
> 2026-10-13。定位与工程决策，不是“全球第一”审批、正式版本发布或当前主线完整原生验收。本页聚焦有价值的用户任务，而非制造过窄赛道。完整原始来源见同目录两份 JSON，工程身份见 [R2 工作流](../../framework/workstreams/global-first-r2-20261013.md)。

## 结论：先做成一个看得见的领先体验，再申请“第一”

**现在可以证明的全球首个 / 全球第一：0。** 从 14 项原有 GF 声明中，优先 **F01 → F02 → F04**；GF-013（AI/MCP 用户脚本管理器首创）与 GF-014（多文件 React/Vue 用户脚本工具首创）已有反例，继续禁用。最适合现阶段的公开定位是：

> **Build Browser Apps, Not Just Userscripts.**  
> **不只是运行用户脚本，更是在浏览器中开发工具。**

这是一句**产品定位**，不是世界排名。不要说“零配置”“所有网页”“最安全”或把内测 Developer 直接写成已上架版。

| 排名 | 要帮用户完成的任务 | 现有证据 | 真正缺少什么 | 退出条件 |
| --- | --- | --- | --- | --- |
| 1 · F01 / GF-001 | 在 Chrome 侧栏写 React JSX 或 Vue SFC → 当前网页交互 → 修改 → Stop 清理 | 历史 macOS Chrome 的双框架交互、错误恢复和受管 Stop | 固定、**公众可获取**的 Developer 发行包；本版本原生演示；全球更早等价产品排他性核查 | 发现更早已公开的同等全链体验，则撤回首创候选，改做具体便利/可靠性优势 |
| 2 · F02 / GF-002 | 修改本地 3–5 文件项目 → 无需重打包主扩展 → 明确 Run 网页 | 旧版 40 次 Chrome Run/Stop、独立 CLI 四目录自动编译 | OpenDesk 与 Vite+Tampermonkey、Vite+ScriptCat、WXT 的**冷启动/热修改**同条件原始计时 | 若冷启动明显落后且热修改无法弥补，不宣传“最低配置/最快”，只保留功能价值 |
| 3 · F04 / GF-004 | 知道运行的源码、依赖、授权、版本、结果身份，以及 Stop 范围 | 已有独立锁、SHA、回执组件 | 同一最新包的批准→运行→撤权→Stop→更新端到端原生数据 | 仅能证明局部组件，不得宣传“全球最安全” |

## 1. F01 的产品定义：让开发者第一次成功，不要再造编译器

**面向用户：** 希望把 React/Vue 交互工具直接装在当前网页中的脚本作者、前端开发者、AI 生成代码用户。用户最关心的是“输入源码后网站出现了什么”，不是 Worker 的存在。

**真实最短路径：** 安装明确标记的 Developer Edition → 开启 Chrome 允许用户脚本和网站访问 → Side Panel「开发 → 直接编辑 → React JSX / Vue SFC」→ 输入或选择源码 → 明确 Run → 网页真实按钮从 0 变 1 → 修改一行再次 Run → Stop 后 DOM/样式/监听器按受管范围清理。**Standard 不提供浏览器端原始 JSX/SFC 编译**；它仍可运行 JS 与准备好的组件，不应伪装同等入口。

**最小产品改进按顺序：**
1. **可用版本**：固定 Developer 包及独立扩展身份、README 下载/侧载说明、packageHash、ZIP SHA、公开可获得时间；正式商店状态未证实时明确标「开发者测试版」。
2. **第一次成功**：沿现有 Side Panel 显示站点许可、Allow User Scripts 状态与失败恢复提示。优先修掉实测阻断；不另建页面、不改 Chrome 最小权限边界。
3. **可看见运行链**：复用当前结果面板显示真实 sourceHash、previewId、documentId、组件交互结果及 Stop 回执；“Stop”仅撤销受管 UI，不回滚已发生的网站业务操作。
4. **重复运行可靠性**：真实 React Hooks / Vue ref / scoped CSS、语法错误修复、重复 Run/Stop、导航、撤权、强 CSP 等按当前包输入身份验收；旧候选 PASS 不自动晋级。
5. **可复现的 60–90 秒视频**：真实 Side Panel + 网页同屏录制，显示首次授权、React、Vue、再次运行和 Stop，不使用静态伪界面。

**不能忽略的对手**：ScriptCat、Tampermonkey 编辑器与 Editors、本地 Vite + 用户脚本管理器、Violentmonkey，以及 [Web Dev Kit](https://chromewebstore.google.com/detail/web-dev-kit/bmgkdkjlpgijlgiklgkeohlnmbamocge)（侧栏实时编辑/React JSX、Vue SFC **导出**）和 [Codelifter](https://chromewebstore.google.com/detail/codelifter-%E2%80%94-dom-to-react/mdagokiboipnoneleiihfdbmhaojcbgl)（网站元素导出到框架）。**导出组件不等于将原始 JSX/SFC 直接编译运行并受管 Stop；但也不能凭这个区别直接宣布世界首创。** 必须按同一用户任务检查可替代流程与更早公开日期。

**证据身份**：[浏览器端 JSX/SFC 原生案例（历史）](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847)，提交 `9cdb3bf98fe410b88c456801855e2635f6b1a7b0`；[R24.5 双版 Mac Chrome（历史）](https://github.com/shopable-ai/opendesk-browser/actions/runs/38247467657)，提交 `176bb1916006ad98bb3d1b10c1b2f2d93a06d122`。这两者均不是最新 main 的完整发行认可。

## 2. F02 的产品定义：比“零配置”更真实的重复开发优势

**面向用户：** 已经在 Node/编辑器中维护 JS/JSX/Vue 多文件工具、反复改代码并需要在已授权网页上使用的人。首次 Native 配对、Node 安装、网站授权必须如实计入成本，不能用“无需编译主扩展”冒充“无需任何编译”。

**用户任务：** 从 `examples/programs/local-page-ui/` 的 `src/model.js` 修改一次可见文案；保存→自动准备→在真实 Side Panel 主动 Run → UI 内容更新→Stop。再用 `page-ui-react/`、`page-ui-vue/` 进行同流程的 JSX/SFC 自动准备，另以 `local-controller/` 验证新的 sourceHash 与持久结果隔离。Controller 的 JSON 返回不是 Page UI 挂载证据。

**应该争夺的可测指标**：冷启动首次完成总分钟数；第一次 Run 所需人工动作；热修改到网页可见的毫秒数；错误恢复成本；能否固定源码版本并再次安装。基准对象为 OpenDesk、vite-plugin-monkey + Tampermonkey、vite-plugin-monkey + ScriptCat Stable、WXT；对每个对象允许其使用最自然、能达成同一任务的工作流。

**当前计时：NOT_TESTED；“最快”宣传：禁止。** 已有 [40 次旧版 Chrome Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890) 与 [独立安装 CLI 编译](https://github.com/shopable-ai/opendesk-browser/actions/runs/38231722128)，它们证明功能切片，不证明竞争效率。测试样本及空白原始数据在 [R2 工作流](../../framework/workstreams/global-first-r2-20261013.md) 中。

## 3. F04 是信任卖点，不是先抢安全排名

把依赖 SHA、用户批准的站点范围、实际 revision/sourceHash、Chrome 真实回执、受管 Stop 及撤权视为**可向开发者解释的运行链**。这些细节可以做技术博客与开发者信任页；在所有相关版本和反例验证前，不使用“世界最安全”或“100% 可撤销”。无需另造 Browser SDK、依赖管理、调度器或 RunHost。

## 4. 下一轮只做四件事（最短闭环）

| 顺序 | 工作所有者边界 | 必须输出 | 完成/停止判断 |
| --- | --- | --- | --- |
| P0 | R24.5 / 发布责任工作流；本轮只核对证据 | 一个公众能取得的 Developer 包、实际身份及官方发布日期 | 没有可获取的版本，不申请 F01 首创 |
| P0 | F01 独立 Demo/验收；不碰编译器实现 | 原 Side Panel 的 React、Vue、改动、Stop 原始录屏 + hash/previewId/包身份 | 真实网页交互与清理不全，则修最小缺陷 |
| P1 | F02 独立基准记录；Native/Node Owner 保持独占 | 4 个工作流 × 冷、热、恢复原始数据和环境记录 | 计时缺失绝不产生“效率第一” |
| P1 | 竞争/营销 Owner | 已核实竞品发布日期、世界首创反证、GF 状态与中英文合规说明 | GF 账本未为 CLAIM_APPROVED，则对外不写任何全球第一 |

必须显式区分 **PRODUCT_VERIFIED / COMPETITOR_REVIEWED / CLAIM_APPROVED**。评审前用户价值需要通过真实开发者试用来确认；目前**无真实留存、付费和新手成功率数据**。

## 5. 你应该阅读什么

- **产品负责人：只阅读本文件**。它回答选择哪条赛道、缺什么、做什么、何时退出。
- **工程验收负责人：再读 [Global First R2 工作流](../../framework/workstreams/global-first-r2-20261013.md)**，里面是测试输入、已有原生案例和下一次的原始记录方式。
- **对外传播负责人：最后读 [营销执行手册](marketing-playbook.zh-CN.md)**，其中区分今天可使用的定位和未审批排名。
- **JSON 无需逐字阅读**：[竞品时间账本](competitor-timeline.json)与[14 条 GF 审批账本](first-claims-ledger.json)只是事实来源与机器审批记录。旧 R1 总研究文件作为历史参考保留。

**不要阅读旧 R2 ZIP 内的临时评分生成器、40 KB 重复解释、模拟 Bench 空成绩当成解决方案；本轮没有把它们原样提交。**
