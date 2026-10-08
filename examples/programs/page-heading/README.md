# 多文件 ESM 示例：网页标题

这是**源码项目示例**，不是安装包。入口 `src/main.js` 通过 ESM 引入其他模块；`package.json.opendesk` 声明运行类型、目标网址和能力。

在 OpenDesk Browser 根目录运行：

```sh
node scripts/validate-program-project.mjs examples/programs/page-heading
```

校验仅证明源码合同。之后可在仓库根目录执行 `npm run build:program -- examples/programs/page-heading`，构建器输出一个带 @match 的 `program.js` 和最终 SHA-256 的 `artifact.json`。将整个 `program.js` 粘贴到 Sidebar「开发」原编辑器；或先打开同窗口 Sidebar，在「发现 → 导入」的完整任务目录选择该 `.js`，返回「开发」里的未保存草稿。展开「网页用户脚本 · 依赖与试运行」并点击 **「在当前网页试运行 DOM 脚本」**。这是 R6 既有入口，不会改动三个页签，也无需先保存。仍需 Chrome 用户脚本开关和当前网站权限。正式 Page Program 安装、重启对账与 Chrome 原生用户验收仍待完成。
