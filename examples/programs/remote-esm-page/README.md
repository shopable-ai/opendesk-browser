# HTTPS ESM + 本地模块包装示例

`src/main.js` 只导入本地 `./add.js`；`src/add.js` 中有标准写法 `import add from 'https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/add.js'`。只通过可信本地终端明确审阅/锁定后才能内存编译成 classic JavaScript。Chrome 运行时不会向 CDN 请求此 JS。

## 首次锁定（仓库根目录，显式授权才允许联网）

```sh
npm ci --ignore-scripts
node scripts/validate-program-project.mjs examples/programs/remote-esm-page
# 离线审阅根 URL、域名及 reviewToken，无网络、无执行
node scripts/lock-program-remote.mjs examples/programs/remote-esm-page
# 用户自己核对 URL 后，用上条回执替换 REVIEW_TOKEN
# 新增的传递 URL 必须在交互终端单独确认；不可自动 yes
node scripts/lock-program-remote.mjs examples/programs/remote-esm-page --approve REVIEW_TOKEN
# 检查 opendesk.remote-lock.json 和 .opendesk/remote-cache/*.mjs
npm run build:program -- examples/programs/remote-esm-page
node --test tests/environment/remote-esm-review.test.mjs tests/environment/remote-esm-import.test.mjs
```

普通测试只使用隔离 HTTPS Mock，不自动下载真实 CDN。若本机只有源码，没有完整锁与缓存，断网编译会明确失败：本仓库不预装第三方远端依赖。缓存完整后可以断网重复构建。改变远端 URL（包括查询参数）要重新审阅；**不要将包含令牌或秘密的 URL 提交到版本管理**。SHA-256 只保证缓存字节一致，不证明第三方代码安全。

## 真实运行

使用已有 Native/MCP 授权并 attach 本目录，打开 `https://example.com/`（原规则为 `https://example.com/*`，不是 localhost），同窗口 Sidebar 选择该项目并另行明确执行。需要 Chrome MV3 USER_SCRIPT 开关与网站权限，预期 Page result 为 `{value:42,pageTitle:document.title}`；把 `src/main.js` 的 `20, 22` 修改为 `21, 22`，保存后另一次明确执行得到 `value:43`，比较新的 `previewId`/`sourceHash`。

缺锁 `E_REMOTE_UNLOCKED`、缓存缺失 `E_REMOTE_CACHE`、篡改 `E_REMOTE_HASH` 必须停止业务执行；恢复后重新审阅/授权，不在浏览器偷偷下载。Node 是构建器/锁定工具，不是 Page 的执行世界；本例不需要 Goja。当前候选 Chrome/Native + 离线真实环境 L4-L5 均为 `NOT_TESTED`。
