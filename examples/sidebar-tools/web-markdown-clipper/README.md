# 网页剪藏 Web Markdown Clipper · R1.7.5-LOCAL

> 工具源码版本 1.1.4（深色搜索提示复用可读次要文字色；鲜读备份使用一次点击的异步准备入口；正式安装须通过唯一 JSON 包的候选测试与晋升），非独立 React 应用。复用已有 Browser SDK、可信 Host、工具隔离 UI 和原生本地存储。

## 普通用户怎么用？

**网页选中一句话 → 右键 →「OD · 保存选中内容到我的摘录」→ 打开的网页剪藏中点击「保存摘录」→ 在「我的摘录」找回。**

首次使用：从 OpenDesk Browser 侧栏「扩展」安装「网页剪藏」，完成能力审阅后直接打开并点击提取，无需在工具设置里逐站授权。声明的右键菜单同样复用安装审阅；真正缺失 Chrome 右键菜单权限时才需要批准浏览器请求。设置仅用于主动停用或恢复某个网站。右键当前使用已有的 open-self：打开本工具，安全预填一次性选区，再由用户点击「保存摘录」，不会后台静默保存。此规则由新版扩展框架实现，单独重导入旧工具 JSON 不会升级宿主权限策略。

备用流程：网页选中文字 → 侧栏选择「选区」→「提取选中文字」→「保存摘录」。

日常功能：默认提取文章；保留文章/选区/引用/链接及 Markdown 预览，复制和 .md 下载；「我的摘录」提供搜索、查看、修改、复制、删除；「新建便签」只要求正文，不伪造网页来源。普通操作不重复弹窗。

**保存 / 复制 / 下载是三件事**：保存放在 Chrome 本地工具数据中；复制进入系统剪贴板；下载请求生成磁盘文件。

## 数据策略

使用已有 storage.get({key:'clips',withEtag:true}) 与 storage.set({key:'clips',value,ifMatch})，工具私有命名空间中只用一个 JSON 键同时持有记录和顺序，避免跨键部分写入。可信 Host 的 per-tool Web Lock、ETag CAS、写入核对被原样复用。写入回执丢失会读回比对，无法确认时停止新的写入，待用户刷新核对。

- 每条正文最多 2048 UTF-8 字节；整个 `clips` 键值（所有摘录及元数据）的 JSON 合计最多 8192 UTF-8 字节、最多 64 条记录。宿主每工具总配额为 32 KiB/32 键。不会自动截断。
- 同一来源与内容重复摘录不会创建新记录；其他窗口编辑时不覆盖新数据。
- 大篇幅完整文章继续使用复制或 .md 下载，不存入短摘录库，也不重复开发 Knowledge Inbox 全文数据库。
- 「导出备份」先鲜读本地数据，包含该次读取前其他窗口已提交的记录。新 Host 的 `downloads.prepareText` 在点击时预留一次导出机会，再完成鲜读；旧 Host 继续使用原确认式导出。超时或结果未知时不自动重试。数据**只在当前浏览器本地**，不表示云同步；卸载或清除浏览器数据之前必须导出并在真实 Chrome 核对文件。当前不提供 JSON 备份导入。

## 正式源码和交互预览

源码：src/index.html、src/style.css、src/notes.js、src/main.js。打包器将 notes.js 作为 v2 固定 Classic JS 依赖置于 main.js 前并校验 SHA-256；没有第二套 UI/Host。

在本地仓库根目录执行：

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Chrome 浏览器访问：

http://127.0.0.1:8765/examples/sidebar-tools/web-markdown-clipper/preview/index.html

预览使用**相同的正式 HTML 标记与 JS/CSS**，但网页内容、右键 ticket、存储、复制与下载都是**明确的模拟结果**，不会保存到真实 Chrome。支持 320/360/400/440px、深浅色、200% 缩放，可模拟右键预填、配额耗尽、写入失败和回执丢失。

## 构建与测试（必须在有仓库的环境实际运行）

```bash
npm ci
npm run build
npm run build:sidebar-tool -- examples/sidebar-tools/web-markdown-clipper
node --test examples/sidebar-tools/web-markdown-clipper/tests/*.test.mjs
APP_CI_SELECTED=web-markdown-clipper node scripts/app-ci.mjs plan
node scripts/app-ci.mjs inspect web-markdown-clipper
node scripts/app-ci.mjs build web-markdown-clipper
node scripts/app-ci.mjs node web-markdown-clipper
```

正式验收在独立 Chrome Profile 加载已验证的 production 静态包；日常开发继续使用已有 watcher 的 dist/development。可导入的正式工具包只有本目录中的 `web-markdown-clipper.opendesk-tool.json`，与源码一起提交。临时候选先输出到 `artifacts/sidebar-tools/web-markdown-clipper/candidate.opendesk-tool.json`，受影响测试通过后由同一打包器 `--promote-from` 晋升，再执行 `--check-project`；不得覆盖已经发布的同版本内容。

真实验收须分别检查：右键菜单逐站启用、选区与文档身份证明、保存后 Side Panel 重开和 Chrome 重启读回、系统剪贴板 pbpaste、下载文件实际 SHA-256、卸载前 JSON 备份。HTML/Node 的模拟测试不能冒充这些结果。

## 边界与安全

上下文菜单工具声明的 https://*/*、http://*/* 是安装审阅中的匹配范围。可信 Host 在 Chrome 允许访问且未主动停用的网站提供声明的固定动作，点击时仍校验精确 Origin、文档身份、安装实例及一次性有效期，不把匹配模板当作任意宿主能力。

短摘录不要求额外云服务；不访问 Knowledge Inbox 私有数据，也不自动读取未授权网站。
