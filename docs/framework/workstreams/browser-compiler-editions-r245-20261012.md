# R24.5 浏览器编译器独立版本工作流

日期：2026-10-12。分支 `feature/r245-optional-browser-compiler` 从创建时 `main` 的 `43e7e47703b0fff40be2d9e5140dde91d7e20279` 快照起步。**用户本轮明确要求创建这个独立分支；未授权合并和发布。** 本工作流不更改当前 main、不对用户 Mac 本地文件系统做写入、不启动共享 Chrome Profile 或端口。

## 目标及方案

1. Standard **默认**构建实际去除浏览器 Babel 7.29.9 + Vue SFC compiler 3.5.22 + 受信 Worker 及链接资源，减去至少 4,249,817 未压缩 JS 字节；保留共享 React/Vue 运行时与 Direct 功能。
2. Developer Edition 是同源代码的**另外一个安装包**，物理文件独立，支持原 Chrome 直接编辑组件编译链和原用户脚本执行器。
3. 本地 Node `@shopable/opendesk-dev` 保持原有自动准备；不新写 Node JSX/SFC 编译器、不扩大权限、不改变 Controller/Page 业务执行环境。
4. 同一源码 tree 通过受限 `OPENDESK_BROWSER_EDITION=standard|developer` 决定输出资源闭包，输出不同 packageHash、Build/ZIP 证据与 manifest 名称；不通过前端开关伪装精简。

## 组件及资源变更

- `scripts/browser-editions-r245.mjs`：严格枚举版本、产物目录、marker 精确字节及固定浏览器资源闭包。
- `scripts/prepare-public.mjs`：普通版不复制编译器文件及许可证；所有版本都写 package edition marker。
- `scripts/verify-package.mjs`：根据 marker 推导**严格的期望文件清单**；普通版发现多余二进制、ESM 或许可证直接失败；Developer 的供应链 SHA 和许可校验不降低。
- `scripts/audit-fixed-entries.mjs`：加载组只对实际包含的 Developer compiler 进行统计；普通版的 startup 仍无 compiler。
- `wxt.config.mjs`、`scripts/build.mjs`、`scripts/pack.mjs`：扩展身份/构建包区分，生成 `production` 与 `production-developer` 独立路径和 ZIP。
- `src/ui/script-editor.js`：普通版关闭 React/Vue JSX/SFC 直接编辑控件并拒绝越权调用，同时保留本地项目和普通 JS 运行入口；Developer 保持原编辑能力。
- 新测试 `browser-editions-r245.test.mjs` / `browser-edition-package-r245.mjs`：分别校验来源合同与**真实包文件**的双版本精确资源差异。
- 验收 CI `.github/workflows/browser-compiler-editions-r245.yml`：Ubuntu 运行受影响检查、双生产包构建、验证、真实 ZIP 导出和差异报告；不会自动发布 Release。

## 证据与阻断

- 原本的 R24.3/24.4 本地编译、Mac 浏览器编辑 Run/Stop 及四目录 CLI 安装的历史原始 PASS 保留，不能直接归属为新分版。
- 新分支双版本 CI：**以 Actions 实际结果为准**；编译器文件实测差额不等于 ZIP 差值或运行时内存。
- **正式发布 BLOCKED**：R24.5 同一候选已有 Developer 真 Chrome JSX/SFC 编译、交互、Stop，以及 Standard 普通 JavaScript DOM 实际执行通过；仍需 Standard 的 React/Vue Direct、Controller、旧草稿、Go/Node Native 项目及固定程序安装更新的完整产品回归，以及分别部署时的稳定扩展 ID、Go 配对和最终 F3/ZIP 一致性。
- 同一开发分支验证未完成前，不给独立 95 分；不创建 PR，不发布、不合入 `main`。

## 双包真实构建报告（已验证）

