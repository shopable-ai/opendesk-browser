# 官方阅读目录 R4.1

「阅读目录」是 OpenDesk Browser 内**可安装的 Side Panel 工具**，不是第二个 Chrome 扩展。UI 包继续使用 `opendesk.sidebar-tool.v1`；导入的经典 JS 只在 opaque sandbox 中运行，网页内容索引/滚动/浮动 TOC 则由扩展内置可信 Content Script 执行。

## 最快使用

1. 安装/加载 OpenDesk Browser 正式构建，打开一篇普通 HTTP(S) 文章。
2. 打开 Chrome Side Panel →「工具」→ 官方推荐「阅读目录」→「安装」。
3. 查看名称、版本、`page.toc` 能力和来源，再明确「确认安装」。**安装本身不会读取任何网站标题**。
4. 在已安装工具行点击圆形网站开关（◎），审阅当前网站精确 Origin 的 Chrome 确认提示并允许。
5. 网页右侧显示紧凑 `CONTENTS`。三个图标选择一级 / 当前章节 / 完整目录；切换视图不滚正文，点击章节才跳转。
6. 从 Side Panel 工具列表「打开」还可以查看同一网页目录；关闭 Side Panel 不停止已启用的网页卡片。
7. 再次点击网站开关可停用当前网站。工具行「⋯」可以查看和**撤销此前批准的其他网站**，无需再次访问旧站点；卸载工具则同步清理网站授权与工具私有数据。

受控目录快照与点击定位接口为 `toc.snapshot` / `toc.navigate`；工具包不获取任意网页 DOM、`chrome.tabs`、远程代码注入或额外 Task 运行权限。

## 从本地工具包安装

```sh
npm run build:sidebar-tool -- examples/sidebar-tools/reading-toc
```

可导入文件：`artifacts/sidebar-tools/reading-toc/1.0.0/reading-toc.opendesk-tool.json`。在「工具」→「＋ 导入」选择文件，审阅后确认安装。官方快捷安装和本地文件导入复用同一工具包校验、权限复核和持久安装记录。扩展内置资源 `src/sidebar-tools/reading-toc.opendesk-tool.json` 必须与打包器产物一致。

## 当前证据与边界

- 受控 Chrome for Testing 155 正式包、原生 Side Panel、官方快捷安装和本地 JSON 导入、精确 Origin 确认、H1–H6 多标题索引、关闭 Side Panel 后网页目录留存、站点撤销，均有自动化原生证据。
- 真实已登录 ChatGPT、真实知乎、多回答版本切换及用户 Mac 生产 Profile 尚未通过本轮原生验收；模拟 ChatGPT DOM 页面不等于真实站点通过。
- 具体候选 SHA、GitHub Actions、截图和 Mac 验收步骤见 `docs/framework/workstreams/reading-toc-r41-real-chrome-20261010.md`。不可无证据宣称 95/100 独立评分。
