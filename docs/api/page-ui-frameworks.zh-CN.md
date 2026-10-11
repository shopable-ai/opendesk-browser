# Page UI · React/Vue 使用方式与 R24.3 迁移状态

[Page USER_SCRIPT](page-userscript.zh-CN.md) · [项目格式](local-projects.zh-CN.md) · [UI 生命周期](../framework/ui-api.zh-CN.md)

**2026-10-11 已确认：选择 React/Vue，写官方组件，系统自动准备与挂载。新增能力待实施，不能把目标当作已发布 API。** 本次仅更新 Markdown，没有修改功能源码、运行时哈希、导入产物或历史回执。

完整设计：[R24.3 官方组件开发](../architecture/browser-framework/page-framework-authoring-r243.zh-CN.md)。执行提示词：[R24.3 GOAL](../framework/prompts/goal-r243-page-framework-authoring.zh-CN.md)。

仅讨论当前网页中的 Page USER_SCRIPT，不是 Side Panel 小工具或独立应用。复用原执行器、权限、受管容器和安装链。

## 1. 四个目录怎么选

| 目录（examples/programs 下） | 当前代码 | 下一轮目标 |
| --- | --- | --- |
| [page-ui-react](../../examples/programs/page-ui-react/README.md) | JSX + Vite，原 R24.1 路径 | 默认 App.jsx，自动转换与挂载 |
| [page-ui-vue](../../examples/programs/page-ui-vue/README.md) | Vue SFC + Vite，原 R24.1 路径 | 默认 App.vue，自动转换与 scoped CSS |
| [page-ui-react-direct](../../examples/programs/page-ui-react-direct/README.md) | 普通 JS createElement/Hooks，现有本地自动准备 | 标准 react 导入、简化普通 JS 组件、旧入口兼容 |
| [page-ui-vue-direct](../../examples/programs/page-ui-vue-direct/README.md) | 普通 JS createApp/h/ref，现有本地自动准备 | 标准 vue 导入、简化普通 JS 组件、旧入口兼容 |

四个目录都纳入迁移，但不是四套框架重写。完成后主要入口只有 React/Vue；direct 保留为普通 JS 与兼容示例。不新建替代目录，不无故更改项目 ID。createElement/h 也是官方 API，不应说成错误语法。

## 2. 现在可沿用的 R24.2 普通 JS 路径

两个 direct 示例包含 src/main.js、src/enhancement.js 和项目清单。用户编辑普通 JS，本地解析器自动准备，点击运行才操作网页；不需要为示例安装 React/Vue 或运行 Vite。

“免手工编译”不等于内部完全不打包，也不等于 main.js 可以直接贴入普通网页控制台。现有代码仍使用 @opendesk/ui 项目别名和相对模块。

固定运行时是 React 19.2.0/ReactDOM 和 Vue 3.5.22，版本、路径、字节、哈希及许可证见 src/libs/page-frameworks/contract.js。按获准的 USER_SCRIPT 世界运行，不借用网站框架，不从 CDN 加载；依赖声明不授予网站权限。

### 本地 AI/编辑器开发

先按[本地目录 CLI 指南](../framework/local-directory-cli-r17.zh-CN.md)安装并配对开发连接。仓库根目录另开终端启动目标网页：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

Chrome 打开 http://127.0.0.1:43111/demo-form.html。在已就绪的 CLI 环境中，从仓库根目录选择项目：

```sh
cd examples/programs/page-ui-react-direct
opendesk browser dev .
# Vue 改用 examples/programs/page-ui-vue-direct
```

保持 CLI 连接，Sidebar → 开发 → 本地项目 → 选择项目 → 运行。满足 Chrome 网站访问和用户脚本条件。保存只更新准备状态，不自动运行，不是保存即热替换网页。

现有组件显示在 #page-ui-demo-target 附近，高亮/撤销 #lab-text #sample-text，停止时清理组件与受管改动。原网页表单不应被提交或修改。正式安装及自动触发继续原固定版本流程。

### 不连接本地项目：导入现成草稿

现有文件和完整步骤见 [examples/import-ready](../../examples/import-ready/README.zh-CN.md)：

- page-ui-react-direct.opendesk-draft.json
- page-ui-vue-direct.opendesk-draft.json

沿用“发现 → 导入 → 导入任务包 JSON 或 JavaScript 草稿”；同窗口打开 Sidebar，导入后回到“开发 → 直接编辑”，检查 Page 快照，再点击“在当前网页试运行”。固定快照不跟随磁盘变化，不是已安装程序。

这些文件证明的是现有普通 JS 草稿路径，不证明新的 JSX/SFC 源码导入和浏览器自动转换已经实现。

## 3. 待实现的默认入口

