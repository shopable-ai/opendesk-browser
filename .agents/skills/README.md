# OpenDesk Browser · Agent Skills 路由

本目录是项目**唯一现行 Agent Skills 入口**，不新建根目录 `skills/`；Skill 是 AI/Codex 指导而不是浏览器安装的扩展。保留技术 slug 与运行协议，用户产品术语统一引用 [R4 正式产品规格](../../docs/product/sidebar-ui-spec.zh-CN.md)。

**普通用户一句话创建工具的上游入口（R2）**：先按[自然语言扩展开发工作流](../../docs/framework/browser-tool-creation-workflow.zh-CN.md)执行现场恢复、需求推理、功能树及需求关卡（Phase 0–3 / Gate A），为 P0 建立 F-ID↔S-ID↔A-ID 后**才**从下表选一个主 Skill 进入 UI/源码阶段。用户不需要填写 Skill 名称或技术表单；这只是对现有 Skill 的执行指引，不表示浏览器已有一键创建/自动安装产品入口。

| 主职责（唯一主 Skill） | Skill | 禁止混淆 |
| --- | --- | --- |
| 五 Tab、扩展中心搜索/类型标签/详情/安装管理 UI、R27/R28/R30、定时计划交互 | [`opendesk-extension-ui`](opendesk-extension-ui/SKILL.md) | 只负责界面，不擅改运行授权 |
| 「扩展」中的**应用**（Sidebar Tool），源码、交互、开发预览、沙箱 UI | [`opendesk-sidebar-tool-dev`](opendesk-sidebar-tool-dev/SKILL.md) | 源码开发不重复管理发行打包器；`OpenDeskTool.request` 仍是原合同 |
| Sidebar Tool **编译、可导入 JSON、随源码安装包、字节校验、本地导入更新及官方离线发行** | [`opendesk-sidebar-tool-package`](opendesk-sidebar-tool-package/SKILL.md) | 复用唯一打包器/原安装器；不是第三方在线市场发布 |
| 「开发」中创作或调试 Controller Task、Page USER_SCRIPT、React JSX/Vue SFC | [`opendesk-script-authoring`](opendesk-script-authoring/SKILL.md) | 草稿 Run/Preview ≠ 安装/发布 |
| 冻结/验证/安装/发布 Task 和 Page Program，已安装 Page 由「扩展 → 网页增强」管理 | [`opendesk-program-publish`](opendesk-program-publish/SKILL.md) | Page Authority ≠ Sidebar Tool 安装器；Task 属于「我的」 |
| 静态编译/审计的一方可信功能，Stay Focus/Time Review/Cookie Editor 业务解耦 | [`opendesk-trusted-sidebar-feature`](opendesk-trusted-sidebar-feature/SKILL.md) | 不能把动态导入包变为受信 Host 源码 |
| Chrome MV3/WXT SW、Content、MAIN、Controller/Page、Native 的权限/SDK/生命周期 | [`opendesk-extension-runtime`](opendesk-extension-runtime/SKILL.md) | 不创建第二 Host/Authority，不接管 UI-only 改动 |
| **ChatGPT 同规范 HTML 原型、正式源码同源离线预览、来源锁与模拟场景** | [`opendesk-ui-preview`](opendesk-ui-preview/SKILL.md) | 设计稿与真实工具预览分级；不替代原有打包器、SDK 或原生验收 |

## 典型需求：每条仅一个主 Skill

| 用户原话 | 唯一主 Skill | 需要协作时才采用 |
| --- | --- | --- |
| 「在扩展里开发一个小应用」 | `opendesk-sidebar-tool-dev` | 需受信后台能力时复核 runtime/trusted |
| 「生成正式工具同源 HTML 预览并检查是否过期」 | `opendesk-ui-preview` | 真实工具仍由 sidebar-tool-dev / sidebar-tool-package 开发和安装 |
| 「编译 Cookie Editor 并生成可导入 JSON」 | `opendesk-sidebar-tool-package` | 本地包交付；不自动安装、不执行线上发布 |
| 「为网页安装一个增强脚本」 | `opendesk-program-publish` | 在「开发」写脚本时由 script-authoring 辅助 |
| 「修改扩展列表和安装管理界面」 | `opendesk-extension-ui` | 安装器/权限协议另行 runtime 审计 |
| 「开发一个需要后台能力的扩展功能」 | `opendesk-extension-runtime` | 第一方具体业务可按 trusted-feature 所有权细分 |
| 「在我的任务中创建自动化任务」 | `opendesk-script-authoring` | 正式安装由 program-publish，计划视图 UI 由 extension-ui |
| 「开发并发布 React/Vue 网页程序」 | `opendesk-program-publish` | 源码编写时可协同 script-authoring，仍为 Page 世界 |

## 易混淆请求：按实际需要修改的对象选择主 Skill

