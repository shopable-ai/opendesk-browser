# 官方阅读目录 R4.1

官方参考工具使用现有 opendesk.sidebar-tool.v1 合同。工具 JS 只在 opaque sandbox 内运行，网页 TOC 是扩展自己的可信代码。
能力 page.toc 仅用于请求受控的 toc.snapshot、toc.navigate；工具本身不能扩权或注入网页 JS。

构建命令：npm run build:sidebar-tool -- examples/sidebar-tools/reading-toc --out artifacts/sidebar-tools/reading-toc/1.0.0/reading-toc.opendesk-tool.json
安装：Side Panel → 工具 → 官方「阅读目录」→ 安装，或导入生成的 JSON；在审核后确认，再从工具列表授权当前网站。
关闭侧栏不停止已授权网页卡片。禁用和卸载从受信工具列表操作。
扩展内置资源 src/sidebar-tools/reading-toc.opendesk-tool.json 应与打包器生成结果一致。
