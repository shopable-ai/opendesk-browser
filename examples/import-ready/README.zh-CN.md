# R24.2 · 免手工编译 Page React/Vue 可直接导入的测试草稿

这两个 `.opendesk-draft.json` 由仓库原有 `scripts/build-program-project.mjs` 在 [GitHub Actions](https://github.com/shopable-ai/opendesk-browser/actions/runs/38132269374) 真实构建，包含预先生成的普通 JavaScript 和只读的多文件源码快照。它们**不是已安装插件，也不是独立标签页应用**。React 19/Vue 3 的运行时由构建后的 OpenDesk 扩展内置，并非放在每个草稿里。

| 可直接导入 | 文件 | 固定源码 SHA-256 |
| --- | --- | --- |
| React 19 原位 UI | `page-ui-react-direct.opendesk-draft.json` | `34b22968dacd96ad4f706be99e44aee5f46479f0cd82fb5e07cec5eea7ea4d52` |
| Vue 3 原位 UI | `page-ui-vue-direct.opendesk-draft.json` | `ca7c8e01193dfe1868244809bcbf440e15d073b9b109fafde49e02a842694885` |

## 手动导入（不需要自己运行 npm/Vite）

1. 在 Mac 上拉取最新 `main` 并构建/加载仓库对应 MV3 扩展；若本机工作区有其他 Agent 的未提交改动，请先按 `AGENTS.md` 安全核对，切勿强制覆盖。
2. 从仓库根目录启动标准网页服务：`python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`；Chrome 访问 `http://127.0.0.1:43111/demo-form.html`。
3. Chrome 扩展详情中确认网站权限和「允许用户脚本」；打开同窗口 OpenDesk Side Panel。
4. 进入 **发现 → 导入**（完整任务目录）；在 **导入任务包 JSON 或 JavaScript 草稿** 中选择本目录的 React 或 Vue `.opendesk-draft.json`。若导入发生在独立目录标签页，导入会转发到**同窗口已打开**的 Sidebar。
5. 返回 **开发**，切换为**直接编辑**而非「本地项目」；核对源码快照和 `Page · DOM 试运行`，展开 **网页 JavaScript 试运行**，点击 **在当前网页试运行**。
6. 「文本读取」区域旁应出现真正的 React/Vue Shadow DOM UI。点击「高亮段落」→ 对应 `#sample-text` 轮廓和 OpenDesk 标记出现，再次点击撤销。
7. 使用原 previewId 的「停止受管 UI」，确认组件 DOM、页面标记、样式和监听器释放。**导入成功、页面出现按钮、预览通过都不等于已安装或自动启动**。

如果需要修改示例，不要修改导入草稿中的只读源码快照。直接编辑如下项目的 `src/main.js` 并通过 **开发 → 本地项目** 的已授权目录运行：
`examples/programs/page-ui-react-direct/` 或 `examples/programs/page-ui-vue-direct/`。本地源码模式无需手工编译，保存后有意点击 Run 才操作网页。

## 可重复自动检查

```sh
node --test tests/environment/page-ui-no-build-r242.test.mjs tests/environment/page-ui-import-drafts-r242.test.mjs
```

默认测试网站范围只允许 HTTP `127.0.0.1:43111`，排除 `/private/*`。localhost 43112、HTTPS、其他域名不应执行；Chrome Site Access 和固定版本授权是另外独立检查。

完整原生验收见 `tests/framework/page-frameworks-r242-native.mjs`，使用真实 Chrome for Testing 和已有 Native/MCP 驱动。未测的 SPA / BFCache / 撤权主动回收、20 次独立 Run/Stop、暗色/CSP/200%/窄屏不能自动记为 PASS。
