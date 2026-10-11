# Page React/Vue 导入草稿 · R24.2 现有文件与 R24.3 迁移

**2026-10-11 本次仅更新文档，下面两个 JSON 的源码、字节和历史哈希没有改变。**

[R24.3 设计](../../docs/architecture/browser-framework/page-framework-authoring-r243.zh-CN.md)和[执行 GOAL](../../docs/framework/prompts/goal-r243-page-framework-authoring.zh-CN.md)已保存。新的 JSX/SFC 源码导入、浏览器自动转换及标准组件入口仍待实施；不能把旧普通 JS JSON 导入成功当作新能力验收。

## 现有固定草稿

两个 .opendesk-draft.json 由原 scripts/build-program-project.mjs 在 [R24.2 GitHub Actions](https://github.com/shopable-ai/opendesk-browser/actions/runs/38132269374) 生成，包含普通 JavaScript 和只读多文件源码快照，不是已安装工具或独立应用。React/Vue 框架由扩展提供，没有重复放入每个草稿。

| 文件 | 固定源码 SHA-256 |
| --- | --- |
| page-ui-react-direct.opendesk-draft.json | 34b22968dacd96ad4f706be99e44aee5f46479f0cd82fb5e07cec5eea7ea4d52 |
| page-ui-vue-direct.opendesk-draft.json | ca7c8e01193dfe1868244809bcbf440e15d073b9b109fafde49e02a842694885 |

## 当前手动导入步骤

1. 安全核对本地 main 和未提交改动，构建/加载对应 MV3 扩展，不覆盖其他 Agent 工作。
2. 仓库根目录启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，Chrome 打开 `http://127.0.0.1:43111/demo-form.html`。
3. 满足 Chrome 网站许可和用户脚本条件，打开同窗口 OpenDesk Sidebar。
4. 发现 → 导入 → 导入任务包 JSON 或 JavaScript 草稿，选择本目录对应文件。独立目录标签页的导入会转给同窗口已打开的 Sidebar。
5. 返回开发 → 直接编辑，而不是本地项目；核对 Page 快照，点击“在当前网页试运行”。
6. 测试页文本区域旁出现组件，点击高亮/撤销；使用原 previewId 停止受管 UI，核对组件、标记、样式与受管资源清理。

导入、试运行和看到组件都不等于已安装或下次自动执行。当前文件是固定快照，不跟随磁盘源码变化。持续开发应使用 [React 普通 JS 项目](../programs/page-ui-react-direct/README.md)或 [Vue 普通 JS 项目](../programs/page-ui-vue-direct/README.md)。

测试范围仅 HTTP 127.0.0.1:43111，排除 /private/*；localhost、其他端口、HTTPS 或其他域名不是同一范围。范围匹配不取代 Chrome Site Access 或固定版本授权。

## R24.3 源码变化时必须同步

- 四目录迁移后，需要发布的当前导入样例由真实准备/构建链重新生成，不手工拼接编译代码。
- 原快照与旧回执保留为兼容证据；新样例绑定新输入、框架/编译器身份、sourceHash 与实际测试结果。
- 一并更新导入校验、源码快照和当前产物一致性测试，不能只替换测试预期哈希，不能继续引用旧候选 PASS。
- 标准组件源码导入和现有预生成 JSON 导入是不同用例，都要经过原导入和权限流程；禁止导入即自动运行或自动安装。

## 现有自动检查

```sh
node --test tests/environment/page-ui-no-build-r242.test.mjs tests/environment/page-ui-import-drafts-r242.test.mjs
```

原生驱动为 tests/framework/page-frameworks-r242-native.mjs，沿用已有 CFT/Native/MCP。新 R24.3 测试需另行覆盖浏览器无 Native 的源码编辑/导入。SPA、BFCache、撤权主动清理、独立 20 次 Run/Stop、CSP、暗色/200%/窄屏等未取得证据的项目不能因旧示例曾通过而填 PASS。
