# AI VIP Share · React 同源预览

唯一当前预览源码入口：[`index.html`](index.html)。

**本预览不是商业会员服务，也不是已安装的 OpenDesk 扩展。** 正式 React 组件来自 `../src/App.jsx`；业务事务流程仍运行 `../src/main.js`；仅 SDK 适配在此目录换为隔离的 `sdk-fixture.js`，不进入正式安装包。共享 Button/IconButton/Card 与宿主源码同源，不自行复制组件实现。

在仓库根运行：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:preview --prefix examples/sidebar-tools/ai-vip-share
# 从 preview/dist/ 启动本机静态 HTTP 服务，再打开 /index.html
```

`preview/dist/index.html` 为构建后的可打开页面，直接双击源 `preview/index.html` 不会自动编译 JSX。预览只能模拟 SDK 回执，不可推断 Chrome Cookie/Proxy 或真实登录成功。宽度控制覆盖 320/360/390/400/440/520px，浏览器深浅色遵循 `prefers-color-scheme`。

体验路径：打开预览 → 产品区「连接本地开发」→ 外层「演示有效会员」或输入固定测试码 `DEMO-VIP-01` 完成实际产品预检与明确确认 → 产品区刷新会员与服务器分配 → 从产品区请求共享会话、确认写入 → 在外层选择 Cookie 结果仅控制下一次虚拟回执。历史不可重放保护照常生效；部分或未知后刷新不会把已执行结果自动覆盖。外层切换代理场景后，产品区「重新检测代理状态」再查看；STOP 仍由产品区唯一按钮发出。

历史 R5.7 单文件 Mock 已移动至 [`archive/r57.html`](archive/r57.html)，仅保留回归/对照，**不是**主预览，不可与正式 React 产品并列发布。对应 `test-ui.mjs` 只测试历史档案。R4 旧文件也是历史视觉档案。

本次源码/React/构建/定向测试的执行情况以 GitHub Actions 与对应 commit SHA 的实际回执为准；没有同 SHA 的验证不得标 PASS。
