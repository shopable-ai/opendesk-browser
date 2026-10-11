# Vue 普通 JS 网页组件 · 现有 R24.2 与 R24.3 兼容迁移

**本次只更新 README，src/main.js 与导入产物未改变。** 本目录保留为官方普通 JS 渲染函数示例，不强制所有用户改用 SFC。

[四目录总览](../../../docs/api/page-ui-frameworks.zh-CN.md) · [R24.3 方案](../../../docs/architecture/browser-framework/page-framework-authoring-r243.zh-CN.md) · [下一轮 GOAL](../../../docs/framework/prompts/goal-r243-page-framework-authoring.zh-CN.md)

## 现在怎样使用

在 src/main.js 使用 Vue.createApp、ref 和 h 的普通 JavaScript；没有 .vue 文件或模板编译器，不需要在示例目录 npm install 或运行 Vite。OpenDesk 本地解析器自动准备，框架来自扩展内经 SHA-256 校验的 Vue 3.5.22 固定资源，不依赖网站的 Vue。

先从仓库根目录启动：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

Chrome 打开 `http://127.0.0.1:43111/demo-form.html`。完成[开发连接安装配对](../../../docs/framework/local-directory-cli-r17.zh-CN.md)后，在本目录运行 `opendesk browser dev .` 并保持连接；Sidebar → 开发 → 本地项目 → 选择本项目 → 明确运行。Chrome 网站访问和用户脚本条件仍独立满足。

组件在原网页的受管 Shadow DOM 容器显示，按钮高亮/撤销 #sample-text；停止时调用 app.unmount，并清理自建标记、受管观察器和原示例修改。无需连接本地源码的体验方式见 [现成导入草稿](../../import-ready/README.zh-CN.md)。

保存只准备，下一次运行才应用；离开允许范围后的行为沿用原生命周期，不默默重放。pageRules 不是安装或网站授权。本工具不是 Side Panel 应用。

现有 main.js 仍有 @opendesk/ui 和相对模块导入，不能当成普通网页控制台脚本；direct 不等于单文件，也不等于侧栏“直接编辑”选项。

## R24.3 接下来修改什么

- 保留目录和项目 ID，简化 src/main.js，采用标准 `import { h, ref } from 'vue'` 与默认导出的普通 JS 组件。
- 共享准备层生成容器、createApp 和卸载，不让入门代码依赖内部全局变量或 createPageUI；先完成共享链再迁移源码。
- enhancement.js 只留作进阶网页高亮场景，原可逆 DOM 回归不删除。
- 旧 async-main 与旧 JSON 草稿继续兼容；组件入口与 main 入口显式区分，不猜测用户函数语义。
- 源码变化后真实更新当前 import-ready 产物及一致性测试，同时保存旧快照和回执，不把新哈希套到旧 PASS。

这些标准导入和自动组件入口仍待实施。默认 SFC 示例在原 [page-ui-vue](../page-ui-vue/README.md) 升级；两个 Vue 目录共享框架与准备机制，不重建两套执行器。
