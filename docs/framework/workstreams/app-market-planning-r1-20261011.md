# OpenDesk 应用市场 R1：规划与原型交付记录

日期：2026-10-11。任务：基于已有 TOC、笔记、Markdown 和自动化能力，设计统一应用市场、功能树、安装需求与交互原型。

## 范围与身份

- 源码审计基线：`main@f5550d608d3cc512d5620c0d1d32f03ec9d63c61`。
- 已发现可见本地旧副本落后远端，因此关键结论通过 GitHub 对固定远端 SHA 读取；没有用旧副本推断最新工具能力。
- 本轮只新增方案、目录元数据示例、原型和本工作记录，不修改生产安装器、能力白名单、运行器或现有测试产物。
- 所有仓库变更只集成到 main；保留并行提交，不创建分支、worktree，不强推或改写现有文件。
- 主方案：[app-market-r1.zh-CN.md](../../product/app-market-r1.zh-CN.md)。
- 目录提案：[app-market-r1.catalog-example.json](../../product/app-market-r1.catalog-example.json)。
- 原型：[app-market-r1.html](../../../prototypes/marketplace/app-market-r1.html)。

## 核实的关键事实

| 事项 | 证据与结论 |
| --- | --- |
| 四个已有工具包 | 读取对应 `examples/sidebar-tools/<id>/tool.config.json`：TOC 1.0.1、笔记 1.1.1、剪藏 1.0.0、Markdown工作台 1.0.0 |
| 工具合同 | 读取 `src/ui/sidebar-tools/package.js`：严格 v1字段、六项能力、12个工具、320000字节单包预算 |
| 市场现状 | `docs/product/sidebar-tool-market-compat-r41.zh-CN.md` 明确远程市场与签名分发等尚未实现 |
| Markdown/ChatGPT | `docs/product/markdown-tools-r22.zh-CN.md` 明确已有两个Markdown工具，但AI对话语义导出仅设计；独立工具页来源网页读取不支持 |
| Task / Page | 读取实际服务，必须本机验证后成为 Available；市场签名不能代替本机效果回执 |
| 发现职责 | 读取 `src/ui/task-workbench.js` 的本机 installed 视图语义；市场另设入口 |
| 设计变量 | 读取 `src/ui/design-system.css`，原型沿用蓝色、文字层级、8/12圆角与紧凑间距 |
| 原有TOC证据 | [run 38113095157](https://github.com/shopable-ai/opendesk-browser/actions/runs/38113095157) 对应 f5550d60；读取时 completed/success。原工作流的受控Chrome fixture证据，不是本轮市场或用户Mac通过 |

第三方执行分发、下载目录与Native等外部事实通过官方 Chrome 文档核对，来源在主方案相应章节。没有引用用户人数、商业收入或市场份额统计。

## 独立静态审查及修正

- 原型卸载曾写默认保留数据，已修正为现有删除本工具数据语义，已导出文件不受影响；网页笔记演示数据同步清空。
- 原型曾提供“记住授权”的复选框，已移除：现有TOC/剪藏为精确Origin持久授权，不能虚构一次性授权；TOC在已批准网站可持续显示。
- 通用应用级暂停当前不在Sidebar v1现状中。方案已将其明确列为新增宿主控制合同；UI演示不能作为已实现证据。
- 对照源码更正可复用函数名为 `reviewCandidate()` / `install()`。
- 独立市场页使用TOC/剪藏时，首版先回到目标网页的Side Panel，不假定已有跨Tab选择接口。
- 权限摘要覆盖复制与下载；工作台说明常用GFM子集和未保存草稿风险。
- 目录与原型中的应用ID、分类和四个已有包版本已保持一致，并完成静态比对。

## 验证级别

本轮验证只用于检查新文档、JSON和原型源码；没有产品源码变化，遵守现有 testing-guide 的文档变更不重跑产品全量测试规则。

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 固定远端源码读取与能力核对 | COMPLETE | 主代理与只读审查交叉核对 |
| 市场定位、功能树、需求与分阶段实施 | COMPLETE | 已保存为主方案 |
| 目录JSON | STATIC_PASS | 可解析，8项唯一应用ID，4候选/4规划；规划项无artifactRef |
| 原型HTML/JavaScript | STATIC_PASS | Node语法通过，静态ID唯一，无网络调用；目录ID/分类/版本一致；独立文档与对话片段共享一致产品内容 |
| 原型浏览器视觉/交互实测 | NOT_TESTED | Cloud Browser拒绝访问本地file协议；按策略停止该动作，未用托管、data URL或其他浏览器表面绕过 |
| 正式市场安装与Chrome E2E | NOT_IMPLEMENTED | 本轮只交付设计与原型，没有接入真实安装接口 |
| 用户Mac / 登录ChatGPT / 企业目标服务 | NOT_TESTED | 不由源码存在或其他候选CI推导通过 |
| 专家95分以上 | NOT_VERIFIED | 尚无正式全维度评审证据 |

原型使用内存模拟安装与授权，不向外部发送内容，不调用Chrome安装器/Native，不写用户真实笔记。它用来评审流程和布局，不是可安装的OpenDesk工具包。

原始静态核对结果见 [static-review.json](evidence/app-market-planning-r1-20261011/static-review.json)，包含检查项和交付输入文件哈希。检查使用Python标准库解析HTML/JSON和系统已有Node的 `--check`，没有新增项目依赖。源码审计基线与随后检查的 `main@09f27c8312043933f480e14d29700d364a9cb159` 相比，差异为第三方库doctor/CI及TOC证据记录，不涉及本方案核对的四个工具包或安装合同。

## 下一轮直接实施

1. 读取最新main、工作区与本方案，按四工具现有包和各自合同复核。
2. 内置目录、四包资源和现有安装器形成正式市场入口；不重建Sidebar、RunHost、Page API。
3. 应用级暂停若保留，必须补宿主阻断/在途处理/重启恢复；否则正式UI先使用已有关闭、撤权与卸载。
4. 将原型交互迁入正式扩展页面，补必要的真实包安装、权限拒绝、网站切换、卸载、离线、超额与升级验证。
5. 绑定一个候选提交、实际扩展包身份、Chrome版本、结果/截图和用户磁盘导出证据，再宣布市场MVP可用。

后续ChatGPT精选收藏、本地知识归档和Task/Page市场准入分别推进，不把当前原型的规划卡片当成已开发应用。