以下是**静态路由合同**，不是一次真实 Codex/Agent 模型选择记录（真实触发未观测时记 `TRIGGER_NOT_TESTED`）。同一产品可有不同主 Skill：修改沙箱应用 UI、第一方可信服务、通用 SDK/Authority、统一列表 UI，属于不同职责。

| 用户原话 | 唯一主 Skill | 判定边界或协作 |
| --- | --- | --- |
| 「修复 Cookie Editor 的可信后台权限」 | `opendesk-trusted-sidebar-feature` | 第一方专有服务/授权逻辑；通用 Chrome 权限桥由 runtime 辅助 |
| 「只修改 Cookie Editor 沙箱应用 UI」 | `opendesk-sidebar-tool-dev` | 仅修改可安装 iframe 内的界面，不触及可信 Host |
| 「给网页增加 React 悬浮组件」 | `opendesk-script-authoring` | 开发/试运行 Page JSX，不代表正式安装 |
| 「修改 Page Program 的安装和撤权」 | `opendesk-extension-runtime` | 指底层 Authority、安装事务与撤权实现；具体版本发布由 program-publish 协作 |
| 「修改「我的」定时计划页面」 | `opendesk-extension-ui` | 仅调整已有计划列表/表单交互，不更改定时执行引擎 |
| 「修复 MV3 Service Worker 生命周期」 | `opendesk-extension-runtime` | 修复 Background 生命周期，不创造新 Worker |
| 「导入已有 Sidebar Tool JSON」 | `opendesk-sidebar-tool-package` | 校验、审阅与本地安装；只改导入入口视觉则 extension-ui 协作 |
| 「更新已经发布的 Page Program」 | `opendesk-program-publish` | 版本冻结/验证/升级，保留 Page Authority 和网页增强类型 |

**市场发布占位（尚未启用）**：已保留 [`opendesk-marketplace-publish/RESERVED.md`](opendesk-marketplace-publish/RESERVED.md) 和未来 `SKILL.md` 的稳定名称。现有官方离线市场、网站展示和有限交接**不等于**第三方作者在线上传、审核或生产发布能力。预留目录没有正式 `SKILL.md`，不可被当成第八个活跃 Skill；相关未实现动作必须报告 `BLOCKED`。源码编写、JSON 打包、本地安装及市场 UI 分别按上表现行 Skill 路由。

**产品与底层分离**：OpenDesk Browser 是一款 Chrome Extension；五个正式 Tab 是「我的 / 扩展 / 工作流 / 开发 / 云控」。「扩展」是管理入口；「应用」是 Sidebar Tool 的列表类型标签，「网页增强」是已安装 Page Program 的类型标签；Controller Task 仍属「我的」，一方可信功能与动态安装包必须安全隔离。Agent Skill 不是安装包。不要因为用户称“扩展”就互换包格式、运行世界或权限。

新建 Skill 前读 [Skill 宇宙与评分](UNIVERSE.zh-CN.md)。**现有八个活跃 Skill + 一个市场占位目录**；一个职责对应一个 Skill，绝不为具体工具、JS 框架或一次测试创建重复 Skill。仅静态文档核验标为 `DOC_STATIC_PASS`；Chrome 原生未实测记 `NOT_TESTED`。

## R2.2 真实 Codex 触发验收（本机手动运行）

仓库自带 [只读触发评测工具](../../scripts/agent-skills-r22-eval.mjs)，历史 R2.2 包含 12 次核心请求复测、8 次易混淆请求、6 次显式调用、6 次负向对照、3 次上下文请求和 3 次真实只读任务，共 **38 次独立 Codex 会话**；当前只读评测脚本已增加打包 Skill 的路由与显式调用样本，数量以脚本实际生成的用例为准。不创建第七个 Skill，也不安装第二套路由器。先阅读本机 `codex exec --help`、确认登录已就绪，再在 Mac 的项目根目录执行：

```bash
node scripts/agent-skills-r22-eval.mjs --self-test
node scripts/agent-skills-r22-eval.mjs --repo "$PWD" --mode core --max-tests 2
node scripts/agent-skills-r22-eval.mjs --repo "$PWD" --mode all
```

评测仅使用 `codex exec --json --sandbox read-only`，输出存入本机 `~/.codex-evals/opendesk-r22/`（权限 0700，原始文件 0600），不提交含私密会话信息的 JSONL。Codex 调用可能计费并将提示词发送至当前配置的推理服务；CI **只运行离线自测**，不调用模型。

**证据等级**：`PASS` 要求观测到对应 Skill 的调用事件且有成功读取该 `SKILL.md` 的记录；仅能看到调用时使用 `IMPLICIT_TRIGGER_OBSERVED`，仅能确认读取时使用 `SKILL_READ_OBSERVED`，无法观察时使用 `TRIGGER_NOT_OBSERVABLE`。负向对照缺少可观测事件不能直接判 PASS，任何跨 SHA/工作树漂移必须重新核验。静态 14/14 不等于真实 AI 14/14，不能据此宣布真实自动路由 ≥95%。
