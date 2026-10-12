# Page QA Inspector — 独立 Chrome MV3 产品（Extension Factory R2）

本产品的独立身份为 `page-qa-inspector`，版本 `0.1.0`；这是产品配置 ID，**不是** Chrome Web Store 分配的安装扩展 ID。

## 用户操作

1. 使用单独的扩展包安装到 Chrome，打开普通 HTTP(S) 页面。
2. 点击工具栏 Page QA Inspector 图标，再点击「检查当前页面」。
3. 查看 DOM 定位示例、标题、语言、图片 alt、按钮/链接名称、表单标签与标题层级提示。
4. 通过「定位」临时高亮目标元素，或主动点击「导出 JSON」下载报告。报告只在本地弹窗内存；`chrome.storage.local` 仅保存「仅显示重点问题」偏好。

所有检测在用户打开并操作弹窗后执行；`activeTab` 是本次手势的临时授权，`scripting` 只向当前获准 HTTP(S) 标签执行本地打包函数。**不使用 background、持续运行 content_scripts、全站权限、Cookie、Native、远端 JS 或后台同步。** JSON 只读报告不读取表单输入值，也主动省略 URL 的 query/fragment；本工具不是完整的 WCAG 审核器。

## 独立构建与校验

先在仓库根目录 `npm ci --ignore-scripts`，之后：

```bash
node --test tests/environment/extension-factory-r2.test.mjs
npm run build:product -- --product page-qa-inspector
npm run pack:product -- --product page-qa-inspector
```

独立可加载目录：`dist/products/page-qa-inspector/production`；
发布候选 ZIP：`artifacts/products/page-qa-inspector/page-qa-inspector-0.1.0-production.zip`；
构建身份与校验：`artifacts/products/page-qa-inspector/{build,pack}-receipt.json`。

`npm run build` 与 `npm run pack` 仍只构建原 OpenDesk。两种产品的 Manifest、固定入口、缓存与产物目录互不复用。构建清单通过闭合 Feature Resolver 导出最少权限；任何新增功能、权限或独立产品必须先纳入人工审计。

## 商店发布和 Chrome ID

本产品尚**未获得 CWS 审核**。开发者模式通过独立绝对路径加载 unpacked 版本；正式 Chrome ID 与签名应由该产品自己的 CWS 条目固定管理。更新只能用同一正式身份，不能用 OpenDesk 的 manifest `key`、打包 ZIP 或用户数据；不同扩展的 `chrome.storage.local` 天然隔离。

**发布门槛：** 实际 Chrome 安装与 20 次工具栏打开/检查、禁止页拒绝、导航、权限撤销、重启、双扩展并装、升级回滚及人工隐私/商店单一目的审核，逐项记录候选 SHA 和原始证据。CI 的 Node/WXT/ZIP 结果不是 Mac Chrome、CWS 或 F3 PASS。
