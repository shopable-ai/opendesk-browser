# OpenDesk Browser 官方扩展 R1.12-CORE：真实阻断与候选身份交接（2026-10-23）

> 目标：十二项官方扩展合法安装、普通功能即用、敏感权限按需批准、真实 Chrome 执行、可靠持久化、安全停用/撤权/重启/升级/卸载。唯一开发分支 `main`。只预装 Reading TOC、Quick Notes、Cookie Editor。继续使用已有 SDK / Trusted Host / Installer / 打包器 / Native Driver；不设第二套平台。
>
> 本记录是一次 GitHub 当前源码、既有运行日志与并行证据的**核查**；记录者没有在当前环境执行 Node、Chromium、Mac Native、正式打包或真实安装，更没有关闭发行门禁。检查期间 main 持续前进，任何写入、再测或复用旧证据前重新检查最新 HEAD、相关文件 Blob SHA 和并行工作。

## 原始六项任务与实际状态

1. **CI 第一失败优先**：AdBlock [39963630511](https://github.com/shopable-ai/opendesk-browser/actions/runs/39963630511) @ `a77c01e97ad39f907d99d6f05e847362cefaff66`，Time Review [39962819855](https://github.com/shopable-ai/opendesk-browser/actions/runs/39962819855) @ `1a85cf00bd3bd7576d1850c149bd4dca97204a03`，核查时均为 `queued`，无新失败日志或 Native 通过证据。不能据旧 SHA 宣称当前 main 通过。
2. **AdBlock**：旧 [39958894314](https://github.com/shopable-ai/opendesk-browser/actions/runs/39958894314) 的 source job `120431570263` 在 `scripts/bundle-provenance.mjs:187` 构建 `sw` 时因 `examples/sidebar-tools/stay-focus/trusted/model.js` 的可信 Git Blob pin 不符而失败，Native 未执行。后续源码核查时 `scripts/bundle-provenance.mjs` 的 Stay Focus 12/12、AdBlock 12/12 已全部匹配 GitHub 文件 Blob；这只证明**静态锁匹配**，并非当前生产构建或 DNR 网络阻断已经通过。待新 CI 后用原 macOS CFT 验证 DNR/CSS/全局/站点例外/规则所有权/重启/撤权/卸载，特别不能删除 Stay Focus 自有规则。
3. **Time Review**：旧 [39936059678](https://github.com/shopable-ai/opendesk-browser/actions/runs/39936059678) macOS job `120355750389` 在 `tests/framework/time-review-r13-native.test.mjs:948` 的跨工具 Stay Focus 本地旧候选安装发生 `reviewed package installed timed out`，之前 Reading TOC 和 Cookie Editor 跨工具环节有通过日志，但整条 Native 未通过。提交 `8b71f57` 给 `installReviewedPackage` 增加安装 UI / Chrome Storage / provenance / operation journal 失败回执；**其新运行结果尚不可读**。源 `src/ui/sidebar-tools/package.js` 的版本正则允许 `0.0.0`，不得直接归咎于非法版本；必须读出实际安装错误、可信 Focus Worker probe、来源/事务回执，判断测试旧候选合同还是 Installer 的最小缺陷。不可手工伪造安装成功、放宽身份或权限保护。
4. **Prompt Shortcuts**：旧 [39958894265](https://github.com/shopable-ai/opendesk-browser/actions/runs/39958894265) job `120431569675` 在 `tests/environment/sidebar-tools-host.test.mjs:577` 的可信 Dock mount 等待超时，旧 job 的构建也因上述 Stay Focus Blob pin 失败；不能直接归因于当前 `1.1.15`。已继承 `bbf4a05c` 的源码版本准入、`1a85cf0` 的校验/负例。**并行提交** [`4a67583dbd`](https://github.com/shopable-ai/opendesk-browser/commit/4a67583dbd4dae3b75a4083e460022b6706e7a72) 已把唯一正式 `prompt-shortcuts.opendesk-tool.json` 晋升到 `1.1.15`，与 `tool.config.json` 版本一致；`examples/sidebar-tools/prompt-shortcuts/evidence/r42-local-20261023.json` 报告候选、`--promote-from`、`--check-project`，包 SHA-256 `4085c155d2d8dbac7b55cc5dcaea24229a3fb1d6cfb69431dad2ae5c0eb33ce0`，420 项 Node 定向检查及受控 Chromium UI 检查通过。这是**既有并行本地证据记录**，当前会话未独立读取其原始本地日志。该记录明确当前 `1.1.15` 的真实 Mac Chrome 安装/同 ID 升级和真实网站验收 `NOT_TESTED`。继续校验官方来源与版本 SHA/已安装内容/启用/代际、旧数据、IME/Undo/图片/右键/ChatGPT-DeepSeek-Gemini、仅插入不发送；不能将本地 JSON 手动安装冒充获得可信 AI Dock 的官方身份。
5. **其他九项官方工具**：已只读核对当前 `official-tools/catalog.json` 包含 12 项，且仅 Reading TOC / Quick Notes / Cookie Editor 是 `preinstalled`，其余 `optional`。仅文件存在或源码版本检查不能证明核心业务。需按各工具已有日志及同一候选身份复用 `SOURCE / NODE / CHROMIUM / NATIVE / RELEASE` 的原有记录，受影响部分最小补测。
6. **App CI/正式发行**：必须以源码候选、固定 Host、包 SHA、Chrome 读回、必需 Mac Native 同一相关输入通过为条件，再执行 App CI/发行核查。不允许把旧候选结果移植到新候选，也不为绿色 CI 删除校验。**RELEASE_BLOCKED**。

## 源码锁、版本与已知差异

- 初次读取 `scripts/bundle-provenance.mjs` Blob `34cf54b3c5729e4b2070a98afead3dfc23c43384`；当时 GitHub 目录逐文件核验匹配：Stay Focus **12/12**、AdBlock **12/12**、Time Review **10/10**、Prompt Shortcuts **7/7**。仅为当时 `main` 的静态匹配，不是生产构建报告。
- 配置与已提交目录正式 JSON（仅做版本存在性核对，不是 `--check-project`）：Reading TOC `1.0.9/1.0.9`、Web Markdown Clipper `1.2.8/1.2.8`、Markdown Workbench `1.0.5/1.0.5`、Stay Focus `1.0.10/1.0.10`、AdBlock `1.2.3/1.2.3`、AI VIP Share `1.4.1/1.4.1`、Bookmark Manager `0.3.10/0.3.10`、Prompt Shortcuts `1.1.15/1.1.15`。
- Quick Notes `1.1.9`、Knowledge Inbox `1.2.9`、Time Review `1.6.0`：仓库对应工具目录未查询到已提交同名安装 JSON；需按既有从源码构建的官方包合同确认，**不能仅因此判为缺陷**。
- Cookie Editor 源配置 `2.0.36`，已提交目录 JSON `2.0.35`：独立发行候选差异，属于并行工具负责人范围；本工作流不跨范围擅自晋升。
- Stay Focus 远程更新发布的独立 Ed25519 验证信任根当前源码明确配置为未启用，属于并行应用解耦/发行工作流；不得在此跳过其 fail-closed 身份校验。

## 下一处最小任务、证据和禁令

- 先检查目标 Actions 是否真正开始；若仍 `queued`，保留 `QUEUED`，不重跑/不编造结果。若发生失败，读取**第一条**失败的原始日志、job ID、HEAD、被测试资源/包 SHA 和 Chrome profile 身份。
- AdBlock 新 source job 如仍见 `reviewedCompiledStayFocus`，先读其 checkout 实际 Blob 与当前 pin；只有实际失配才逐文件审阅并精确重新固定。通过后仍须真实 DNR 与 Stay Focus 规则隔离读回。
- Time Review 新 macOS job 先读取 `older-stay-focus-install-diagnostic.json` 及 UI/Storage/journal；补充当前 Worker probe 只为诊断，不更改成功准则。如果测试候选不满足正式安装合同，使用可审阅的合法旧版本候选；如正式 Installer 有缺陷，仅改可证明的根因。
- Prompt Shortcuts 新正式包依仓库证据复用已有 Node/UI PASS 的相同源码部分；仍需同一 `1.1.15` 真实 Chrome 官方目录安装/升级及 Host/站点/撤权验收，不以此前 `1.1.9`/模拟 Host 记录替代。
- 保护并行 Site Budget、Stay Focus Publisher、Cookie Editor 的现有修改；不创建分支、Worktree、PR，不强推、reset、clean、stash。当前会话只读取 GitHub 公开/授权仓库和历史 Actions，没有用户 Mac 访问，也没有真实测试执行。
- 九项产品质量及五个专家视角：没有足够的同一最终候选功能、Native 和发行原始证据，均暂为 `NOT_RATED`；综合分 `NOT_RATED`，不虚构大于 95。**目前不生成最终 Mac Codex 验收提示词**；先关闭剩余核心和发行门禁。
