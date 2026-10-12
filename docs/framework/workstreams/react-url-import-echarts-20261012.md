# React HTTPS ESM、ECharts 与冻结 JSON · 2026-10-12

本记录接续 [原 D3 工作流](react-url-import-20261012.md)，不替换其历史结果。

## 工作区、身份与并行资源

本轮只能访问 Linux 工作区，不能访问用户 Mac 的 `/Users/shopme/Documents/workspace/opendesk-browser`。
仓库标准 checkout 为 `main`，初始 HEAD `4b3eef890082f2e60aefbc964ee10a17e20f60b6`，经 `ca75fff47fcc6aed02332797512188ac32a8c1ca`、`259c6d56a52b64f0d01fbe03acc06d49a5beaef9` 安全 fast-forward 至 `e2b63ad1`。每次先核对远端新增文件与本轮改动，无重叠再同步。
没有创建分支、worktree 或 PR，没有 reset/clean/强推。已只读核对另两个对话工作目录的未提交内容，不修改其目录、测试端口、数据库或产物。
本目录只由主 Agent 写入；辅助 Agent 在任务临时目录提供建议文件，由主 Agent 核对基线后逐一合入。
根 `package-lock.json` SHA-256：`63bd16ac21bb1c3c6653849af8946bcbc7fc8c4bbe7b0bee39087bb393c6146c`。

## 已有成功与失败的复用

