# OpenDesk 后续 GOAL：当前电商 R2 与已废弃历史方案

> 仅供下一轮执行，当前 R1 **不实现**以下代码、不新增分支/Worktree/PR。开始时必须重新阅读最新 `AGENTS.md` 和 main HEAD；若发现并行写入冲突，保持只读并提醒，不强推、不修改其他 Agent 的工作。

> **2026-10-12 商业方向调整：**原 GOAL 1 Page QA / GOAL 3 EXP-002 的“首款商业产品”建议属于历史计划，**仅保留工厂技术验证参考，不能直接作为新的商业优先级**。现在应先执行 [电商工具宇宙唯一研究 GOAL](../../framework/prompts/goal-ecommerce-tool-universe-r1.zh-CN.md)；其他研发任务需按各自原有授权执行，Page QA 相关实验源码现已从 main 安全移除，保留历史记录；勿影响其他 Agent 的独立任务。

## 当前推荐：电商需求与商业验证 R2

请直接复制 [电商工具宇宙 R2 正式 GOAL](../../framework/prompts/goal-ecommerce-tool-universe-r2-commercial-validation.zh-CN.md)，本轮首先对齐已保存的研究文件、分析卖家与购物者真实任务、筛选有买方和合法数据源的 MVP，而不是进一步实现 Page QA。

## 历史 GOAL 1（DEPRECATED / 禁止继续执行）— Page QA 独立插件

> 此提示词仅作历史留档；不再复制到新对话继续构建、Mac Chrome 验收或发布 Page QA。通用 Extension Factory 的下轮工程需求需要另行确认真实产品价值与权限。

```text
# GOAL：OpenDesk Browser Extension Factory R2
## 目标：在不复制整套源码、不打破现有 OpenDesk 构建的前提下，
##       真正生成第一款可独立安装的 Page QA Inspector。

仓库：https://github.com/shopable-ai/opendesk-browser
只修改 main；不创建分支、Worktree 或 PR；不 force push/reset/clean。
先读 AGENTS.md 和 docs/product/browser-extension-ecosystem/
  README.zh-CN.md、extension-factory-architecture.zh-CN.md、
  product-priorities.zh-CN.md。

任务一：只读盘点实际 Manifest/WXT/Build/Pack/权限/SDK；
确认最新代码和未提交/并行改动，再制定最小受控修改范围。
任务二：实现 ProductConfig + Feature/Permission Resolver；
拒绝未知 feature、重复 ID、无用权限和运行时加载远程特权 JS。
任务三：保留原 npm run build 默认行为，新增 --product 显式构建；
独立的 Page QA Inspector 只做用户点击后当前页 DOM/a11y 检查和报告。
任务四：按产品构建独立 Manifest、静态资源图、ZIP、存储与扩展 ID；
真实双扩展并装，确保相互隔离且不继承 OpenDesk 的 <all_urls>/cookies。
任务五：Node/Check/Build/Pack、Mac 真实 Chrome 点击/撤权/重启/
异常页面/升级、发布包 hash 一致性及 CWS 政策人工审核材料。
任务六：安全回写实现状态、原始 CI/浏览器证据、README/计划和下一步缺口。
只在通过影响范围验证、安全且 main 无冲突时提交推送。
严禁只写抽象接口不接使用流程；未获 CWS 审核不能称已发布。
```

## GOAL 2 — UserScript Ecosystem R2 · 安装→更新→回滚→精选脚本市场闭环

```text
# GOAL：OpenDesk Browser UserScript Ecosystem R2
## 目标：基于已有真实 Page Installed 与可信市场 Intent，
##       完成 .user.js 安装/启停/更新差异/回滚和小规模精选脚本发行。

仓库：https://github.com/shopable-ai/opendesk-browser
只修改 main；不创建分支、Worktree 或 PR；不 force push/reset/clean。
先读 AGENTS.md、docs/product/browser-extension-ecosystem/
  userscript-ecosystem.zh-CN.md、product-priorities.zh-CN.md，
  R8 188 功能账本及 GM 方法矩阵。

任务一：审计 src/scripting/user-scripts/installed-programs.js 的 register/
getScripts/unregister/reconcile/boot，禁止重造 Page Registry。
任务二：用户选择 .user.js/React/Vue 项目，本地可信自动准备并锁
sourceHash/依赖，按网站授权安装；保留普通 JS 和零参数 Controller 边界。
任务三：来源、作者/许可证、@match/@grant/@require 与第三方依赖 UI 审核；
不同版本显示源码/权限/依赖 diff，确认后原子升级，失败回滚。
任务四：选 5-10 个实际可维护脚本做网站 Fixture + SPA/iframe/撤权/
刷新/Chrome 重启/Chrome138+ Allow User Scripts 验收；
不承诺目前尚未验证的 GM_* 完整兼容。
任务五：从现有 marketplace/intent 设计脚本发行交接，
网页只能提出有限安装意图，不得提供扩展授权或远程代码特权通道。
任务六：登记版本、失效网站、撤销和错误日志；
更新 R8 原有 ID/E01-E40 状态，不增第二执行器或第二账本。
在安全无并行冲突与同候选真实 Chrome 测试满足后提交到 main；
未通过的流程逐项写 NOT_TESTED/BLOCKED，禁止宣称全面 95+。
```

## 历史 GOAL 3（DEPRECATED / 禁止按旧优先级执行）— Commercial Discovery R2

> 下方旧 GOAL 曾把 EXP-002 Page QA 作为当前付费验证对象，现已废弃。其余领域需求需与当前电商 R2 和 EXP 台账对齐，严禁从此历史文本恢复 QA 商业立项。

~~~text
# GOAL：OpenDesk Browser Commercial Discovery R2
## 首要目标：不重复整理 188 功能和 84 个机会，直接把前三个商业假设验证成真实用户与付费/留存证据。

仓库：https://github.com/shopable-ai/opendesk-browser
只在 main 修改研究文档，不创建分支、Worktree、PR，不强推，不覆盖并行修改。
先读取 AGENTS.md 和 docs/product/browser-extension-ecosystem/ 下的
README.zh-CN.md、commercial-opportunity-framework.zh-CN.md、
monetization-unit-economics.zh-CN.md、distribution-and-validation.zh-CN.md、
commercial-experiments.json；同时继承 R8 188 功能账本与 E01–E40。

先核对最新 main 和相关工作流；不重新开发 Browser SDK 或第二执行器。
优先验证 EXP-001 企业重复工作流付费试点、
EXP-002 Page QA Inspector 自主使用及独立产品价值、
EXP-003 Research Clip & Cite 在真实任务中的重复使用。
脚本作者市场 EXP-004 先验证安装/更新/回滚安全，不预设收入。
针对买方、实际工作步骤、频次、替代方案、渠道、付款单位与维护工时，
记录可验证事实，未收款不得宣称收入，未访谈不得编造需求。
所有外部客户联系、收款或隐私数据处理需另获明确授权。
CWS 单一用途、重复内容、白标、最小权限和合法数据来源为独立否决项。
交付 GO/PIVOT/STOP、真实/缺失证据、各项 Gate 结果和下一轮产品建议；
仅在安全无并行冲突时将研究文档保存 main。
~~~