```text
选择 React/Vue
  -> 编辑/导入 App.jsx 或 App.vue
  -> 系统自动转换必要语法并链接内置框架
  -> 用户明确运行
  -> 原受管容器挂载
  -> 用户停止，卸载并取得真实回执
```

基础组件编辑/导入不要求 Native 或项目 node_modules；本地目录仍使用已有连接。标准 import 在准备阶段链接到固定框架，不让目标网页直接解析 npm 包名。

用户默认只导出组件，不写 createPageUI、createDemoEnhancer、内部全局变量或强制 main()。生成入口内部继续调用原容器与卸载能力。高亮业务保留为进阶场景，不作为最小计数器的依赖。

JSX/SFC 仍需系统转换。拟定的 component 入口字段、标准导入、客户端 API 补齐、共享转换、错误定位及兼容策略详见设计文件；旧 async-main 和旧草稿继续支持。新字段当前尚不可调用。

## 4. 原 JSX/SFC 手工构建的历史状态

R24.1 依赖锁与 Vite 示例已有源码。该候选 React 框架产物 961,871 字节、Vue 144,502 字节，超过原 Page 预算；React 项目校验报告 E_PROJECT_LIMIT。Vite PASS 不是 Page/Chrome PASS。

复现命令保留在两个非 direct 目录 README，仅供维护者核对历史路径，不是新入口的最终用户步骤。下一轮应链接固定运行时并自动准备，不能以提高 Page/SW/Native 预算来制造成功。

历史数字不代表最新全仓构建状态。证据见 [R24.1 工作流](../framework/workstreams/page-ui-r241-20261011.md)和 [R24.2 工作流](../framework/workstreams/page-ui-no-build-r242-20261011.md)。保留原失败及回执，不把旧 PASS 移植到新源码。

## 5. 网站、安装和生命周期

仍使用原 pageRules 匹配器：包含为 OR，排除优先，精确端口/路径/子域按原规则处理。示例仅匹配 http://127.0.0.1:43111/*，排除 /private/*；另一个端口、localhost、HTTPS 或其他域名不是同一范围。URL 匹配不是 Chrome 网站权限或安装批准。

```json
{
  "pageRules": {
    "matches": ["https://chatgpt.com/*", "https://*.example.org/articles/*"],
    "excludeMatches": ["https://chatgpt.com/admin/*"],
    "runAt": "document_idle",
    "allFrames": false,
    "world": "USER_SCRIPT"
  }
}
```

更换网站需同步项目规则与组件挂载设置，不只改文案。内部浏览器页面等不支持范围继续拒绝，不为便利改成全站权限。

本地项目/保存/导入/手动预览/Verified 均不意味着自动启动。Installed & Enabled 按原安装授权与匹配新文档调度，不承诺 SPA 返回自动重放。

SPA 离开范围、pagehide、BFCache 与撤权分别验证，不把其中一项通过当作全部通过。Shadow DOM 不是安全沙箱；普通工具不获得官方 TOC 的后台权限。

卸载释放组件及受管资源，不是业务回滚器。用户外部监听器/计时器须在官方生命周期清理，已提交的表单或网络效果不承诺撤销。

## 6. 回归与验收

```sh
node --test tests/environment/page-ui-no-build-r242.test.mjs tests/environment/page-ui-import-drafts-r242.test.mjs
node --test tests/environment/page-url-scope-r241.test.mjs tests/environment/page-framework-examples-r241.test.mjs
node --test tests/environment/page-ui-mount.test.mjs tests/environment/page-installed-programs.test.mjs tests/environment/local-dev-managed-ui.test.mjs
npm run check
```

以上为现有回归入口，不包含全部待新增 R24.3 测试。实施前读取 testing-guide 和相关 workstream，按输入身份复用未受影响结果；新组件模式必须有定向与真实 Chrome 测试。

新验收包括：无 Native 浏览器路径、本地自动准备、四目录、标准 API、CSS/Source Map、旧入口与草稿、权限/导航/撤权、独立 Run/Stop、包预算以及窄屏/暗色/200%。各维度独立 >=95；设计自评 96 不等于实现分数。未测项保持 NOT_TESTED，不以静态 HTML、mock 或历史 Chrome 回执替代。

### R24.3 预构建组件草稿导入（2026-10-11）

在原 Sidebar 导入路径中，显式声明 `entryMode: "component"` 的 Page 项目支持只读 `src/App.jsx` / `src/App.vue` 源码快照。原导入者仍只执行经 SHA-256 校验、冻结的 `program.js`，不是把 JSX/SFC 在特权扩展页面求值；不会因导入自动安装或运行。React/Vue 框架由现有 `@opendesk-lib` 的固定版本声明决定，混用框架、未知入口和非法相对路径均拒绝。

旧 `async-main` / Controller 草稿合同不变。浏览器**直接编辑 JSX/SFC 并免 Native 编译**仍属于另一条待实施能力；导入预构建草稿不能替代该验收。