R24.5 CI [38240441632](https://github.com/shopable-ai/opendesk-browser/actions/runs/38240441632) 在提交 `667eddccfedad677586bac831195d0beee1c6541` 上 **PASS**。源码检查、8/8 定向测试、两份 WXT 生产构建、两份严格资源包校验、`npm run pack` 和 `npm run pack:developer` 全部通过。实际产物：

| 指标 | Standard | Developer |
| --- | ---: | ---: |
| WXT 文件数 | 83 | 90 |
| 未压缩目录总大小 | 2,705,843 B | 6,956,776 B |
| 生产 ZIP | 923,772 B | 1,881,170 B |
| `packageHash` | `94ac94b375594482e3f98a8355e44be389b7feb654e9ed4f9c66f55521bfb1b4` | `9f62a8ddadb2e2414b8c8c7ae82ac43cb303daf508731f62c42879f2cce49cd6` |
| ZIP SHA-256 | `aefba72a5c2f3aecc17d90572a6fe63952dbe712d7cb7a30c6bfb218c92a226d` | `97c1558ed4b02c2e1ed56af5a6bbd3f329d334f39fc925ffbe60f16f2cfeea46` |

**真实 ZIP 少 957,398 B**；未压缩目录差 **4,250,933 B**，其中受信浏览器编译器原始字节为 **4,249,817 B**，另有许可证及 manifest/name 资源差异。上述数字有 CI 实际二进制，不是估算；ZIP/压缩比和浏览器 RAM 是不同指标。

后续 [38241095878](https://github.com/shopable-ai/opendesk-browser/actions/runs/38241095878) 新增**实际编译后 Side Panel 开关**检查并 PASS；从两份 ZIP 取出 `ui/tool-shell.js`，确认 WXT 产物虽然字节数相同但 SHA 不同，`browserCompilerEnabled` 分别被编译为 `false/true`。不是仅前端隐藏大功能而忘记移除资源。后一轮 [38241423476](https://github.com/shopable-ai/opendesk-browser/actions/runs/38241423476) 加入 Mac Chrome 标准 UI 与 Developer 完整交互正向验收，当前以各 Job 的实际结果为准。

**分发建议及 Chrome Web Store 政策约束：**首选正式版单独上架，Developer ZIP 暂时通过 GitHub Actions artifact / 开发者侧载分发。若要另在商店发布测试/开发版本，必须标注为 Developer/Beta Build、在说明中指出测试用途并链接正式版；Chrome Web Store 的重复内容政策对高度相似的公开重复条目存在审查限制。开发分支通过 CI 并不授权发布或合并。

## Mac Chrome 原生双版运行证据与成本决策（2026-10-12）

- [双版本 macOS Chrome 工作流 38241423476](https://github.com/shopable-ai/opendesk-browser/actions/runs/38241423476) **整次 PASS**，提交 `cd57c10cdf12d849b6118a164cf46225701f1ffe`。独立构建的 Standard / Developer 分别通过源包身份、CSP 和真实 Chrome 用户脚本授权验证。与旧 R24.3 的历史回执严格分开。
- **Standard：**实际 Chrome Side Panel 的 React JSX / Vue SFC 编译选择器已禁用、隐藏；JavaScript 入口保留。无 Native 环境下，所有浏览器编译器字节在安装包内物理缺失，原生回执 `PASS_STANDARD_BROWSER_NO_COMPILER`，截图位于该次工作流 `r245-standard-and-developer-native-...` artifact。最新增强测试另验证整个代码类型选择行隐藏、真实用户输入普通 JavaScript 后点击 Run 在获准网页写 DOM；该增强候选是 [38247467657](https://github.com/shopable-ai/opendesk-browser/actions/runs/38247467657)，独立结论以 CI 结果为准。
- **Developer：**扩展 ID 与 Standard 本轮隔离测试不同。无 Native 真实 Chrome Worker 编译 JSX/SFC、React Hooks / Vue ref 点击更新、组件 Stop 清理、错误编辑不得重播旧版本、修复后重新 Run、Vue Teleport 外部 DOM 清理均 **PASS**。来源 `cd57c10...`，但只证明该固定测试候选；Chrome Web Store 的稳定扩展身份仍需要独立配置。
- **包体实测：**`Standard.zip=923,772 B`，`Developer.zip=1,881,170 B`，少 `957,398 B`，相对完整版少约 **50.9%**。解压后的所有文件分别为 `2,705,843 B` 和 `6,956,776 B`。两版原有 React 193,163 B、Vue 118,131 B 固定 Runtime 保留。编译器原本按需 Worker 加载，删除这些文件**不意味着启动内存与打开速度也减少 50.9%**。
- **运营决策：**节省不到 1 MB 压缩包本身不是必须拆成两款公开商店商品的充分理由。更重要的是绝大多数人不需要 JSX/SFC 编译器，默认安装包应最小化开发专用执行资源及供应链维护负担。推荐 **Standard 单一正式用户渠道 + 原有 Node CLI 本地编译 + Developer ZIP 仅高级用户/GitHub CI 按需提供**；不要维护第二个长期分叉源码仓库，也不急于创建第二个 Chrome Web Store 条目。
- **仍未证明：**最新版增强 JavaScript E2E 的最终 CI、两版实际长期安装与版本更新、Go Native 的各扩展 ID 重新配对、全部 React/Vue Direct/Controller 兼容矩阵、F3/ZIP 正式交付身份。直到这些关闭，`R24.5 Final` 维持 **NOT_RELEASED / NOT_FULLY_TESTED**，不能以构建或单场景 Chrome PASS 抵消。

## 最新增强候选：Mac Chrome 双版真实运行与最终制品哈希（已 PASS）

[GitHub Actions 38247467657](https://github.com/shopable-ai/opendesk-browser/actions/runs/38247467657) 为固定提交 `176bb1916006ad98bb3d1b10c1b2f2d93a06d122` 的完整 **PASS**，`dual-edition-package` 与 `browser-editions-real-chrome` 两个 Job 均成功；Chrome for Testing 155、macOS 独立 Profile、无 Native 配置。它替代早先 `38247373382` 中由于 CDP `Inspected target navigated or closed` 而失败的旧 UI 驱动候选；保留旧失败记录，不声称其 PASS。

**Standard 实际原生回执：**`PASS_STANDARD_BROWSER_NO_COMPILER`，真实 Chrome 用户脚本开关、整个不必要的代码类型选择区隐藏、可用 JavaScript 输入框、原生鼠标点击 Run、目标网页 DOM 更新均通过。`r245-standard-real-chrome-javascript-execution` 的 `sourceHash=9a627b1c92f77a9ab7b5c910b386393d25f89ed18675a8e7bd428447aaed78b5`，`documentId=A3EB62F33A76C976C58E42D5F821FF84`，扩展测试 ID `pnhiokdnhhpbidgojhbjknpldipijdfa`。没有把普通 JS 无受管挂载误记为 React/Vue Stop 成功。

**Developer 实际原生回执：**`PASS_BROWSER_UI_NO_NATIVE_REACT_VUE_RUN_STOP`，扩展测试 ID `legmfblcmgcbdnclkiapbfbieamfjnok`。React `previewId=3bdc7f85-40e1-4c28-b51d-942ffbff1c2a`、Vue `previewId=1ce6e742-a117-4724-a7e1-9dda933eabb4`，同一页面 `documentId=7B9C4F0AB13DFE902B22CD662DE9CB7A`，真实指针点击、Hooks/ref 响应、受管 Stop 清理。还覆盖了 Vue 语法错误拒绝、不重播旧回执、编辑修复后的明确新 Run、Teleport 外部 DOM 受管清理；准确回执及截图在 run Artifact `r245-standard-and-developer-native-176bb...`。

同一源码候选的生产包及 ZIP 均有独立、严格验收（[两个制品 Artifact](https://github.com/shopable-ai/opendesk-browser/actions/runs/38247467657)）：

| 项目 | Standard | Developer |
| --- | ---: | ---: |
| 生产 ZIP 大小 | 923,809 B | 1,881,207 B |
| 解压大小 | 2,706,005 B | 6,956,938 B |
| 资源文件数量 | 83 | 90 |
| packageHash | `7911abc1f8b55cf5ed47510247ce005d4c112f502f2a02b1d888b0f94fa3274b` | `d04814681630f3aba176a93402051942bd8307fe767d68650235132b78c0202e` |
| ZIP SHA-256 | `eec66a63cacaffdf62071a9387566070bd0ebb7f87674b4494e2e235ddc50daf` | `f03193a2124609ebfc9f5b939772e57f791db2064ef7228bedb36285c4e3956b` |

压缩节省仍为 **957,398 B（约 50.9%）**，构建对比确认 React/Vue Runtime 仍在 Standard 中，只有可选浏览器编译器闭包和其许可证被剔除。此结论不是浏览器启动时间/RAM 降幅测量。

**产品放行状态：**「双版打包+代表性真 Chrome 正向链」PASS；「完整既有工具矩阵、正式安装更新、Native 重新配对、Stable Extension ID、F3/发行 ZIP 同包」尚未闭环。Developer 仍建议仅保留为高级用户/GitHub CI 可下载的预览版；没有发布正式 Release、Chrome Web Store，也没有将实验分支合入 `main`。

## 主分支整合（2026-10-12）

已按用户授权将 R24.5 开发分支的全部提交整合进唯一长期开发分支 `main`，原功能分支 HEAD 为 `8e3f3a2517a157133c388214d679365432955b4c`；使用保留双亲历史的合并提交，不覆盖 `main` 已有其他功能。

合并时分别保留双方对 `src/ui/script-editor.js`、`scripts/verify-package.mjs` 与 `examples/programs/README.md` 的新增差异。R24.5 双版 CI 的触发分支更新为 `main`；仓库既有的分支清理工作流只允许在 `main` 包含原分支全部提交、分支 HEAD 仍为上述 SHA、并且没有开放 PR 时删除它。

**验收等级不变：**旧分支上的测试 PASS 只能证明旧候选；新主分支合并结果需要单独检查 CI。源码合入不等于 Developer 正式发布或已完成长期 Chrome 更新及 Native 配对验收。
