# 多文件 ESM 示例：网页标题

这是**源码项目示例**，不是安装包。入口 `src/main.js` 通过 ESM 引入其他模块；`package.json.opendesk` 声明运行类型、目标网址和能力。

在 OpenDesk Browser 根目录运行：

```sh
node scripts/validate-program-project.mjs examples/programs/page-heading
```

输出 `AUTHORING_VALID_NOT_PACKAGED` 仅证明文件/声明/模块引用在静态层合规，不代表已经生成了可在 Chrome 运行的 bundle。正式 ESM 打包和 Page Program 安装消费者仍待下一阶段接通。
