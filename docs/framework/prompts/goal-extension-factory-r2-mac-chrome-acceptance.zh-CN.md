# GOAL：Extension Factory R2 — Mac Chrome 原生验收

## 首要目标

在用户本机真实 Mac Chrome/CFT 中安装已构建的 **Page QA Inspector v0.1.0**，与原 OpenDesk 独立并装；逐项确认权限、用户点击检查、定位、报告、导航与重启，保存原始同包候选证据。**不得以 Node、CI、静态截图、模拟 DOM 代替真实浏览器。**

仓库：`/Users/shopme/Documents/workspace/opendesk-browser`，仅 main，只读核对并行占用的 Profile、端口、dist、ZIP，不覆盖。先读 `AGENTS.md`、`docs/framework/testing-guide.md`、`docs/framework/workstreams/extension-factory-r2.md`、产品 README。

1. 核对本地 `git status --short`、`git rev-parse HEAD`、远端 main、正在占用的 Chrome/CFT 和构建资源；若冲突，停止写入并登记 BLOCKED。
2. 用独立产物执行 `npm run build:product -- --product page-qa-inspector`、`npm run pack:product -- --product page-qa-inspector`；核对 manifest 仅 `activeTab,scripting,storage`，无 Cookies、原 OpenDesk SW、广泛站点匹配。保存两个 receipt、ZIP 哈希、加载目录文件哈希。
3. 用新的 Chrome Profile 安装 `dist/products/page-qa-inspector/production` 与已审核默认 OpenDesk unpacked 包。**真实记录两个不同扩展 ID**，两边存储隔离，移除 Page QA 不能影响 OpenDesk；未固定原 OpenDesk 身份的情形必须 NOT_TESTED。
4. 在 `http://127.0.0.1:43111/demo-form.html`（由 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks` 启动）对真实工具栏扩展图标及「检查当前页面」进行 **20 次点击检查**，保留起止时间、触发截图、DOM/报告、问题定位前后状态，JSON 不包含输入值或 URL 查询密钥。禁用无关扩展。
5. 测试不同普通 HTTP(S) 页面、空文档、SPA 改路由、整页导航、更换 tab、撤销临时页面访问、`chrome://` 内置页、Chrome restart；需要看到主动拒绝/重新检查，不得跨页定位旧元素。
6. 下载 JSON、关闭弹窗、重启扩展、重启浏览器；确认只有过滤偏好持久化，报告不后台缓存、没有网络上传或意外长驻脚本。
7. 做同产品版本升级与降级/回滚（使用正式稳定 Chrome ID 的合规方式测试；未具备则标 NOT_TESTED，不把不同 unpacked 目录当同一扩展升级）。再次比较发行 ZIP 字节与候选 dist 字节。
8. 记录 `sourceCommit`、`packageHash`、`zipSha256`、`chromeVersion`、`extensionIds`、`profile`、真实测试时间、逐项原始证据文件/哈希和 PASS/FAIL/BLOCKED/NOT_TESTED；保存到本工作流的**独有**证据目录，并安全释放资源。CWS 人工审核单独 NOT_TESTED，绝不宣称上架。

缺陷先修复再按变更影响补测；只有同候选真实证据支持的级别才可标记通过。完成时给出核心功能和权限两份独立结论，绝不通过综合分掩盖某个硬门未测。
