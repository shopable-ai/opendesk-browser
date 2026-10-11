# OpenDesk Browser R22：Markdown 小工具与网页剪藏

日期：2026-10-11。性质：已提交实现说明及验收待核清单；**不是最终 Chrome 原生通过证明**。

## 已落地源码

| 职责 | 路径 |
|---|---|
| 可信网页抽取及 URL 安全校验 | `src/page-clip/convert.js` |
| Content Script 协议与抽取服务 | `src/page-clip/page.js` |
| 剪藏权限、网站授权独立命名空间 | `src/page-clip/policy.js` |
| 固定 Content Script WXT 入口 | `src/entrypoints/page-relay.js` |
| 受限宿主桥、安装、更新、撤权与卸载 | `src/ui/sidebar-tools.js` |
| v1 批准能力清单 | `src/ui/sidebar-tools/package.js` |
| 官方剪藏推荐安装入口 | `src/ui/tool.html` |
| 发行包复制与验证清单 | `scripts/prepare-public.mjs`、`scripts/verify-package.mjs` |
| 两个独立工具源码与 JSON | `examples/sidebar-tools/web-markdown-clipper/`、`examples/sidebar-tools/markdown-workbench/` |
| 自动化回归与生产包 Chrome E2E | `tests/environment/markdown-tools-r22.test.mjs`、`tests/framework/markdown-tools-native-r22.test.mjs` |

完整模块继续采用 `opendesk.sidebar-tool.v1`；没有添加新的顶层 Tab、远程市场、权限通配桥或 SW 动态模块。

## 安装与使用

- **网页剪藏官方安装**：Chrome Side Panel → 工具 → 网页剪藏 → 安装 → 查看能力和版本 → 确认安装 → 回到工具列表，先为当前网站授权，再打开。
- **网页剪藏本地安装**：Side Panel → 工具 → ＋ 导入 → 选择 `examples/sidebar-tools/web-markdown-clipper/web-markdown-clipper.opendesk-tool.json` → 审查能力 → 安装。
- **Markdown 工作台本地安装**：同样入口选择 `examples/sidebar-tools/markdown-workbench/markdown-workbench.opendesk-tool.json`。工作台只声明 `user.export`，无需网站读权限。
- 安装、导入预览不会运行工具自定义 JavaScript。独立工具 Tab 仍复用原来的 ↗ 入口和隔离 iframe。
- 两个 JSON 分别可按 `npm run build:sidebar-tool -- examples/sidebar-tools/web-markdown-clipper` 与 `npm run build:sidebar-tool -- examples/sidebar-tools/markdown-workbench` 重建；正常打包输出写入 `artifacts/sidebar-tools/<id>/1.0.0/`。
- 关闭或切换工具会销毁 iframe，工作台编辑内容可能丢失，请用户立即复制或下载保存。工具内容不塞入 Quick Notes 或 8 KiB/32 KiB R1 storage。
- 工作台预览基于纯 DOM `createElement/textContent`，不会将 Markdown 转为可执行 HTML；支持常见 GFM 子集（标题、引用、列表/任务、围栏、表格、链接/图片安全占位）。不是完整 Markdown/GFM/数学公式渲染器。

## 安全能力合同

```text
安装并批准 v1 包 + 用户当前窗口/标签页 + 独立网站 Origin 授权
  → Side Panel 验证真实 iframe source、opaque origin、会话 token、请求类型
  → 再从 storage.local 读取安装包及站点授权
  → CurrentPageTarget 精确 revalidate(tabId, frameId=0, documentId, URL, origin)
  → tabs.sendMessage 指定 frameId=0 与 documentId
  → 可信 ISOLATED Content Script 再验 sender(extension identity、tool identity、hostInstanceId)
  → Content Script 再取实际已安装包及独立剪藏 Origin 授权
  → 读取当前 DOM（文章/选区/链接），固定离线转换、明确大小预算
  → 完成前复验网页 URL、安装状态、Origin 授权
  → 宿主复验当前文档与授权，返回临时数据给这一工具会话
```

