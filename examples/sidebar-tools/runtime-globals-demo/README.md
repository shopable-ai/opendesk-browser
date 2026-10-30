# Side Panel 已安装工具：OpenDeskTool 全局桥 Demo

这是**真正可打包、可经用户确认导入的** `opendesk.sidebar-tool.v1` 工具项目。运行在 opaque-origin iframe，**不是**可信 Side Panel 宿主、Controller Worker 或目标网页 USER_SCRIPT。

和 Controller 的 `main()` 不同，工具入口是单个经典 JS，在容器创建后读取框架提供的 `globalThis.OpenDeskTool`。使用 `root` 查找自己的 UI，只有明确声明并获授权的 `currentPage.read` 才能用 `request('currentPage.info')`；点击按钮前不自动读取网页。

这是最小 HTML/Classic JS 起点，配置直接选 `src/`，没有独立 npm/Vite 依赖。复用为新正式产品时使用 `projects/<id>/`，教学副本用 examples；重设 ID、标题、版本和最小能力，不复制演示身份或生成包。测试、预览、资源和项目级 AGENTS 按[目录合同](../../../docs/architecture/extension-project-layout.zh-CN.md#21-目录选择与存在条件)的真实需要添加，不预建空目录。

本仓库依赖已就绪时，从根目录选择本次需要的步骤；新环境才按根锁文件安装依赖：

```sh
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/runtime-globals-demo
# 仅当本次修改涉及桥/运行世界时选择该检查，不把它当每次文案修改前置
node --test tests/environment/runtime-libs-trusted-worlds.test.mjs
```

默认输出到 `artifacts/sidebar-tools/<配置 ID>/<版本>/`，它是临时候选。日常修改优先[开发 → 本地项目 → 在侧栏调试](../../../docs/api/sidebar-tool-development.zh-CN.md#直接调试与开发数据隔离2026-10-29)，保持开发数据/授权隔离；Workspace 只读预览不拥有真实读取能力。

本轮确需交付安装包时，按[唯一打包 Skill](../../../.agents/skills/opendesk-sidebar-tool-package/SKILL.md)完成候选→相关验证→`--promote-from`→`--check-project`，再从 Side Panel「扩展 → 更多操作 → 导入本地工具包」审阅安装/更新并打开。不因修订本说明给示例批量补正式包。

需要验证真实网页读取时，打开 `http://127.0.0.1:43111/demo-form.html` 或已授权的 HTTP(S) 网站，点击“读取当前网页标题”，检查是否更新；受限页面应显示不可读取，而不是越权。**这是需要真实 Chrome 证据的步骤；Node 通过只证明其实际覆盖的源码与桥合同，不等于读取成功。**

这里不支持：
- `page.title()`：这是 Controller 受控 Worker 词法能力；
- `document.title` 获取外部网站：iframe 的 document 是工具自己的 DOM；
- 默认 `_` / `dayjs` / `window.chrome.tabs`：不继承 Controller/Page/可信宿主的变量；
- 未经打包的 `import dayjs from 'dayjs'`：工具包只接受单个经典 JS，若工具自身要使用第三方模块，必须在**工具自身**事先离线编译、检查来源，不能运行时 CDN。

与可信 Side Panel Host 导入的区别，见[静态导入示例](../../libs/trusted-imports/README.zh-CN.md)及[运行环境权威合同](../../../docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md)。
