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
首个源码提交：`384274bd25c83120660af5a47ed3508541937f12`。提交准备中发现原 `.gitignore` 忽略七份 `.log` 档案；后续提交显式纳入本任务证据目录的这些原日志，确保 manifest 引用完整，不删除或改写其内容。

保留的明确边界：用户 Mac 未访问；正式 Go Host 分块和主动 MCP 大源码路径未完成；浏览器单文件仅小型 ESM 图；作者缓存按原持久规则保留，尚无明确删除/GC 入口；多版本/下载中 Stop/导航等全部真实异常组合、独立 F3/ZIP 仍需各自原生证据。Page 自包含执行源的版本/更新/卸载走原记录，并不等于清空作者原始缓存。
