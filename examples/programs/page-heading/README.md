# 多文件 ESM 示例：网页标题（Page USER_SCRIPT）

`src/main.js` 通过 namespace import 使用 `dom.js`，从 `utils.js` 具名导入函数；`utils.js` 再 re-export `describe.js`。入口默认导出 `async function main()`，在真实网页读取 `<h1>`；它不是在 Node 环境操作 `document`。

## 校验 / 构建（仓库根目录）

```sh
npm ci --ignore-scripts
node scripts/validate-program-project.mjs examples/programs/page-heading
npm run build:program -- examples/programs/page-heading
node --test tests/environment/program-project.test.mjs tests/environment/program-build.test.mjs
```

以上仅 L1/L2：构建的 `program.js` 和 `artifact.json` 是 `BUILT_UNVERIFIED`，不是浏览器运行回执。无需 HTTPS/npm 第三方依赖联网。

## 真实 Page 运行

项目 `package.json` 保持原 `https://example.com/*` 匹配，不自动放宽到 localhost。打开 `https://example.com/`，授予用户脚本与网站权限，在同窗口 Sidebar「开发 → 本地项目」连接授权目录，再**明确点击运行**。也可通过既有草稿导入流程执行已构建的 `program.js`，不可直接将未编译 ESM 粘贴到 classic 编辑框。

返回值预期 `{heading,found}`，找到页面 `<h1>` 时 `found:true`。在 `src/describe.js` 修改返回结果并保存，再次**明确点击运行**，核对新 `sourceHash`、`previewId` 和新结果；保存源码不会自动对页面执行副作用。若失败核对站点规则、当前 `documentId`、授权与 Native 连接；不盲目重放未知结果的运行。

Node：仅负责验证和编译；Native / Node CLI：仅在目录直连模式需要；Chrome MV3 / USER_SCRIPT：实际执行环境；无需 Goja。当前候选 L4/L5 Chrome/Native 原生验收 `NOT_TESTED`。
