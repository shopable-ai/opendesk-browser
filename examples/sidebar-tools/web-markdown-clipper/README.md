# 网页剪藏 v1.0.1

网页内容读取由 OpenDesk 可信 Content Script 完成；当前工具只是无 Chrome 权限的隔离 UI。

## 使用

1. 在 Side Panel → 工具 找到「网页剪藏」并安装；首次安装必须明确预览 `page.clip`、`user.export` 两项能力。
2. 保持目标 HTTP(S) 页面为同窗口活动标签页；从工具列表点「允许剪藏当前网站」并在确认框批准 **Origin**。
3. 打开工具，切换「文章 / 选区 / 引用 / 链接」，然后点击「剪藏」；选区或引用模式须先在网页选择目标文本。
4. 检查源码或只读预览，按需选择 YAML Front Matter/文末引用，点击「复制」或「下载 .md」。
5. 对网页做 SPA 导航、刷新、更换文章或重新选择范围后，重新点击剪藏。工具不会后台自动搜集内容。
6. 工具列表的网站按钮可以撤权，卸载会删除此工具的授权。TOC 章节权限不会转换成文章读取权限。

本地导入包先用下面的命令生成，输出为 `artifacts/sidebar-tools/web-markdown-clipper/<version>/web-markdown-clipper.opendesk-tool.json`。官方可选资源从同一源码自动生成到 `dist/production/official-tools/web-markdown-clipper/`，版本、能力及摘要由统一 Catalog 派生；扩展首次运行不安装、不批准网站。

可复现构建：`npm run build:sidebar-tool -- examples/sidebar-tools/web-markdown-clipper`；打包器默认将 JSON 写入被 git 忽略的 `artifacts/sidebar-tools/web-markdown-clipper/1.0.0/`。

## 边界

- 当前文章识别限 `article`、`main` 等可信结构候选；无法识别需使用选区。复杂合并表格明确报错而不是编造。
- 输出正文上限 150 KB；不隐式截断。
- 跨标签页打开的工具目前 **不继承侧栏原先的文章目标**，不能保证在独立标签页读取网页；独立标签页中的网页访问必须先解决显式目标选择和精确文档绑定。
- 不读取 Cookie、Token、浏览历史，不访问第三方网络。不自动保存正文到普通工具 storage.local。
- 自动复制取决于宿主浏览器是否允许 Clipboard API；如果失败，会选中文本并提示 Ctrl/Cmd+C。下载实际落盘及系统保存对话框需要真实 Chrome 验收。
- HTML→Markdown 保守转换不是 Readability/Turndown 的 100% 等价实现；异构站点、长公式、复杂交互内容需要额外真实站点样本验证。
