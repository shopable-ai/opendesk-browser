# Sidebar Multi-file R1.1 去重、修复与独立复核

核对日期：2026-10-09（Asia/Shanghai）。本工作流 `sidebar-ci-quality-01a11f71` 从 main `b8cfc1f597ae1578e790f1b7fee89fb8aa1fcce9` 建立独立 worktree/分支，负责重复任务核对、Native CI 分类、发现问题的定向修复与双通道独立复核。

## 去重与实际负责人

- 「在真实 Chrome 验证多文件导入」（`01a11f5a-cfbe-7ce2-bad7-84c5c155c0ae`）覆盖本请求的 Page/Controller 导入、执行、源码切换和 Page UI 资源/生命周期；截至本次核对仍 active。
- 「验收 Sidebar 多文件 Demo」（`01a11f41-e8d4-7862-a273-4e517942bb7c`）做过相同验收，因 429 retry limit 中断为 systemError；原始 Page 成功和 Controller 超时证据保留，未删除。
- 「验收多文件 Sidebar Demo」（`01a11caa-5d40-79b0-a3b1-7974142bfe15`）已有构建与缺陷修复的历史记录。
- 本工作流未申请 Chrome/profile、43111、Native Host 或共享 dist，不新建重复验收对话，不重复 Demo 构建或原生运行。跨聊天消息工具要求明确人类授权，本次授权问题仍未收到答复，未发送协调消息。
- 本请求已授权安全 Git 集成；共享 main 出现他人未提交修改，始终保持只读。本分支的新 UI/目标输入尚无原生验收，所以按仓库“未验证的变更保留草稿 PR”规则保留 draft，未直接更新 main。

## 实际修复

1. Controller 草稿导入上限从统一 100000 改为 65536 UTF-8 字节；Page 仍为 100000。边界和一字节超限回归覆盖两种运行环境。
2. 导入后默认展示只读实际执行 `program.js`；同一选择器可查看源码快照，运行及保存继续使用固定执行字节。界面显示 Page/Controller 及对应已有运行入口，并明确快照哈希不能证明源码生成了执行代码。没有增加可伪造的“可信来源”标记。
3. 新捕获的同文档 URL 片段目标，按完整 captured/tab URL 比较后可接纳；旧捕获目标、document 替换、路径变化、待导航及异步权限期间片段变化仍拒绝。修复仅一行，未增加自动滚动或回放。
4. API 文档说明这些限制、执行代码审阅和真实滚动/重新捕获目标要求。

## 证据与验证等级

[复用核对](../evidence/sidebar-ci-quality-01a11f71/reuse-audit.json)是在修改前对基线执行：237 个相关输入字节一致；70/70 组件日志、三份真实 Program 草稿/构建 SHA、两个不同 nonce 的 Page 原生回执组及所有原始文件哈希一致。该基线证明不得提升为本分支的新候选原生 PASS。原证据保留在其生产者和续接 worktree，未复制或覆盖历史 receipt。

[候选输入核对](../evidence/sidebar-ci-quality-01a11f71/candidate-input-review.json)记录受影响的三个产品文件及两份本分支实际构建：每份 140 个 sourceInputs 均复核，构建期间 drift 为空，实际输出文件哈希与 receipt 一致。

- 新回归修复前：`program-source-before.log` 为 1 PASS / 2 FAIL；修复后 `program-source-after.log` 为 3/3 PASS。
- 片段回归正确 fixture 的修复前证据：`fragment-before-confirmed.log` 为 3 PASS / 1 FAIL。首次 `fragment-before.log` 漏设 fixture 的 incognito:false，属于组件驱动错误，保留而不作为产品缺陷证明。
- `affected-after-final.log`：103/103 PASS，0 FAIL，0 SKIP。
- `affected-contracts.log`：96/96 PASS，0 FAIL，0 SKIP；与前组有重叠，不相加为覆盖率。
- `check.log`：175 个源码/测试/构建文件的语法和既有静态合同 PASS。
- production/development 构建和 actual package verify PASS，仅 BUILD/COMPONENT 级。
- production 包 SHA：`63b090e3727dd3eb056e6bfc21297bc4c5eced83bdf9ee75de1c9fca762f0e0a`。
- development 包 SHA：`c2626076e29a71941b8bfcf11cd742ec9fa3f117a5e2a4e78c5aff9060ad9a1e`。
- 当前没有额外 lint/typecheck 配置；本次以仓库 `npm run check`、受影响 Node 回归及双构建验证。未启动包含真实 Chrome 测试的全量环境集合。

