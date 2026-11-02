# ScrapyJS 共享 Chat 本轮交付记录

日期：2026-11-02。范围：原 ScrapyJS 工具、原安装包与固定离线预览；保留 `local_codex`，只记录其阻塞。未修改 Browser Host、Authority、Provider 或共享 Chat 实现。

## 可见结果与旧入口修复

日常 Chrome 的两个“scrapyjs 采集 · 纯模拟离线预览”窗口实际打开 `examples/sidebar-tools/scrapyjs/preview/preview.html`。固定文件仍是 1.8.2，AI 打开“这里是 AI 对话的预览占位”。这是已复现的交付遗漏。现将原构建器生成、输入来源核对通过的 1.8.7 `preview-final` 候选三件套逐字节同步；分别刷新两个窗口后，都显示“AI 采集助手”、共享 Dock 分隔手柄、输入框与发送控件。另在其中一窗核对了未发送文本、Esc 焦点返回及重开保留。

用户随后授权创建新浏览器窗口继续测试，尚未指认最初投诉的具体窗口；因此不把此修复写成用户已确认问题消失。核查的日常 Chrome 两个 Profile 扩展列表中均未安装 ScrapyJS，没有擅自改变其安装或数据。

Chrome for Testing 原安装版和本轮新窗口均显示 1.8.7 共享 Chat。新窗口打开真实豆瓣目标网页后，工具报“当前网页信息不可用”，刷新和从扩展列表重新进入仍失败，发送与采集被禁用。这是独立的未解决阻塞，未以旧窗口历史成功替代。未触发新推理、采集或数据修改。

## 身份与运行边界

- 正式包：`../scrapyjs.opendesk-tool.json`，1.8.7，781476 bytes；SHA-256 `31681157e0f90c9912d193caa2580781eb0fa27d2f36feb215e152f03a8627b4`。
- 原打包器收据 buildId：`ff8adf2d9dabe0576ce0be7a5fcf8cc4dc3e14012cfae8c2847393b1e52046ba`；Task 0.6.2，权限和身份不变。来源、输出和四项 designSources 的长度/SHA 独立核对；`--check-project` 为 `PROJECT_PACKAGE_MATCH`。
- 固定预览 HTML：4725827 bytes；SHA-256 `9b32bb9a77858d74d4c6f6806a5427dcd46161b52bffbfbd75926a3ac4a3a8aa`。1386 项输入核对通过；三件套与生成候选相同。仅模拟 transport、内存状态、网络关闭。
- 安装态浏览器：Chrome for Testing 149.0.7827.55，Profile `/Users/shopme/Library/Application Support/Google/Chrome for Testing/Default`；扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`。
- 环境为静态 development 包，无 WXT serve 连接；本轮未重建、重载或覆盖 Browser 产物，未改变日常 Chrome 配对。
- 经原生 DevTools 只读观察，沙箱加载 React 19.2.0 与 `sidebar-shared-ui.js`；公共导出包含 Frame、Dock、session。三者内存函数 SHA 与加载目录内同一实现匹配，sourcemap 对应组件、session 与两份 CSS 和当前源码一致。完整内存 bundle 字节未核验；读取 blob 源码被既有 CSP 拒绝，未绕过。

## 修复与验证

Action Adapter 允许普通 `_source` 字段，仍拒绝引擎保留字段和原型污染字段；CSV 提案允许既有列表、详情及已启用 `splitPublication` 固定结果列，未知字段仍拒绝。请求终态清理期间 Stop 等待同一 CAS 收据并抑制提案交付；失败保持 unknown，只清理本请求，不重放推理。共享测试仅补齐已有 React Aria 依赖解析；预览移除旧占位挂载。

复用同源码已读回的定向结果：AI/原业务/CSV 72/72、包与安全 9/9、预览运行时 5/5、共享布局/发送 5/5，通过。固定预览同步仅改变生成物及说明，没有新业务源码变化；本轮重新核对包同源、预览输入与字节，以及上述实际窗口。未重复全量测试或 Browser 构建。

## 场景状态

| 场景 | 状态 | 已有证据与缺口 |
| --- | --- | --- |
| S1 共享 Chat 开合与输入 | PARTIAL | 已安装 1.8.7 原窗口的 Enter/Shift+Enter/Esc、重开保留通过；新窗口显示共享 UI，但页面读取失败。原投诉窗口尚未由用户确认。 |
| S2 真实提案→应用→保存 | BLOCKED | 已安装 1.8.6 真实发送返回 `E_CODEX_UNSUPPORTED`；1.8.7 仅审阅/取消，无新派发。配置未被 AI 修改。 |
| S3 CSV 名称与排序 | PASS | 1.8.7 真实原始 CSV、自定义 CSV 与 JSON 20×12 单元格一致；仅表头别名和自定义顺序变化。 |
| S4 模型索取缺失 DOM | NOT_TESTED | 协议仅有定向 Node 证据，无真实成功模型。 |
| S5 原保存/采集/下载链 | PARTIAL | 独立保存副本保留，1.8.7 受控采集 completed/released、20 行12列，下载逐格核对；真实 AI 应用保存及独立“本机试采”未测。 |
| S6 取消及异常恢复 | PARTIAL | 真实错误/输入保留、目标不可读拦截、1.8.7 审阅取消后无 pending 围栏；活跃推理取消/超时/unknown 等主要为 Node 覆盖。 |
| S7 预览与安装身份 | PARTIAL | 固定旧入口已修复，两窗和安装版新窗显示共享 UI，内存实现指纹匹配；不代表最初用户投诉已确认或推理成功。 |

原真实 Provider 请求 ID：`b0aed09d-c2ec-4687-97fd-f765112465aa`。最终 1.8.7 审阅取消：`3673e2d1-17f8-4cee-9a04-0ee8cd7e2bf1`。真实采集 run：`2e237163-3f37-4e71-b191-d61b652801cf`，result：`1750777a-55c1-49d0-9807-89192874e093`。详细收据和文件 SHA 见[机器可读观察记录](shared-ai-local-20261102.json)。

最终独立评分为 `NOT_SCORED`；[专家记录](shared-ai-experts-20261102.json)保留中间评审与修复复核，不能当作当前候选最终六维评分。原生 IME、视觉遮挡与 production 为 `NOT_TESTED`；截图 API 报 `native_hook_stdin_oversized`，没有截图证据。缩放/物理宽度矩阵按当前仓库约束不在本轮范围。
