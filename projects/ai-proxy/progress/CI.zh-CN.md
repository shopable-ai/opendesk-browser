# 候选 c1a95457b 的 CI 定位记录

2026-11-09 交接时观察：11 个 workflow 已完成，1 成功、10 失败。该汇总是候选历史快照，不是当前 main 的实时 CI。以下四个 job 已于 2026-11-09 15:31（Asia/Shanghai）通过 GitHub connector 读取实际日志，并只读核对 c1a95457b 的源码。未重跑工作流，不将本地网页通过当作 CI 通过。

## BLOCKED：App 发现合同缺口

[OpenDesk App CI / discover](https://github.com/shopable-ai/opendesk-browser/actions/runs/42530381579/job/128883060999) 报 `E_APP_CI: React App requires an explicit browser test profile`，app-validate/native/ci-contract 被跳过。

候选中只有 `projects/ai-proxy/tool.config.json` 声明 `opendesk.react-ui.v1` 却没有同目录 `app.ci.json`。`scripts/app-ci.mjs:154` 检查此声明，plan 在执行测试前失败。这是 AI Proxy 的真实 CI 配置缺口，不能归为无关失败。

它不阻断当前本地只读页面与原 Demo；补齐需要真实的项目测试/浏览器证据合同，不能塞入空 profile 绕过风险门禁。本轮保留 BLOCKED，不扩展为 production/原生 CI 验收。

## FAIL：Provider 测试与当前结构不一致

[Sidebar R1 P0](https://github.com/shopable-ai/opendesk-browser/actions/runs/42530381654/job/128883061062)：21 项，17 PASS / 4 FAIL，均位于 `tests/environment/workflow-ui-states.test.mjs`。

- 第164行与273行的测试断言 Provider radio 数为3，实际为2；标题虽写“three header actions”，实际失败断言在179行的 Provider 数量。
- 第190行的测试期望 `local_codex/custom_https/cloud_responses` 三个 radio，实际是 `local_codex/https`。现有 `src/ui/react/components/provider-settings.tsx` 在 HTTPS 内保留 Chat Completions/Responses 协议选择；上述三项是旧结构断言，不能据此推定 Provider 功能被删。
- 第288行 mounted control 测试报 `Mounted Workflow control not found`。当前菜单与控件路径已有变化，但本轮未动态重现该测试失败的精确动作，根因保留待查。

本地查看页和 Demo 不经过该 Provider 设置路径。本轮不改公共 Provider 或删除测试；产品操作与测试驱动的最终修正由对应 owner 处理。

## FAIL：用户工具与 AI VIP Share 的多类失败

[Sidebar user tools R1 / R14五Tab](https://github.com/shopable-ai/opendesk-browser/actions/runs/42530381576/job/128883060766)：547 项，480 PASS / 67 FAIL。按日志中的实际失败 location 分类：

| 测试文件（tests/environment/） | FAIL |
| --- | ---: |
| ai-vip-share-r5-ui.test.mjs | 2 |
| ai-vip-share-r51-member.test.mjs | 30 |
| official-tools-catalog-r45.test.mjs | 1 |
| sidebar-product-contract.test.mjs | 4 |
| sidebar-tool-hierarchical-back-r12.test.mjs | 1 |
| sidebar-tools-host.test.mjs | 23 |
| sidebar-ui-preview.test.mjs | 4 |
| task-workbench.test.mjs | 2 |

实际错误包含：AI VIP Share 期望1.4.11但包为1.4.32；旧源码字符串 `ACTIVATION_URLS=Object.freeze([])` 断言不匹配；缺失 `artifacts/sidebar-tools/ai-vip-share/candidate.opendesk-tool.json`；member fixture 的 release-disabled endpoint 覆盖失败；Reading TOC 旧 Sidebar 包路径不存在；Host 卸载夹具缺跨上下文代理锁；Bookmark intent 和旧五Tab/布局断言失败。它们不能合并宣称为单一产品故障，也未证明均由 c1a95457b 引入。

[独立 AI VIP Share job](https://github.com/shopable-ai/opendesk-browser/actions/runs/42530381576/job/128883060995)：44 项，9 PASS / 35 FAIL，包含上述旧版本/字符串、缺失候选及 fixture 失败。不是新增的35个互不重复产品缺陷。

这些是其他业务或公共回归 owner 的待办。本轮页面和双界面源码 Demo 已实际打开并完成保存读回，未触发这些路径；不改并行公共文件、其他工具或来源锁来制造全绿。其余失败 workflow 仍未逐项分类，保留失败事实。
