# 网页剪藏 R2 · 区域点选源码实施与验收证据（未晋升）

- 任务：`OD-WEB-MARKDOWN-CLIPPER-REGION-PICK-R2`
- 唯一分支：`main`；原始需求：[R1](region-picker-r1.zh-CN.md)
- 记录：2026-11-11；状态：**SOURCE_IMPLEMENTED / PREVIEW_STAGE_SYNCED / PACKAGE_NOT_PROMOTED / CHROME_NOT_TESTED**
- 关键结论：**PARTIAL**。正式业务源码已经有第五种「区域」模式及可信 Content Script 点选链路；当前已发布的 `1.2.10` 安装包**尚不包含**新功能，不可向用户声称可直接安装使用或已通过真实 Chrome。

## 1. 用户真实目标与本轮增量

在 ChatGPT、Claude、Gemini 等已授权普通网页上，点击「网页剪藏 → 区域 → 点选网页区域」，鼠标悬停显示候选 DOM 容器，点击一条已加载长回复即可自动转换 Markdown 并出现在原侧栏；不拖动文本选区，不另按「转换」，通过已有「复制 / 下载 .md / 保存摘录」操作，仍由用户主动保存。

本轮仅修改现有 `page.clip` 路由与项目源码，不改工具 ID，不重建 Converter/Runner/数据存储。原来的「文章 / 选区 / 引用 / 链接」保留。

## 2. 实际写入的代码与契约

| 路径 | 差量 |
| --- | --- |
| `src/index.html`、`src/style.css`、`src/main.js` | 第五种区域模式、320px 五列布局、开始/取消/重新选择、错误/流式快照状态；旧预览/保存/复制/下载重用；迟到结果按页面 epoch 与版本丢弃 |
| `trusted/region-picker.js`（新） | 单次悬停容器高亮、单击或聚焦后 Enter/空格、↑/↓ 调层级、Esc、超时、页面离开和事件清理；过滤表单/编辑区、根和多轮候选 |
| `trusted/page.js`、`trusted/policy.js` | `clip.region`、`clip.region.cancel`；基于现有工具身份、页面来源、安装 epoch 与站点授权的验证；点击立即使用原有 `domToMarkdown` 转换器；撤权触发取消 |
| `src/ui/sidebar-tools.js`、`src/sidebar-tools/bridge.js` | 有限操作清单、`pickId` 验证、现有 `tabId / frameId:0 / documentId` 路由、会话校验、110 秒 Side Panel 读请求上限；取消走相同可信通道 |
| `preview/mock-host.js`、`preview/stage.html` | 原正式 HTML/CSS/JS 源绑定生成舞台；隔离的模拟长回复 A（36 章）、B（4 章）、单击/范围调整/Esc、流式/拒绝/超限/读取失败模拟，标识 `UI_PREVIEW_ONLY` |
| `tests/ui.test.mjs`、`tests/region-picker.test.mjs` | 新区域交互、取消、旧回执丢弃、旧模式回退、单条回答隔离、输入框拒绝、Esc 清理、流式快照相关自动化测试源码 |

交互预览正式入口 `preview/index.html` 保持跳转到 `prototypes/sidebar/react-preview/index.html?tab=tools&tool=web-markdown-clipper`。这个预构建 React 页面**尚未重新运行正式生成命令并实测**；`stage.html` 与源同步不等于 React 页面通过验收。

## 3. 测试和可复核证据

