# 本地 D3 max 导入探针

零 capability 的可安装 Side Panel 工具。保留原始 [d3-array v3.2.4 max.js](https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js) 和 [ISC 许可证](https://raw.githubusercontent.com/d3/d3-array/v3.2.4/LICENSE)，来源、字节数及 SHA 见 `vendor/provenance.json`。这里只使用 d3-array 的 max 函数，并非完整 D3 或历史 d3@3.2.4。

在仓库根目录使用现有 node_modules 中的 esbuild，离线构建；不需要 npm 安装或新增依赖：

```sh
node examples/sidebar-tools/import-max-probe/build.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/import-max-probe --out docs/framework/workstreams/evidence/import-r77-20261014/tool-build/import-max-probe-final.opendesk-tool.json
node examples/sidebar-tools/import-max-probe/validate.mjs docs/framework/workstreams/evidence/import-r77-20261014/tool-build/import-max-probe-final.opendesk-tool.json
```

`build.mjs` 检查 vendor SHA 后将普通本地 ESM import 编译成 `build/tool.js` Classic IIFE。`tool.config.json.files.js` 指向该文件；正式 JSON 由原有打包器生成。许可证全文随 JS 一起进入导入包。运行时无 GitHub/CDN 下载、不调用 chrome/page，也不引入新的 loader、Host 或安装器。

父任务在同一已验证扩展候选上完成真实安装：

1. 核对工具 JSON 文件 SHA、扩展实际 ID/路径及候选身份。
2. Side Panel「工具 → ＋ 导入」选择正式 JSON，审阅空能力列表，确认安装。导入、审阅和安装阶段不应出现本工具的执行结果。
3. 主动打开 `D3 max import probe`。在该工具 opaque-origin iframe 内读取 `#import-result`，应为 `Tool D3 max = 5`。
4. 展开 Sandbox diagnostics，记录实际 `typeof chrome/page`、执行次数、当前 frame/session；预期无 chrome/page 能力，首次执行次数为 1。诊断是实际 typeof 文本，不是隔离安全证明。
5. 返回工具列表以关闭当前 frame，再主动打开；检查新的 frame/session，结果仍为 5，新 frame 的执行次数为 1。该计数只属于当前 root，不代表跨安装或跨会话持久执行次数。
6. 记录真实原生输入、包 SHA、扩展候选身份和原始观察；检查 360/400/600px、暗色、键盘 summary 焦点。Node 静态检查不能代替这些视觉验收。

2026-10-14 父任务已在用户本地 Mac CFT 155.0.8059.39 完成两个探针的真实导入、安装、打开、关闭、重开和卸载。原始结果见 `docs/framework/workstreams/evidence/import-r77-20261014/tool-chrome-02/`；扩展 packageHash 为 `01a79da5b9f3cb3e3041e26f6acdf766bded7fb0645743939af24db220732c75`。D3 实际输出 5、opaque origin 为 null、无 chrome.tabs/page、运行期无网络；Classic 真正 emit 一次并验证顺序。两项 CFT 清理均成功。输入使用 Chrome CDP 的真实 pointer/keyboard；macOS 原生输入、Native Host、视觉宽度/暗色全量及 Chrome SHA/onerror 负向仍 NOT_TESTED，不将正向结果提升为这些场景。

现有 S10/v2 多 Classic 路径独立支持 `files.dependencies`，打包为有序 `{name,sha256,code}`；原 `bridge.js` 在每份依赖加载前校验该份 SHA，逐份等待 Blob Classic 的 load/error，全部成功后才执行主 JS。后续资产坏 SHA 不会撤销已运行的前序资产。对应 `tests/environment/sidebar-tool-multiscript-r72.test.mjs` 检查顺序、首份坏 SHA 与失败停止。本例只需要单个编译后的 v1 IIFE，不证明多 Classic 原生路径已关闭。

真实验收复用已接入原 `tests/framework/page-import-fixed-tools-cft.mjs`：指定 `OPENDESK_IMPORT_MAX_TOOL_PACKAGE` 或 `OPENDESK_IMPORT_CLASSIC_TOOL_PACKAGE` 时只运行所选探针；两者均未指定时保留原默认 React/Vue 流程。每次运行前计算实际包 SHA，检查空能力与 Classic 源码，安装后校验 registry 字节身份；检查导入/安装不创建 iframe、主动打开结果、真实 opaque origin、chrome.tabs/page、关闭/重开/卸载及截图。iframe Network 观察在脚本恢复前启用，检查运行期间无 HTTP/WS 导入请求。它只是实现完成的验收驱动，未在本 sidecar 启动 Chrome。

S10 可选探针构建：

```sh
node examples/sidebar-tools/import-max-probe/classic/build.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/import-max-probe/classic --out docs/framework/workstreams/evidence/import-r77-20261014/tool-build/import-classic-probe.opendesk-tool.json
node examples/sidebar-tools/import-max-probe/classic/validate.mjs docs/framework/workstreams/evidence/import-r77-20261014/tool-build/import-classic-probe.opendesk-tool.json
```

`classic/vendor/` 保留固定 mitt@3.0.1 原始 UMD、MIT 许可证和 provenance SHA。v2 `files.dependencies` 依次加载该 UMD 和第二份消费脚本；主脚本真实订阅并 emit，结果应为 `Tool Classic mitt = 5`，`#import-order` 应为 `order = mitt>second>main; emits = 1`。无 loader 修改。SHA/顺序/onerror 的 Node 负向证据复用既有 multiscript 测试；Chrome 本分支只测试正向，不声称 Chrome 负向全部通过。

父任务持有独立 CFT/profile 后串行运行以下命令（本 sidecar 未执行）。`/absolute/candidate/dist/production-developer` 也可接受，但 verifyPackage 始终按 production 无 source map 模式校验；候选须已经完整构建、验证，不能借目录名称证明身份。省略其中一个 TOOL_PACKAGE 变量可单独运行对应探针。

```sh
OPENDESK_FIXED_TOOLS_CFT=1 \
OPENDESK_FIXED_TOOLS_CANDIDATE_DIST=/absolute/candidate/dist/production-developer \
OPENDESK_FIXED_TOOLS_EVIDENCE_DIR=/absolute/parent-owned-native-evidence \
OPENDESK_IMPORT_MAX_TOOL_PACKAGE="$PWD/docs/framework/workstreams/evidence/import-r77-20261014/tool-build/import-max-probe-final.opendesk-tool.json" \
OPENDESK_IMPORT_CLASSIC_TOOL_PACKAGE="$PWD/docs/framework/workstreams/evidence/import-r77-20261014/tool-build/import-classic-probe.opendesk-tool.json" \
node --test tests/framework/page-import-fixed-tools-cft.mjs
```

最新工具包：D3 SHA `fecc6cfcf224250912e20bd3e59ae3c5ddf67f9ecf0365bf10baee426a9799f4`（3,126 B）；Classic SHA `1c8124021d84f65e193157ff885d880174791924bd72c9ca9b9ab3acfa995f9a`（4,452 B）。早期 `import-max-probe.opendesk-tool.json` 留作原始证据，它缺少新增 chrome.tabs 诊断，不用于最新驱动。
