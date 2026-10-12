# 零参数 Page USER_SCRIPT 预置环境 Demo

入口：[src/main.js](src/main.js)。多文件 ESM Page 入口仍然是 `export default async function main()`，使用 `document`、`_` 和 `dayjs`；这里没有 Controller `page` / `axiosx` / `params`，也不直接访问高权限 Chrome API。默认类库来自扩展本地固定文件，网站 MAIN 不被修改。

运行：仓库根目录运行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`；打开 `http://127.0.0.1:43111/demo-form.html`，授权网站并打开 Chrome「允许用户脚本」。在 Sidebar「开发」连接该目录，选择 Page 运行。返回 `previewId`，而非 Controller 持久 `runId/resultId`；保存文件不会自动执行。项目的 `pageRules` 仅匹配 localhost 网页。

```sh
node scripts/validate-program-project.mjs examples/programs/page-globals-zero-arg
node --test tests/environment/runtime-globals-zero-arg.test.mjs
```

此处 L2 测试不能替代真实 Chrome USER_SCRIPT 权限和 MAIN 隔离验收。[运行世界与预置变量](../../../docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md)。
