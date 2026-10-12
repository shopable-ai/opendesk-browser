# Cookie Editor R1 — UI-first implementation

- 日期：2026-10-12
- 仓库：`shopable-ai/opendesk-browser`；仅现有 `main`
- 目标：在现有工具 Tab 安装机制下新增 Cookie Editor 的可用核心 UI，不提前发布未实现的 browser Cookie SDK。

## 源码与变更

- `examples/sidebar-tools/cookie-editor/{tool.config.json,src/*,README.zh-CN.md}`：可安装工具及本地临时 Cookie 工作区。
- `official-tools/catalog.json`：官方可选工具登记，复用现有打包、签名摘要和手工安装流程。
- `src/sidebar-tools/bridge.js`：`data-sensitive` 的输入不进入宿主草稿诊断；沙箱仍没有直接 Chrome API。
- `src/ui/sidebar-tools.js`：原 `user.export` 下载机制只增安全的 `.json`/`.txt` MIME 和扩展名，保留大小/路径限制。
- `tests/environment/cookie-editor-ui.test.mjs`：格式/校验/源码安全合同；`tests/environment/official-tools-catalog-r45.test.mjs`：官方 Catalog 七项与预装策略。

## 产品范围与边界

- 已设计/实现：列表搜索、遮挡值/显示值、增删改、清空确认、JSON / Cookie Header String / Netscape 导入导出、文件读取、确认合并、导入数量限制和属性约束。
- **实时浏览器 Cookie：NOT_IMPLEMENTED。** 数据仅在沙箱内存，界面强制展示本地演示身份。真实 Cookie 不会读取、修改、导出或存储。
- 不添加新的 `cookies.manage` capability，不修改 MV3 Cookie 权限、SDK/Service Worker 和真实浏览器请求处理；后续须另行设计授权与生命周期。
- 当前字符串格式丢失原 Cookie 元数据；Netscape 不支持分区 Cookie，拒绝降级导出。JSON 保留分区键等字段。
- 敏感内容不进入主机草稿恢复通道；用户主动选择剪贴板/下载仍可能暴露本地数据，界面显式告知。

## 验收矩阵

| 维度 | 本轮检查点 | 状态 |
| --- | --- | --- |
| 核心纯逻辑 | JSON、Header、Netscape 解析与往返；重复、跨域、SameSite、前缀、过期、数量与长度负例 | V8 隔离执行已验证，正式 Node 测试待运行 |
| HTML / CSS 合同 | DOM ID、敏感输入标识、响应式 300–520px、200% 缩放 | 静态核查中；真实 Chrome NOT_TESTED |
| 可信文件下载 | 原 host Download 白名单：`.md` / `.txt` / `.json`；UTF-8 ≤150KB | 代码合同；Chrome 下载确认 NOT_TESTED |
| 工具打包 | 复用 `scripts/build-sidebar-tool.mjs` 和官方 Catalog SHA | 源码已审阅；Node/WXT 构建 NOT_TESTED |
| 主仓库无关影响 | 禁止改变其他工具安装/停用/权限及原生 Cookie 能力 | 源码设计不新增 Cookie 业务权限；全量回归 NOT_TESTED |
| 真实 Mac Chrome | 工具安装、键盘、focus、300/320/360/420/520 与缩放 125%/200% | NOT_TESTED |

完成等级只报告实际运行结果，不将任何 `NOT_TESTED` 项计算为 95 分或正式 F3/ZIP PASS。