原功能提交 `7fcdb8b15a18d7cf711bc6ba734ed052d3dabcd1` 的 D3 输入及五项 builder 回归已与原日志核对。
原 [source-check run 38237319537](https://github.com/shopable-ai/opendesk-browser/actions/runs/38237319537)、job `114771079658` 为 169/169 与模型 13/13，保留其原输入和证据级别。本轮最初尚未改示例时，对共享解析代码的影响又验证了这五项，5/5 PASS。

同候选 Sidebar 失败已读取原 job `114771080041`：case 254 的 cloudResolve 有界查询触发 `Unbounded Cloud KV scan`，不是 ECharts 或 React 准备错误。
当前 main 包含修复 `d18b57f7f555fa1942224ecde1b20dc2b26d9216`；[run 38239459545](https://github.com/shopable-ai/opendesk-browser/actions/runs/38239459545)、job `114778186743` 的原日志确认该 case PASS，分组 16/16、277/277、23/23、37/37。历史失败仍保留；这些结果不构成全仓 CI 全绿。

## 实施范围

- 在原 `page-ui-toc-react-direct/src/main.js` 顶部保留 D3 URL，增加 ECharts 5.6.0 官方 ESM core、bar、grid、SVG renderer URL，使用同一份固定 React。
- 真实 ECharts 参与 SVG 柱状图；数据来自当前正文标题，D3 max 仍参与统计；`heading-chart.js` 管理尺寸有效后 init、数据 setOption、ResizeObserver resize、effect dispose 和迟到回调阻断。
- 原远端下载器、逐来源确认、固定内容寻址缓存与构建器复用。新增 Page `remote-lock.v2` 配置仅给需要的图模块数/总量及固定 bare import 映射，单文件 128 KiB 上限不变。
- 大型 Page 执行源码使用 `opendesk.page-linked-resource.v1` 自包含格式，仍存放于原 `sourceUtf8` 和原 Candidate/revision/grant 生命周期；固定 JS 512 KiB、描述 4 KiB、v2 JSON 768 KiB。普通脚本、Controller、Native 全局帧上限保持原值。
- Native 只读 reverse 项目源读取增加能力协商及固定产物分块；原 60 KiB 帧不增大。最后复查同一文件/锁/工具快照，不重新 resolve/build；断连、换版本、哈希错或超时不执行。
- 浏览器直接组件编辑的新 URL 准备、冻结 JSON 受管 Run/Stop 和 Candidate 保存适配已实施；只能在明确的准备/批准操作中取得新代码，保存和 Run 不隐式下载。浏览器单文件沿用 32 模块/256 KiB/链接 100 KB 的小图预算，完整 ECharts 使用冻结 JSON。

## 依赖来源与实测

ECharts `5.6.0` 的 `core.js`、`lib/chart/bar/install.js`、`lib/component/grid/install.js`、`lib/renderer/installSVGRenderer.js`；固定 `zrender@5.6.1`、`tslib@2.3.0/tslib.es6.js` 映射来自真实包依赖。
逐 URL 实际读取的原始字节与 npm tarball（registry SHA-512）核对；许可证和 NOTICE 保存于示例 `licenses/`。这不是原 pinned DNS/TLS CLI 的网络 PASS。
原始模块和部分许可证含上游 CRLF/尾随空白，按锁要求原样保留；示例 `.gitattributes` 将这两类固定字节标为 `-text`，避免不同 checkout 的换行转换破坏 SHA。已逐一读取 235 个实际 Git blob 复验全部 pin。自有源码另做 whitespace 检查，不为消除上游空白警告改写缓存。
ECharts 图 234 模块、1,744,184 bytes；加入原 D3 后 235 模块、1,744,686 bytes；最大模块 84,388 bytes。
没有使用 UMD、`window.echarts`、MAIN CDN 标签、网站 CSP 修改或在扩展特权世界执行依赖。

首次实际生产构建发现 Terser 抽取许可证生成额外 sidecar，触发原单 JS 校验 `E_PROJECT_CHUNK`。修复为保留源码中的许可证注释、不抽取第二个 JS 文件；不放宽原 chunk 校验。
首次成功产物 `sourceHash=2c817fdb0dd0b2f6b71e71e349355cea457acbff1bd9e7b4988acbee05f351c2`：capsule 481,953 bytes、linked JS 480,806 bytes、pretty JSON 558,443 bytes；后续生命周期修订将重新记录最终身份，不能沿用这些值冒充新候选。

## 浏览器与 Native 的当前证据等级

Linux CFT 155.0.8059.39 用独立 profile/包副本启动，尚未进入 DevTools：`process_singleton_posix.cc:297 socket() failed: Operation not permitted`，环境 AF_UNIX 被拒绝；没有把 Node/SSR 结果写成 Chrome PASS。
原 D3 基线生产包 SHA-256 为 `f89bb13d13f1920038c6a1ea9c3e3b5b3686b4f3c59cbd9f032c85ec57c6a784`，仅用于该阻断探针，不能用于最终 ECharts 包。
浏览器驱动与专用 CI 已纳入本轮源码，要求真实入口、可信原生输入、原 document/preview/sourceHash 回执、真实 SVG 与卸载痕迹；CDP 仅读证据，不注入替代业务效果。独立的浏览器源码 D3 场景通过真实 HTTPS、实际持久原始字节和两次明确确认验证；不使用 fixture 响应冒充下载。
当前共享远端/源码/包回归 59/59 PASS；合入后的 Native 分块与原连接定向组 16/16 PASS（组件模型，不是 socket/Mac 验收）。Node Host socket 组在此环境被 EPERM 阻断；外部 Go Host 尚无本版本分块能力，MCP 主动大报文路径仍受原上限。

## 最终源码与离线证据

原始档案：[证据说明](evidence/react-url-import-echarts-20261012/README.md)、[逐文件哈希](evidence/react-url-import-echarts-20261012/manifest.json)、[任务输入](evidence/react-url-import-echarts-20261012/input-identity.json)、[验证范围](evidence/react-url-import-echarts-20261012/validation.json)。压缩文件保留原始字节大小和 SHA，可解压复核，未改写原日志。

| 身份 | 最终实际值 |
| --- | --- |
| 项目 | `sample.page-ui-toc-react-direct` · `0.2.0` |
| 固定源码 | 482,082 B · `8d3eedccdf62d90ddafcad3752e184ccd975479b51f649cb0b12595028ab2146` |
| linked JS | 480,935 B · `f42ed71c3208ead45d4ce395394d6b391980618a2425acc7764554aef1584f0e` |
| 冻结 JSON | 558,789 B · `73f4df0f0c7e3e3a0862d04f58e47031e7562c28270b696654882ea4f8c1a484` |
| canonical 依赖锁哈希 | `2e17186d12fb3ebeff6c1de67ce29dee4b5a7d7417c05fe265ff7085a08f655f` |
| 锁文件原始 SHA | `8ab3c639777076dfd0ddba541c773c48c58cb09c59a2d3b1b1a08260f76c4599` |
| 实际 Resolver inputHash/sourceRevision | `5cd5fe05bf3f8092c3e064a74be3ced3934045f084fbc5b01feb8f464a8cc8f3` |
| 实际 Resolver artifactId | `a15ab86d2113aabaa2630b941bb735b9dfc8d1f248b54d096837f9e93cdd19da` |
| buildIdentity | `e3cf68e80d8afc0e31d1753197fbac4f3767cf75d32ca3369d24d94f132aa8a2` |

### 受影响回归

- ECharts 五项 builder 回归全部 PASS：235 个真实原始模块，禁网构建、两次确定性 JSON、缺锁/丢失/篡改/URL 变化阻断。
- 初次新增 Page capsule fixture 误用 `.test` 保留域，四项被真实 URL 安全校验拒绝；将测试域改为公共 `example.com` 后 4/4 PASS，没有放宽生产 URL 规则。原失败和修正结果分别保存。
- 图表/统计/原回执查询组 34/34 PASS；Native 固定源分块与旧连接组 16/16 PASS。
- 最终浏览器准备/转换/锁/界面/源码/候选/导入组 116/116 PASS，包括真实 482 KB 冻结 JSON 经过原 Candidate 存储、验证和篡改拒绝。
- 原固定浏览器 linker 生成脚本重新生成后逐字节一致；无 URL 的 React/Vue 原产物身份保持。`npm run check` 在同期输入上检查 552 个文件通过。
- 原 source CI 添加六文件小组和 heading-chart 模型入口，保留原 169 组合，未复制另一份全量测试。

上述分组有交集，不相加形成产品分母；均不升级为 Chrome PASS。

### 构建和完整运行/Native 体积

在 `259c6d56` 加本轮实际工作区源上，生产、开发构建及双包 verify PASS：

- production packageHash：`6a09d7e122565f43aa08b5a4d4db8831599448de6a20521e61db06c7675e386f`。
- development packageHash：`1e1301504fb36a405203653515cca00274395e8d10ffc6d23c68cb3d905d958c`。
- production `ui/tool-shell.js` 481,177 B，距原 524,288 B 硬门槛剩 43,111 B，已触发原软预算提醒；没有调大预算。
- 两次后续命令碰到自己已完成构建遗留的 PID-only 输出锁。已核对原 session exit 0、所属本目录、进程不存在、原 43120 guard 空闲，并原样归档后仅清理本任务遗留锁；没有停止其他进程。受限工具的 PID namespace 重用不能当作真实仍有构建者。

随后 main 的 SDK/schedule 文件有独立更新，以上包保留各自完整 `sourceInputs`，不能把旧 packageHash 标成同步后的包。当前集成 main 的真实生产包将由本轮 Chrome CI 再构建并记录。

必要六个运行 JS 文件合计 235,398 B；加固定 manifest 的 loader 读取量 239,951 B。固定 React 193,163 B，SHA `d1eec2e96ed42046ad543a10af7de992aee633ac06017f44f6b917e36451c758`。

完整单一执行 JS 718,450 B，SHA `811d5c3f49af36164b956d040a8897942c71c20b209c912ef92a021708c6d824`；JS 数组 JSON 732,096 B，完整 `userScripts.execute` 请求 732,232 B。受管 bootstrap 另为 3,695 B / 请求 3,895 B，进入同一 USER_SCRIPT 世界。

实际 Resolver 原 inline 响应 491,042 B，超出原 Native 61,440 B。版本化引用响应 1,479 B，20 个分块的最大完整 JSON 33,331 B（加四字节帧头 33,335 B），最终验证响应 516 B。原二进制帧和完整 JSON 已保存；providerEpoch、transferId 以及请求测量的 document/nonce 都是测量标识，**不是 Chrome 或连接中 Native 的真实回执**。

## Chrome CI 与剩余边界

初次提交后启动 `.github/workflows/react-url-import-cft.yml`：Linux CFT 155.0.8059.39、普通 Chrome sandbox、独立 profile 和副本、Xvfb headed UI。代理默认阻断外网；冻结 JSON 的 import/Save/Run/图表更新/resize/Stop/Verify/Install 全离线。可选 browser-source 场景只在可信“确认获取”时允许真实 raw.githubusercontent.com TLS 隧道，固定后关断，另验原批准锁、D3 可见结果与 Stop。

本节当前状态：**CI_PENDING**。没有提前填写 previewId/documentId 或截图 PASS。实际结果将以追加记录保存，包括失败阶段，不能拿准备或 Node 测试替代绘图。
本地首个源码提交：`384274bd25c83120660af5a47ed3508541937f12`。提交准备中发现原 `.gitignore` 忽略七份 `.log` 档案；后续本地提交 `87b0a858a4963b023eed1d2db3f145ecb2f32dd4` 显式纳入本任务证据目录的这些原日志，确保 manifest 引用完整，不删除或改写其内容。

### 实际 main 发布与首次 CI 阻断

已发布主线提交：[`aa39ef7ed6a109d98787845346d79db3b92f027e`](https://github.com/shopable-ai/opendesk-browser/commit/aa39ef7ed6a109d98787845346d79db3b92f027e)，父提交 `e2b63ad19e2e1d79ccf4eaf9a37d72a9117da8aa`。
Git CLI 写入缺少凭据，改用已有授权的 GitHub 连接逐一核验 356 个实际 Git blob，再创建与本地完全相同的树 `68b5118f93e0288505cbd1e03d2043bba537405d`，通过 `expected_sha` 和 `force:false` 更新 main。没有创建分支、Worktree 或 PR，没有强推或改写他人提交。连接器产生的提交元数据与本地不同，因此以实际远端 SHA 为发布身份；本地两次提交保留为过程记录，不能冒充远端提交。

随后保留并快进整合 Cloud 的两个独立提交 `8877fd66`、`3b11c98f`，仅涉及其 workflow 与 `k3-controller-authority.test.mjs`，未与本任务文件重叠。

首次 [Chrome workflow run 38246684752](https://github.com/shopable-ai/opendesk-browser/actions/runs/38246684752) 精确绑定 `aa39ef7e`，但在 workflow 解析阶段失败，jobs=0、artifacts=0，未启动 Chrome。GitHub 原 annotation：`(Line: 40, Col: 29): Unrecognized named-value: 'runner'. Located at position 1 within expression: runner.temp`。[原报告及日志身份](evidence/react-url-import-echarts-20261012/ci/38246684752/report.json)和同目录压缩的原 Actions HTML 保留此失败。
针对这一已观察的失败，将 `OPENDESK_CFT_PROGRAM` 从 job-level env 移到离线构建及 Chrome 两个 step 的 env；不改产品、驱动、权限或验收断言。后续执行使用新提交及独立证据，不把原失败改写为 PASS。

### 第一次真实 Chrome：目录页地址观察器修正

修正提交 [`53eac6327055bf6e20b4393e2fa914c656b77d99`](https://github.com/shopable-ai/opendesk-browser/commit/53eac6327055bf6e20b4393e2fa914c656b77d99) 的 [run 38247413580](https://github.com/shopable-ai/opendesk-browser/actions/runs/38247413580)、job `114804679462` 已真实构建并启动 CFT 155.0.8059.39，普通 sandbox、Xvfb、独立 profile；原 HTTP 测试页通过。构建再次得出相同的 `8d3eedcc…` / 482,082 B 固定源、235 模块 / 1,744,686 B 原始图；该次真实 production packageHash 为 `bae682e5f8abe2498d6140def69c3101f8748c02db693593c9a533dacdb1a26b`。

随后 `catalog DOM loaded timed out`。原 [失败报告和身份](evidence/react-url-import-echarts-20261012/ci/38247413580/report.json)、[实际 DOM](evidence/react-url-import-echarts-20261012/ci/38247413580/artifact/failure-2-catalog.json)与同目录 PNG 证实应用已经正常显示目录，但 `tool-shell.js` 按既有合同为裸 URL 添加 `hostInstanceId`，驱动仍等待原裸 URL 精确相等。尚未 JSON 导入、Run 或绘图，因此没有 previewId/documentId 验收回执。

下一候选只按仓库已有原生驱动惯例，初始目录 URL 带 `crypto.randomUUID()` 生成的 `hostInstanceId`，保持精确 URL、真实 sender、原产品按钮与权限校验；另外为已观察到中文缺字的 runner 安装 CJK 字体，便于阅读后续真实截图。两项修正均不替换业务效果或放宽断言。

`aa39ef7e` 的 Native job `114802206554` 原全量 npm test 为 1600 PASS / 1 FAIL / 7 SKIP；唯一失败是旧 `sidebar-dynamic-result-ui.test.mjs` 静态正则要求 `result.resultText ?? 'undefined'` 的空格。本任务改写该行时省略空格，现只恢复原表达式格式，原定向测试 1/1 PASS，不改断言和执行语义。该次 Native 专组 65/65 PASS，并包含实际受认证 Host socket 的分块读取/最终校验和未协商旧 provider 拒绝；不升级为用户 Mac 或 Chrome 页面验收。

### 第二次真实 Chrome：等待最终 Sidebar 文档

提交 [`8c998e725226cec09da45a1d23140e3752d39259`](https://github.com/shopable-ai/opendesk-browser/commit/8c998e725226cec09da45a1d23140e3752d39259) 的 [run 38248262739](https://github.com/shopable-ai/opendesk-browser/actions/runs/38248262739)、job `114807561326` 通过真实 fixture、实际固定包加载和 Chrome userScripts 可信开关。sourceHash 仍为 `8d3eedcc…`；本次 packageHash 是 `a0f978d8bf8c17bab18184783a90f30b417f2e04e6cfd19e9849688fbfd49e29`。CJK 字体已正常绘制。

随后 `Developer tab selected timed out`，尚未导入或 Run JSON。[原报告](evidence/react-url-import-echarts-20261012/ci/38248262739/report.json)及同目录原日志/截图显示：捕获的 `sidePanelContext.documentUrl` 仍是裸 `ui/tool.html`，documentId `92078E5778E2FA1AD2C185C5FA39EA47`；失败时实际 Sidebar URL 已有 `hostInstanceId=8a85a651-bad2-4ace-8bdd-531a2b4efee9`。这个 ID 是侧栏自身的观察身份，**不是 Page Run 回执**。

因此驱动的“元素存在”与旧 context 不足以证明最终宿主初始化完毕；原证据没有点击瞬间坐标，不能进一步断言具体丢失时刻。新观察门槛要求最终 canonical URL、readyState complete、原工作台已写入的 opendeskTab、可见按钮、实际 Sidebar 初始化后的 Cloud tab，以及完整 URL 匹配的 fresh SIDE_PANEL documentId；切回网站后复查仍为同一 Sidebar 文档，再发送一次原生点击。新增只读输入坐标/URL 记录，不修改产品导航、不重放 Run，不延长原超时。

保留的明确边界：用户 Mac 未访问；正式 Go Host 分块和主动 MCP 大源码路径未完成；浏览器单文件仅小型 ESM 图；作者缓存按原持久规则保留，尚无明确删除/GC 入口；多版本/下载中 Stop/导航等全部真实异常组合、独立 F3/ZIP 仍需各自原生证据。Page 自包含执行源的版本/更新/卸载走原记录，并不等于清空作者原始缓存。

### 第三次真实 Chrome：ECharts 绘制和数据更新已通过

提交 [`6f55d6a0b44eed9f19f87b033d30c6628c9dfcd3`](https://github.com/shopable-ai/opendesk-browser/commit/6f55d6a0b44eed9f19f87b033d30c6628c9dfcd3) 的 [run 38249322911](https://github.com/shopable-ai/opendesk-browser/actions/runs/38249322911)、job `114811217054` 已完成六个真实阶段：原测试页、实际固定扩展包、Chrome userScripts 可信开关、冻结 JSON 导入不运行、明确 Run 后实际 ECharts SVG、网页增删 H3 后同实例更新图表。整体结论仍为 failure，不把后续尚未执行的 Stop/Install/浏览器源码准备登记为 PASS。

本次 production packageHash 为 `e14999103d090de93c3a540ce1109501b9070061dd6320093f4d6a31e1751a98`；原 previewId `9c45ae62-fbdf-48af-b04b-dab7258f921b`、documentId `325E11AB775F054B4D08CCAB5CCE1D0F`，world 为 USER_SCRIPT。原 sourceHash 与前述 482,082 B 离线产物完全一致；固定 React SHA 为 `d1eec2e96ed42046ad543a10af7de992aee633ac06017f44f6b917e36451c758`。

实际 ECharts instance `ec_1791808252013` 和 SVG backendNodeId `268` 保持不变；真实正文数据从 `[1,7,5,0,0,0]` 变为 `[1,7,6,0,0,0]` 后恢复，路径哈希从 `794b95d09b0b6bfd4c04a38dce90d3d4a999f01a5ece8ec12aa96d8c3a9092fd` 变为 `daf2b202d4c390104b4570c2032612e1f6d4a2d616cf51bede1a2b18dbb64e2a` 后恢复。全程没有 D3/jsDelivr 依赖网络请求。

失败点为窗口缩小后 SVG 宽度未改变。原 PNG 显示网页宽度确实由 1054px 降为 402px，但示例的 `min(300px, calc(100vw - 32px))` 卡片在 402px 视口仍为 300px，SVG 合理地保持 268px。原驱动没有记录失败时的实际窗口 bounds/容器，不能据此认定 ECharts.resize 失效。

后续只改验证前置：记录每次真实窗口、缩放率、视口、容器和 SVG 尺寸；若原生最小窗口仍未改变容器，向此独立 Xvfb 内唯一、经 PID 校验的 Chrome 窗口发送 XTest Zoom In 按键，读取真正 `tabs.getZoom` 后才验证容器变化及同实例 SVG resize，最后原生 Ctrl+0 和窗口恢复。没有 DOM/CSS 赋值、设备视口模拟或虚构 zoom。另等待原安装界面的 refresh 按钮 ready，避免在其既有异步刷新期间误判输入。

原 artifact `11747242331` 共 2,666,659 B，SHA-256 `3de17c5976c4882316d4da2163a1ce617f989b7b02e72e26c9bd595e1e64711f`；原 receipt JSON SHA `b6d66f10cc84d8a4c1e4f215fc1b4de119832e2ff8b2cbe1df1d2846bdec5660`，初图 PNG SHA `2760ac45d6d4effaad5ae49f720e854f6285326d9dc6004ec9d88f9b169a3253`，完整 job log SHA `665630bd35cd1b6916fc7c7bcff4f5484451ed87c65ea7aebe49ec71943d8a81`。

并行 main 的 `e3d5721a`/`0d9b5351` 修改了多库执行链；已完整读取相关 diff 并保留，未覆写其实现。`0d9b5351` 将新增 512 KiB 组合限制仅用于多库 opt-in，原单 React 加本例大 linked resource 路径保留。新 CFT 将记录实际重新构建的包身份，不能沿用本节 packageHash。

### 第四次及最终定向 Chrome CI：20/20 全部通过（本轮正式证据）

继 [run 38253069295](https://github.com/shopable-ai/opendesk-browser/actions/runs/38253069295) 首次完成冻结 JSON 绘制、真实尺寸变化、Stop、Verify、Install 与安装后新文档离线执行之后，浏览器编辑器开始从公共 HTTPS 下载 D3。该轮的旧错误 `0 !== 502` 并非丢失依赖：原 `Network.responseReceived` 为 HTTP 200、无浏览器/Service Worker 缓存，Sidebar 显示并保存正确的 502 字节固定 SHA；**只是旧 CFT 观察器错误地用 `Array.from(ArrayBuffer)` 读取原始持久字节**。后续只将读取改为 `Array.from(new Uint8Array(...))`，不修改依赖管理器和用户组件。中间错误及原始 ZIP 继续保留为旧候选 failure，不能改报 PASS。

[run 38254100852](https://github.com/shopable-ai/opendesk-browser/actions/runs/38254100852)、job `114827561962` 已真实完成所需功能，但机器结果中一项 `status:'PASS'` 被后置对象展开 `...report.browserSource.status='IN_PROGRESS'` 覆写。该测试实际执行通过；新提交仅修正记录顺序，并新增 **20 个项目且每项必须为 PASS** 的最终强断言，不变更产品和用户代码。

最终定向候选是提交 [`93878f441d87e0813546fc37a5298f905bace72c`](https://github.com/shopable-ai/opendesk-browser/commit/93878f441d87e0813546fc37a5298f905bace72c)，[**真实 Chrome CI run 38254646286**](https://github.com/shopable-ai/opendesk-browser/actions/runs/38254646286)、job `114829452737`，GitHub job conclusion **success**，原始 `acceptance.json` **20/20 PASS**，状态 `PASS_REAL_LINUX_JSON_RUN_STOP_INSTALL_BROWSER_SOURCE`。Linux Ubuntu 22.04、Chrome for Testing 155.0.8059.39、独立 profile、headed Xvfb、正常 Chrome sandbox；无 Native Host 安装和权限。原 Chrome PID 退出状态 0，未强制停止，独立 profile 已删除。源码/窗口当前 main 后续的无关提交不能冒充此包的身份。

| 可复验身份 | 真实值 |
| --- | --- |
| 最终 source HEAD | `93878f441d87e0813546fc37a5298f905bace72c` |
| 生产扩展 packageHash | `292a348d80e0b9e446296a12a31941d7718b5088162eb63c755442320e14df3b` |
| ECharts TOC sourceHash | `8d3eedccdf62d90ddafcad3752e184ccd975479b51f649cb0b12595028ab2146` |
| 实际程序 | 482,082 B；235 个固定远端模块 / 1,744,686 B；冻结 JSON 558,789 B |
| 固定 React SHA-256 | `d1eec2e96ed42046ad543a10af7de992aee633ac06017f44f6b917e36451c758` |
| ECharts Run previewId | `27c14494-7a40-4f4b-89bd-0cc897da6f29` |
| ECharts Run documentId | `C39C98A500E0405378E40546F6483477` |
| browser author D3 sourceHash | `ae134b1b4a3fdbe34ab875fcb699ed8806241123a71d612069e4d46f98dd1e6b` |
| browser author D3 previewId | `a499ca37-58cb-4e2b-85d7-63bfd948b824` |
| browser author D3 documentId | `B9EDD2DD221ECAA38409993DBC0D7D95` |
| 执行世界 | `USER_SCRIPT`，原固定 React，而非目标网站 MAIN / window.echarts |
| 原始 artifact | [11750315323](https://github.com/shopable-ai/opendesk-browser/actions/runs/38254646286/artifacts/11750315323)，3,514,521 B，ZIP SHA-256 `b839c5272f0adbce48bc955b8bbb0ee72725f3b206983cfd41d30130f90b996e` |
| 原 `acceptance.json` SHA-256 | `63d54b145d5e33274ecdb929ce0d5ebdd4b76b60072a9e358b7be9e95282786e` |
| 原 ECharts `preview-receipt.json` SHA-256 | `55af1b0264caa097f78ac5050354dd3595a223912054ce403500a22686e10972` |

实测结果：真实 Side Panel JSON 导入不自动运行；明确 Run 后 SVG 柱状图数据 `[1,7,5,0,0,0]`，增删标题引起 SVG bar path 更新、实例不变；真实 Chrome 窗口与 `chrome.tabs.setZoom` 引起容器、SVG 宽度由 268px 到 258px 后恢复；React effect 视图切换 `dispose`；章节跳转；独立 Save 不装/不重跑；受管 Stop 清除节点、实例与迟到回调；Verify 与明确 Install 不重放当前网页；新 documentId 的已安装冻结 JSON 离线执行 ECharts；关闭自动运行后导航不重新挂载并保留旧回执；固定程序没有 CDN 运行时下载请求。

浏览器**仅源码编辑**：在新建 React JSX 组件中顶部可见 `import max from 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js'`；首次“检查依赖”只列来源不下载；第二次明确点击“确认获取”才经真实公共 TLS 请求取得 HTTP 200、502 字节，验证 SHA-256 `691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d`，且 `fromDiskCache=false`、`fromServiceWorker=false`；必须单独“确认固定此版本”。原审核锁、原始 IndexedDB ArrayBuffer、锁身份和无安装前提已实测。此后 Save 只创建 Candidate，不运行/不安装；明确 Run 真正在获准网站显示 `D3 max([2,5,3]) = 5`，Stop 清理，固定版本重跑无新网络。原 `browser-source-approved-lock.json` SHA-256 `48de45b5969e44c7f54f8b7059a3ee997dd425d58e75d614df7a41cf0c011090`，原 `browser-source-preview-receipt.json` SHA-256 `4ea2b13a8236174c31855baa52617343afe9d7027d22c6c03d16dca464e0d684`。

**机器复核索引：** [最终 20/20 机器摘要](evidence/react-url-import-echarts-20261012/ci/38254646286/acceptance-summary.json)，是从已完成的原 GitHub job 日志派生，原始接收数据与截图仍以 CI artifact 为准。旧 run 失败与早期包 hash 保持原样，不当作最新结果覆盖。

**明确剩余/验收边界（不冒充 PASS）**：本次未连接用户 Mac；外部正式 Go Native Host 的分块能力及 MCP 主动大源码通道仍需单独验证；浏览器源码编辑仅用固定 502 B D3 单模块完成真实验收，不等于可编辑任意大型 ECharts 依赖图（完整 ECharts 优先冻结 JSON）；加载中 Stop、navigation 竞态、源码/版本切换、渲染器错误注入、卸载、作者缓存 GC 的所有组合未完成同级原生验证；全仓所有 CI、整体 F3/ZIP、CWS 审核没有因此宣称通过。用户能在 `examples/programs/page-ui-toc-react-direct` 查源码，在“开发”浏览器端按“检查依赖→确认获取→确认固定→Save→Run→Stop”测试小图；JSON 是直接通过原目录窗口导入的冻结程序文件，不是 package.json。

