# Page QA Inspector — DEPRECATED / 已废弃的实验产品

> **状态（2026-10-12）：`DEPRECATED / NO_RELEASE / MANUAL_FIXTURE_ONLY`。** 本产品已退出首款独立商业 Chrome 插件与发布排期。不得据此继续产品功能、CWS 上架、Mac Chrome 20 次专项验收或对外宣传正式完成。
>
> 它的原始用途是用户手动检查当前网页的 DOM/图片 alt/标题与表单基础可访问性，定位元素及本地导出 JSON。由于与 DevTools / Lighthouse / axe 等现有工具重叠，而且尚无本项目的用户留存、显著差异化或付费证据，当前不继续投入。
>
> **暂时保留代码仅为了历史工程参考：** 独立 WXT 配置、权限最小化、Manifest/ZIP 隔离和 Feature Resolver 样例。它不会加入默认 OpenDesk 构建；下方 `build:product` / `pack:product` 命令仅供手动诊断，不代表支持任意产品的工厂，也不构成发布授权。专属自动 CI 和旧测试属于后续隔离清理范围。详见 [商业方向决策](../../docs/product/browser-extension-ecosystem/commercial-decision-ecommerce-20261012.zh-CN.md)。

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
