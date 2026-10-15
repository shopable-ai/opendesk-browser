# ChatGPT 思维导图 R1 · 独立 Page Program

- 程序 ID：`opendesk.chatgpt-mindmap`
- 显示名称：ChatGPT 思维导图
- 运行世界：仅 `https://chatgpt.com/*` 的顶层 `USER_SCRIPT`
- 项目入口：`src/main.js`（多文件 ESM，`@opendesk/ui` 是仓库内置别名）
- 数据流：`单个 assistant DOM → 语义结构 → MindNode → 本地 SVG`。
- **当前交付：可导入真实 OpenDesk Browser 项目结构及测试代码；没有在本次会话完成用户 Mac 的真实 ChatGPT 安装验收。**

## 使用和安装

将本目录放在 OpenDesk Browser 仓库的 `examples/programs/chatgpt-mindmap/`，从**仓库根目录**运行：

```sh
node scripts/validate-program-project.mjs examples/programs/chatgpt-mindmap
npm run build:program -- examples/programs/chatgpt-mindmap
node --test tests/environment/chatgpt-mindmap-r1.test.mjs
```

正式产物默认写入：

`artifacts/programs/opendesk.chatgpt-mindmap/0.1.0/r31-production/<实际哈希>/`

其中有 `program.js`、`program.opendesk-draft.json` 与 `artifact.json`。**路径中的哈希必须使用真实构建输出，本文不虚构。** `artifact.json` 默认 `BUILT_UNVERIFIED`，不是已安装状态。

在产品的「开发」中选择已授权的本地项目、授权 ChatGPT 站点并进行 Page 用户脚本试运行。确认源代码、页面效果与 Stop 后，按既有流程将构建草稿导入生成固定 Candidate，执行 Verification → Available → Installed；安装完成后通过「扩展 → 网页增强」管理。需要 Chromium 的「允许用户脚本」开关，以及 OpenDesk 对该站点和当前文档的正式授权。**不能直接将 `package.json` 当安装清单导入，也不能把 `build:program` 当成已安装。**

## 按回复工作原理

- `chatgpt-adapter.js` 通过 `[data-message-author-role="assistant"]` 找到候选回复，确认唯一正文和唯一的官方复制按钮，只在有把握时插入；用户消息和不唯一的答案跳过。
- 按钮是官方操作组附近的**独立 Shadow DOM 兄弟节点**，不取代官方按钮，也不把 `mount` 的同一选择器传给多个 Page UI 实例。
- 一条回答以 DOM 元素为身份（`WeakMap`）；`Set` 只用于清理。不同回答即使同标题、同正文，也拥有完全独立的树、折叠状态、缩放和视图。
- 行内视图只隐藏该条回复正文的 `display` 与 `aria-hidden`，精确保留原始值；点击「原文」恢复。全屏移动**自有 viewer** 到 `document.body`，不会移动 ChatGPT 的原回复。Escape 回到原按钮。
- 生成时若检测到流式状态或近期内容修改，按钮短暂不可用；已打开视图遇内容更新会出现“刷新”提示，刷新也只读取原所属回复。导航、节点重绘、Stop/pagehide 时清理自己的宿主、监听器与计时器。
- SVG 的标签、标题、备注全部通过 `textContent` 创建，无可信 HTML、外部脚本、网络 API、CDN 或模型调用。

## 可复现测试

```sh
node --test tests/environment/chatgpt-mindmap-r1.test.mjs
python3 -m http.server 48762 --bind 127.0.0.1
```

第二条命令从仓库根目录运行后，在**单独的本地测试浏览器**打开：

`http://127.0.0.1:48762/tests/fixtures/chatgpt-mindmap.html`

该 fixture 会试验 6 条回答、完全相同回答的身份隔离、两个视图并行、全屏/Escape、导图更新、官方工具栏替换、20+ 次切换、SPA 路由、Stop 清理。顶部必须出现 `FIXTURE_PASS`；出现 `FIXTURE_FAIL` 则保留错误，不作为通过。`?preview=1` 会停留在两个打开的导图，用于肉眼查看排版。**fixture PASS 不是已登录 ChatGPT Chrome PASS。**

## R1 限制与待原生验收

1. ChatGPT 官方 DOM 是不可控第三方结构。真实已登录页面若 Copy 按钮位置或语义不同，当前保守策略会跳过按钮，避免错绑；需要在目标 Chrome 采集不含正文的 DOM 结构证据后完善适配器。
2. 当前 OpenDesk `setInstalledPageEnabled(false)` 只撤销未来注入/注册，没有证据证明会即时向已打开页面的 `USER_SCRIPT` 发 Stop。**停用/卸载后旧文档即时恢复需宿主统一的已安装 UI retirement 能力，不能靠本工具猜测安装状态。** 页面离开、正式受管 Stop 的 DOM 清理已登记；正式已安装禁用路径需另行验收。
3. 语义提取是确定性结构化呈现，不调用 AI 改写或总结；对大纲、表格和长代码做有界截断，原文始终保留。
4. UI 没有 XMind 编辑/导出，安全与包体积优先；目前不承诺 CSP 严格页面、320px、真实 200%、触控板及所有 ChatGPT 版本均 PASS。
5. 不修改 `shopable-station`、不复制其 XMind SDK/JSX/Next.js 代码，复用 `{id,title,content,depth,children}` 数据模型的概念与“只读、折叠、缩放、原文切换”的交互原则；避免许可证、4 MB 资源和页面执行世界耦合。

## R1.1：Mindbank XMind 真实源码移植

- `src/mindbank-xmind-theme.js` **直接从参考仓库移植并实际调用** `xmind-renderer-seams.ts` 的路径 ID、解析与分支色算法，以及 `xmind/skin.ts` 的完整静态主题 JSON；来源 blob SHA 在新模块顶部。
- 显示复用：蓝色中心节点、分支渐变颜色、层级递进、圆角主题和曲线连接。主入口仍是逐条 ChatGPT AI 回复。
- **不是完整版 XMind SDK**。参考实现依赖 `JSZip/Workbook/Topic/Dumper/_SB_` 和四个全局 JS 文件，约 4.04 MB。当前 Page Program 执行代码和资源预算不支持直接打入这套二进制；分发授权/CSP 也未核实。保留本地 SVG 只读渲染，不能宣称像素级完全一致。
- ChatGPT DOM 是渲染 HTML，不是原 Markdown；`extract.js` 是必要的网页语义适配。真实登录 Chrome 的操作栏与视觉效果仍须现场验收。
