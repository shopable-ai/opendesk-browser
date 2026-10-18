# 扩展运行环境 R1：源码核查与普通开发者指南

- 负责人：当前扩展运行环境 R1 对话；子任务仅进行只读源码审计。
- 日期：2026-10-18（Asia/Shanghai）；状态：IN_PROGRESS。
- 分支：只向真实 GitHub `shopable-ai/opendesk-browser` 的 `main` 写入；不创建分支、Worktree 或 PR。
- 源码核查基线：`4311d0ab8794d9ee092582ce464840cab8069f3a`。
- 已吸收并行文档提交：`224062ec7202b7d7f69d60aa20c3762037ecba23`。该提交新增四类需求指南和 API 导航，本轮直接补充该指南，不创建第二份。
- 环境：本会话不能访问用户 Mac 路径；通过 GitHub 读取固定提交、核对差异和提交。只读源码缓存位于会话临时目录；不代表本机仓库/Chrome 状态。
- 资源：不占用 Chrome Profile、Native、端口、dist、用户数据库或构建 watcher。GitHub 提交采用最新父提交、预期 HEAD 与非强制快进，漂移后先检查再重做最小补丁。

## 本轮写入范围

1. `docs/api/extension-development-selection.zh-CN.md`
2. `docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md`
3. `docs/api/sidebar-tool-development.zh-CN.md`
4. `.agents/skills/opendesk-extension-runtime/SKILL.md`
5. `.agents/skills/opendesk-script-authoring/SKILL.md`
6. `.agents/skills/opendesk-sidebar-tool-dev/SKILL.md`
7. `.agents/skills/opendesk-trusted-sidebar-feature/SKILL.md`
8. 本记录。


2026-10-18 文档试读后的最小范围补充：还需修正 `docs/api/sidebar-tools.zh-CN.md` 的 v1/v2/固定 Shared UI 字段说明、`docs/api/page-userscript.zh-CN.md` 的 JSX/SFC 编译方式、`docs/api/sidebar-local-projects.zh-CN.md` 的现行安装按钮与导航，以及 `.agents/skills/opendesk-program-publish/SKILL.md` 将 MCP 路径误作默认入口的描述。均为已链接材料中的事实冲突，不修改运行协议/代码，也不新增 Skill。

公共运行协议、Schema、安装器、SDK、产品 JS/UI、Manifest、WXT 与正式工具包均只读。已存在的 API README 导航与扩展创建工作流保持其并行提交。Stay Focus R4、Time Review、Cookie Editor、AdBlock、Prompt Shortcuts 和扩展中心的业务改动由各自任务继续。

## 本轮要解决的问题

- 四类用户需求与程序类型、运行世界、源码模块、入口、UI 编写方式、触发时机分开解释。
- 补齐 Controller 实际 Host 销毁停止、Page 试运行/安装与受管清理边界、侧栏关闭与后台继续工作的区别。
- 以 Stay Focus 的真实调用方解释多文件协作，确认 R2 已提取；链接既有 R4 需求，不重复迁移或设计后台运行器。
- 区分独立源码、可安装 UI、已获授权的配置更新与高权限后台代码独立升级。
- 用 Prompt Shortcuts 共享纯模型的实际配置纠正“目录名决定权限”的误解。
- 记录 Time Review 和 Cookie Editor 的具体归属缺口，以及已有说明与源码的差异，交给对应 owner。

## 验证范围

仅验证改动文档/Skill 的相对链接、配置/代码摘录、真实入口与调用方、事实一致性、Skill 元数据与场景阅读结果。未修改运行代码，不启动产品构建、Node 产品测试或浏览器。

| 证据 | 当前状态 |
| --- | --- |
| 固定 main 源码与入口核查 | 已完成主要路径；正在汇总 |
| 文档链接、摘录与 Skill 校验 | 待修订后执行 |
| Chrome / Native / 安装升级 / 后台恢复 | NOT_TESTED |
| 产品真实功能 95+ 与外部专家评审 | 未取得，不以方案评分替代 |

## 已有需求与证据入口

- [现有四类需求指南](../../api/extension-development-selection.zh-CN.md)
- [Stay Focus R4 唯一需求](../../../examples/sidebar-tools/stay-focus/REQUIREMENTS.zh-CN.md)
- [Stay Focus R2 提取记录](stay-focus-extraction-r2-20261018.md)
- [仓库测试指南](../testing-guide.md)
- [并行开发协议](../parallel-development.md)
