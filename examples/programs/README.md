# OpenDesk Browser 多文件 Demo 总览

| 示例 | 技术目标 | 当前证据边界 |
| --- | --- | --- |
| [page-heading](page-heading/) | 旧有 Page ESM 标题读取 | 本地构建 |
| [controller-title](controller-title/) | 旧有 Controller ESM 标题读取 | 本地构建与 Candidate |
| [sidebar-page-demo](sidebar-page-demo/) | 3 个源模块 → Page USER_SCRIPT → 测试页可见标记 | 可构建；真实 Chrome 待验收 |
| [sidebar-controller-demo](sidebar-controller-demo/) | 3 个源模块 → Controller Locator → 真实表单/结果 | 可构建；真实 Chrome 待验收 |
| [sidebar-assets-contract](sidebar-assets-contract/) | CSS/JSON/PNG 的路径/哈希与拒绝不支持的构建 | 源文件校验 PASS；构建预期失败 |

全部示例共用 `examples/tasks/demo-form.html`，没有新增重复的人工测试页。

参考 [Program API 文档](../../docs/framework/sidebar-project-api-r1.zh-CN.md)、[文件夹与资源架构](../../docs/architecture/browser-framework/sidebar-project-intake-r1.zh-CN.md) 与 [Codex 本地验收目标](../../docs/framework/prompts/goal-sidebar-multifile-native-acceptance-r1.md)。

```sh
npm ci --ignore-scripts
node --test tests/environment/sidebar-project-demo.test.mjs
npm run build:program -- examples/programs/sidebar-page-demo
npm run build:program -- examples/programs/sidebar-controller-demo
```

上面两种 JS 构建还输出 `program.opendesk-draft.json`：在现有完整任务目录导入，可保留多文件只读源码快照与固定执行字节。开发模式可使用 `--mode development` 生成可读 JS 与本地 Source Map。构建结果为 `BUILT_UNVERIFIED`，不是 `Installed`；资源样例构建目前应返回 `E_PROJECT_ASSET_BUILD`，不可将其计为安装成功。

- [page-ui-basic](page-ui-basic/README.md)：R1 原生 Shadow DOM 页面工具；独立 CSS、JSON 与 PNG 固定内嵌，按需 UI 样式与关闭/重新打开（仅手动 USER_SCRIPT 试运行，Chrome 待验收）。
