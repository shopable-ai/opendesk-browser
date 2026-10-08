# 多文件 Page Demo（真实 Browser Test Lab）

三个源文件 `src/main.js → fixture.js + proof.js` 在本地静态 ESM 构建后，借助既有 USER_SCRIPT 试运行链在标准测试页追加 **一个非破坏性 DOM 标记**。不是安装包。

```sh
npm ci --ignore-scripts
node scripts/validate-program-project.mjs examples/programs/sidebar-page-demo
npm run build:program -- examples/programs/sidebar-page-demo
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

打开 `http://127.0.0.1:43111/demo-form.html`。加载 `dist/development` Chrome 扩展并开启用户脚本和网页权限，优先在「发现 → 导入」的完整任务目录选择 `outputDirectory/program.opendesk-draft.json`，向同窗口 Sidebar 交付**只读多文件源码快照与冻结执行字节**；传统方式仍可导入 `program.js`（仅显示已编译程序）或粘贴完整 JS。两种方式都只是未保存草稿，不自动执行。在「网页用户脚本 · 依赖与试运行」选择 async main 类型，点击 **在当前网页试运行 DOM 脚本**。不要点击 Controller 的底栏「运行草稿」。

期望页面 `#lab-text` 中出现 `#opendesk-multifile-page-proof` 且文本包含「多文件 Page 程序已运行」；再次运行仍只有一个标记。程序内部核对端口 43111 与路径 `/demo-form.html`，非目标路径会返回 `SKIPPED_OUT_OF_SCOPE`。

现有构建生成 `program.js`、`program.opendesk-draft.json` 和 `artifact.json`（`BUILT_UNVERIFIED`）；`--mode development` 可另生成本地 Source Map；并不支持直接选择源码文件夹进行浏览器内构建，也不表示已安装。真实 Chrome 执行回执应单独采集。
