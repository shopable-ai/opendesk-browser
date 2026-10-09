# OpenDesk Browser：单文件即时运行与多文件项目开发

更新：2026-10-09，R9 校对当前 Sidebar 控件、依赖构建及证据。沿用现有“我的任务 / 发现 / 开发”和 RunHost，不重新设计 Sidebar，也不恢复已移除的依赖配置界面。

## 简单功能直接写 JavaScript

在“开发”编辑器输入代码，不要求 @require 或用户脚本头部。

自动化任务使用原底部“运行草稿”，例如：

```js
async function main() {
  return {title: await page.title(), url: await page.url()};
}
```

需要访问 DOM 时，使用同一编辑器下的 **“网页 JavaScript 试运行 → 在当前网页试运行”**，例如：

```js
async function main() {
  return document.querySelector('h1')?.textContent || '';
}
```

这两个入口的运行世界不同：Controller 有 page/params；Page 有 document。运行前仍检查目标与网站授权。源码可暂不保存，但“运行成功”不等于已安装任务。新自动化优先使用 [现代 Page/Locator API](../framework/modern-page-api.zh-CN.md)，不是把 document 操作搬进 Controller。

## 多文件交给 Codex，在浏览器运行构建结果

每个项目独立 package.json、src/main.js 及其他 ESM 模块；使用 npm 时有该项目自己的 package-lock.json。扩展根目录 npm ci 安装的是构建工具，不等于所有用户项目依赖都安装好了。

```sh
npm ci --ignore-scripts
npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts
npm run build:program -- examples/programs/page-npm-lodash
```

这个例子是真实的两个本地模块 + lodash-es@4.17.21，最终得到单个 program.js、artifact.json 和 program.opendesk-draft.json。没有运行时 CDN，不需要向 Background 加 min.js。构建日志给出实际输出目录。

保持 Sidebar 开启，从“发现 → 导入”打开现有完整任务目录，导入 program.opendesk-draft.json，然后回到“开发”。文件下拉展示只读源码快照；“高级诊断”查看真正执行的生成代码；点击 **“新建”** 回到普通可编辑草稿。快照不能在浏览器内替代本地 ESM 构建。

Page 用“在当前网页试运行”，Controller 用“运行草稿”。构建和导入不发放权限，也不自动运行。Controller 示例仍可用 `npm run build:program -- examples/programs/controller-title`，另外生成原 Task v1 Candidate JSON。源码、草稿与正式任务包不要混用。

## 加库的正确位置

| 需要 | 正确位置 |
|---|---|
| 扩展框架自己需要第三方库 | 根 package.json/lock + 静态 import，经 WXT 验证所属固定产物 |
| Page 或 Controller 用户项目需要 lodash 等 | 在该项目安装精确版本，经既有 Webpack 编译到自己的 program.js |
| 已有依赖按字节独立注入 | 仅明确受控的 vendor、来源、许可证和固定哈希合同 |
| 源码写静态 HTTPS import | 使用已支持的构建期远端锁流程，不在浏览器里动态执行 |

Codex 增加依赖时审查许可证和实际消费者，维护精确版本与锁文件，再核对 artifact.json 的 npmDependencies、npmBundledModules、npmLockSha256 和 sourceHash。扩展本身另有 WXT build receipt 的 bundleModules。**声明依赖并不证明代码进入产物；编译成功也不证明浏览器授权链通过。**

## 旧脚本如何迁移

现有 @require 解析器和已批准依赖锁保留；唯一匹配的合法锁可继续复验复用。无锁或多锁时拒绝，回本地 npm/ESM 项目固定后构建再导入。当前页面没有新 @require 地址表单、版本下拉、jQuery 复选框或入口格式选择器。

不要无条件把旧 @require 替换成 import：经典全局库、模块导出和运行世界可能不同。`examples/tasks/jquery-page-draft.js` 是有既存合法 jQuery 锁时的兼容检查，不是新配置可直接免审核运行的安装方案。复杂新项目以源码构建为主。

## UI 与资源

简单程序不需要框架，原生 DOM/表单即可。小型 Page CSS/JSON/图片可按项目合同打包，使用时明确挂载并优先 ShadowRoot，不能全站注入 Tailwind reset。React/Vue/Tailwind 属可选制作端方案，不代表当前直接支持 JSX/TSX/.vue 或浏览器内编译。

用户自定义 Side Panel 工具通过现有独立工具包和隔离文档展示，见 [侧栏自定义工具](sidebar-custom-tools-r1.zh-CN.md)。其 JS 不能作为扩展高权限组件直接执行，工具包不是 Page/Controller Program。

## 当前验证等级

R9 已有干净 npm 安装、生产/开发 WXT 构建、包/ZIP 字节校验、真实 npm 包构建执行证据，以及 jQuery 真实 DOM 组件诊断。尚不能宣称完整 USER_SCRIPT 授权、Sidebar 全流程、自动安装、导航/撤权/重启和最终 Mac 验收全部完成；以 [工作记录](../framework/workstreams/r9-dependency-closure-20261009.md) 和最新同候选原始回执为准，不用主观 95 分代替测试。

继续开发先读 [项目合同](../architecture/browser-framework/program-project-authoring-r1.zh-CN.md)、[依赖迁移表](../architecture/browser-framework/third-party-library-map.md) 及现有 Codex Skill；不必再创建另一套 IDE、构建器或依赖设置页面。