`page.clip` 只映射 `clip.article` / `clip.selection` / `clip.link`，与 `page.toc` 完全不同，TOC 许可不能自动授权正文。工具本身不能调用 `chrome.tabs`、`chrome.scripting`、任意网络/DOM API。

`user.export` 只开放 `clipboard.writeText` 与 `file.download`，内容上限 150 KB、文件名限安全 `.md`；Chrome 的实际复制/保存结果须分别验证。复制拒绝时显示手动复制提示，下载被拒绝时显示失败而不伪造文件落盘。

Content Script 仅支持当前页面明确触发的请求；不抓取历史对话、Cookie 或身份令牌。输入 HTML 和 Markdown 不会被直接插入扩展宿主的特权 DOM。更新增加新权限仍需手动审查，卸载删除本工具数据及剪藏 Origin 授权。

## 边界与尚未通过的项

- **工具独立 Tab 读取网页：NOT_SUPPORTED**。新 Tab 成为活动标签页后无法安全沿用侧栏旧网页身份；必须引入用户明确选择来源标签页与文档的窄接口，避免误读其他 Tab。现阶段长篇内容应在侧栏直接下载为 .md 或复制后在独立工作台中打开，不能伪装跨标签读成功。
- 文章提取只依赖保守 DOM 启发式；没有将 Readability/Turndown 作为未经许可证/体积/CSP 审核的第三方依赖。需要真实网站样本进一步衡量正确率。
- 特殊 MathML、复杂嵌套列表、跨行/列合并的表格、动态折叠正文不保证精确。复杂表格会明确拒绝，超限会明确报错，而非静默截断。
- 自动复制、系统保存对话框、本地文件物理存在，以及 360/400/600 CSS px、暗色、200% 缩放和 Chrome 重启均须真实浏览器证据；未执行不得称为 PASS 或 95 分以上。
- 新增 `tests/framework/markdown-tools-native-r22.test.mjs` 是正式生产包 Chrome for Testing **本地网页 fixture** 冒烟测试；通过也不等于第三方真实网站测试通过。
- 仓库云端 GitHub Actions：`.github/workflows/markdown-tools-r22.yml`；应记录对应 SHA、步骤结论及截图路径后才宣布该候选验收结果。

## 验收与重建

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/environment/markdown-tools-r22.test.mjs
npm run check
npm test
npm run build:sidebar-tool -- examples/sidebar-tools/web-markdown-clipper
npm run build:sidebar-tool -- examples/sidebar-tools/markdown-workbench
npm run build
npm run build:dev
npm run verify
npm run pack
# 生产 dist/production 的独立 Chrome for Testing；需受控 Chrome binary + 显示服务器
CHROME_BIN=/path/to/chrome xvfb-run -a node --test tests/framework/markdown-tools-native-r22.test.mjs
```

不得把本地 fixture 当成真实网站的可用性覆盖。验收报告需记录独立 profile、Chrome 版本、目标 URL、扩展 ID、截图、包哈希、下载文件及结果。

## P1：AI 对话导出 Markdown（仅设计，不在本轮实现）

技术可行前提：针对用户**主动选定**的一条 AI 回答或多轮对话，采用站点版本明确、可审计、可撤权的适配器，保留代码块、公式和引用，实时流式内容稳定后再导出。ChatGPT 多回答/历史分叉、编辑版本、多个 H1、SPA 导航不能用单一粗暴 selector 假定。必须复用 R22 的真实工具身份、Tab/主文档验证、站点 Origin 权限和大小上限；不得自动批量读取会话历史或将内容送到第三方服务器。

工作量评价：在现有受限剪藏通路下可以继续设计，但**当前未实现 AI 对话导出**，不能将一般正文转换当作具备对话语义的完整导出。