构建脚本默认曾写入 `docs/framework/evidence/wxt/builds/`；本轮结果已转存专属 `final-build/`，两份历史默认 receipt 已恢复为原 Git 字节、无 diff。独立 code-review 的 LOW 证据卫生意见已据此处理。本分支的新 receipt 明确不代表原生、Codex、F3 或 ZIP。

## Native Agent CI 分类

最新 main 的 [run 37892566972](https://github.com/shopable-ai/opendesk-browser/actions/runs/37892566972)：

- `bridge-components` PASS：完整 Node 317 项中 312 PASS、5 SKIP；跳过项不得计为验证通过。共享回归、静态合同、双构建和包校验通过。
- macos-15 / macos-15-intel 两个 job FAIL。已下载本次原始日志，均先报 `REAL_CHROME_UNEXTENDED_RENDERER=FAIL`、`CDP Runtime.evaluate timeout` 和 `MachPortRendezvous Permission denied (1100)`。这是无插件也发生的渲染/CDP 环境故障，不能据此认定 Sidebar 插件缺陷，也不能推导插件正确。
- 原生 Native/CLI smoke 仍没有成功闭环；本机旧 handshake timeout 根因也未据这些 CI 日志被证明。Codex E2E 保持 NOT_TESTED。
- 测试未删除、未放宽、未重跑相同环境失败。[job 状态](../evidence/sidebar-ci-quality-01a11f71/ci-job-status.json)与三份原始 job log 均保留。

## 独立质量结论

两条独立通道：[代码/安全复核](../evidence/sidebar-ci-quality-01a11f71/code-review-final.md)，[架构复核](../evidence/sidebar-ci-quality-01a11f71/architecture-review-final.md)。最终静态建议为 code-review COMMENT + architecture CLEAR，合成 COMMENT；允许提交草稿，不构成完整原生交付接受。

这些是有证据边界的暂评分，不能当完成率或统计成功率，未取平均：

| 维度 | 暂评分 | 主要未闭合证据 |
| --- | ---: | --- |
| 功能正确性 | 89 | 本分支的新 UI/目标真实闭环 |
| 架构 | 92 | 完整操作接受与已声明生命周期边界 |
| UI/UX | 84 | 新默认执行视图和运行类型的真实交互 |
| 安全 | 93 | 实际新候选权限/导航/目标变化 |
| Codex 协作 | 62 | Native/Codex 真实连接和持久结果 |
| Chrome 可靠性 | 65 | 新候选原生验证及 CI 渲染环境 |

目标各项 ≥95 尚未达成。Page/Controller/Page UI 旧候选成功、组件、构建、CODEX_E2E、F3、ZIP 分别记账。原生验收负责人正在收敛旧候选的 Controller 和 Page UI；新候选只需补受影响的导入视图、字节选择和片段目标，不应重复完整历史活动。

## Git 与资源状态

确认 `pr-11` 是 main 的祖先且没有 worktree 占用后，删除该唯一多余本地分支；其他已合并但仍被工作树占用的分支保留。远端现有清理 workflow 已成功，未删除并行工作分支。GitHub main 查询返回 protected:false，本工作流未变更服务端规则。

```text
多文件验收去重
  Chrome Demo：已有活动负责人；旧候选原生运行正在收敛
  CI 分类：本次原始日志已核对；无插件渲染失败，Native/Codex 仍未通过
  导入审阅和目标修复：已实施；两组定向回归、双构建和校验通过
  独立质量复核：已完成静态复核；各维度尚未达到 95
  安全集成：保留草稿 PR；新输入原生证据和主集成待完成
```
