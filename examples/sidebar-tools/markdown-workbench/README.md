# Markdown 工作台 1.0.0

离线编辑和安全预览 Markdown，用户手动选择本地 .md 文件，无网站内容或网络读取权限。HTML 文本不执行，外部图片只显示引用。

运行 npm run build:sidebar-tool -- examples/sidebar-tools/markdown-workbench 重建。安装包位于 artifacts/sidebar-tools/markdown-workbench/1.0.0/markdown-workbench.opendesk-tool.json。

在 Side Panel → 工具 → ＋ 导入 → 选择 JSON → 核对 user.export → 确认安装 → 打开。可点 ↗ 在独立标签页打开。自动复制不可用时选中文本并提示 Ctrl/Cmd+C。编辑内容仅会话内存在，离开前应下载。


## 官方可选入口（R4.5）

本项目由 `official-tools/catalog.json` 登记，正式构建自动生成 `dist/production/official-tools/markdown-workbench/markdown-workbench.opendesk-tool.json`。在 Side Panel「工具 → Markdown 工作台 → 安装」审核并确认后，主动打开使用；也可导入上面的独立打包结果。资源随扩展发行不代表默认安装，卸载后重启不复装。源码目录不维护生成包副本。
