# 多文件 ESM 示例：网页标题

这是**源码项目示例**，不是安装包。入口 `src/main.js` 通过 ESM 引入其他模块；`package.json.opendesk` 声明运行类型、目标网址和能力。

在 OpenDesk Browser 根目录运行：

```sh
node scripts/validate-program-project.mjs examples/programs/page-heading
```

校验仅证明源码合同。之后可在仓库根目录执行 `npm run build:program -- examples/programs/page-heading`，构建器输出一个带 @match 的 `program.js` 和最终 SHA-256 的 `artifact.json`。在 Sidebar「开发」打开该 JS，点击「运行网页 JS」进行**不保存**的预览；这依旧需要浏览器用户脚本开关和当前网站权限。正式 Page Program 安装、重启对账与 Chrome 原生用户验收仍待完成。