- 已完成：通过 GitHub 读取并回写上述源文件；区域选择器 JS 源码经 V8 语法检查，模拟环境直接运行仓库中 6 个 `region-picker.test.mjs` 用例（增加 Enter 阻止原链接导航）：**6/6 PASS**。但这不是本地 `node --test`，也未驱动 Chrome。
- 已完成：在连接器 V8 受限环境中模拟运行 `ui.test.mjs` 测试夹具 **27/28 PASS**；剩余 1 项因该环境缺少 Node `Buffer`/动态 `import` 无法执行，**不能**归类为真实 FAIL 或 PASS。
- 已完成：`preview/stage.html` 按 `scripts/preview/clipper-stage.mjs` 的源码顺序、离线 CSP、正式 CSS Token 与 SHA256 元数据重新生成。来源 SHA256：`6b02bf51b7ab6b533cfda312d26b3461163d00b9b544add4ec89c8006974c62e`；本次舞台 SHA256：`267c373b5536629af487adfd90e6737b7feadbad73cd2f243c8d13f2789ccb02`。这些是代码层一致性检查，不能替代浏览器实测。
- 尚未执行：`node --test projects/web-markdown-clipper/tests/*.test.mjs`、`npm run build`、`node scripts/build-sidebar-tool.mjs ... --check-project`、app-ci、React 同源预览重构建、真实 Chrome 安装/授权/保存/读回/升级；**退出码：N/A，状态：BLOCKED/NOT_TESTED**。
- 当前 `tool.config.json` 和发行包均仍为 **1.2.10**；源码已变化，正式包和当前源码不一致，`--check-project` 在完成测试/候选包晋升前**预期不会通过**。不要通过取消测试或同版本覆盖跳过正式发布闸门。
- GitHub Actions 针对本轮主分支推送自动排队（`markdown-tools-r22`、`app-ci`、`sidebar-preview-contract`），记录时状态为 `queued`，还没有 PASS/FAIL 结论。队列并非测试通过证据。
- 本地连接器：Codex 当前工作区无法连接，OpenDesk Mac 本机通道收到 429/UNAVAILABLE，故无法执行真正的本地构建/Chrome 操作。

## 4. 关键风险与反方攻击（不得标记已解决）

1. **多 Provider DOM 不一致**：缺少 `article`/消息语义的复杂多轮会话可能把多条回复误识为一个普通容器；应在 ChatGPT、Claude、Gemini 各测长回答并补可维护的专用适配器，不将选择器写入 Browser Framework。
2. **激活/取消竞态和导航**：90 秒选区会话、110 秒 UI 回执超时、权限变化、Tab 切换和关闭时需要 Chrome 实测 event cleanup、旧请求拒绝及 Host 路由稳定。
3. **Markdown 保真与大小**：当前共享 `domToMarkdown` 为 150,000 UTF-8 字节处理上限，低于摘录存储正文的 160,000 字节；这属于既有差异。本轮不截断或扩大权限。必须检查表格/数学/长代码、完全加载、保存后读回哈希和大小边界。
4. **交互预览未完整重建**：`stage.html` 可用于静态源码比对，但正式 React 预构建 `index.html` 尚未本地重构和点击回归。
5. **发行工序缺口**：新源码未通过正式候选构建、测试晋升、原位升级与真实 Chrome 读回，不能给出发布版本或安装成功保证。

## 5. 本地继续执行（唯一后续剩余任务）

在有完整仓库及 Chrome 的机器上：

```bash
git switch main && git pull --ff-only
node --test projects/web-markdown-clipper/tests/*.test.mjs
node --test tests/environment/markdown-tools-r22.test.mjs tests/environment/sidebar-tools-host.test.mjs
node scripts/preview/build-sidebar-six-react-preview.mjs
node scripts/build-sidebar-tool.mjs projects/web-markdown-clipper --check-project
npm run build
```

注：具体 React 预览构建命令与 app-ci 命令须查源码帮助和当前脚本后确认；旧包检查是为核实当前状态，测试完成前不应期待 PASS。修复所有失败，按仓库发行协议**提高正式版本号**、构建候选包、验证、`--promote-from`、`--check-project`，再真实 Chrome 同 ID 升级；不得先卸载。测试单条/多轮/流式/权限/导航/Esc/超长正文、复制下载、保存重启读回和旧用户数据保留。输出命令退出码、截图/录屏或 DOM 与 Host 回执、包 SHA、最终提交。

**结论：目前仅证明源代码交付及受限 JS 烟雾检查；没有达到 R2 正式安装与 Chrome 验收 95 分门槛。**
