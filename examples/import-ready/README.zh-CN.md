# Page React/Vue 导入草稿 · R24.3 当前组件与 R24.2 历史兼容

**R24.3 当前可用：**四个现有示例目录（React JSX、Vue SFC、React 普通 JS、Vue 普通 JS）的 Page 草稿都已由实际项目构建器生成，分别保留官方组件源码的只读快照。导入不需要 Native 或项目 `node_modules`，但导入时执行的是已经生成、SHA-256 固定的 `program.js`，**浏览器直接编辑 JSX/SFC 并即时转换仍待完成**。来源：GitHub Actions [R24.3 JSX/SFC](https://github.com/shopable-ai/opendesk-browser/actions/runs/38153296137) 、[R24.3 direct 初版构建](https://github.com/shopable-ai/opendesk-browser/actions/runs/38154353845) 与 [React Direct 跨站悬浮更新](https://github.com/shopable-ai/opendesk-browser/actions/runs/38210525378)。

| R24.3 当前 JSON | 固定 Page `sourceHash` | 文件 SHA-256 |
| --- | --- | --- |
| `page-ui-react.opendesk-draft.json` | `97ff050d29977932156b130a01f2149799a2c821a65a25778c2f269591e3c557` | `5bbe94e8623770b68e25d223bf7e40da1066654502f6eda2428eb5cb0487b656` |
| `page-ui-vue.opendesk-draft.json` | `747838ef6225583e6128f906ec2491f0ce141b7f8f50f3d01e2bcf7877f8f0c0` | `fea91e9418d7d503c6b070e404c82c18f87bb209f88382d9fe55ed7deef23240` |
| `page-ui-react-direct.opendesk-draft.json` | `c3ad6f43aaedf2b59e14896df6414f7caaaf2392d01d02bb265030d9ac44146d` | `0af5dd2833d0722523f1c23a298c21d1a5abb49bb64d709a517254b0aa0e3224` |
| `page-ui-vue-direct.opendesk-draft.json` | `f83a08b3e2d9952cf5729276b01388b1fca8a5334ea683b5df00ad4e372618f5` | `423dae24742e16446e387a9b8d0e922fb39e3578f98a04b1f3837ce8aed8f873` |

从「发现 → 导入」选择上述 JSON，检查只读源码与实际构建产物，满足网站范围和 Chrome 用户脚本许可后，在「开发 → 直接编辑」明确点击试运行。此流程与旧普通 JS 草稿共用原导入、执行器、受管容器、停止与权限机制。**导入、预览与固定程序安装不是同一个动作。**

## R24.2 已发布历史快照（保留不改）
### 旧版 direct 草稿

两个 .opendesk-draft.json 由原 scripts/build-program-project.mjs 在 [R24.2 GitHub Actions](https://github.com/shopable-ai/opendesk-browser/actions/runs/38132269374) 生成，包含普通 JavaScript 和只读多文件源码快照，不是已安装工具或独立应用。React/Vue 框架由扩展提供，没有重复放入每个草稿。

| 文件 | 固定源码 SHA-256 |
| --- | --- |
| `history/r242-page-ui-react-direct.opendesk-draft.json` | 34b22968dacd96ad4f706be99e44aee5f46479f0cd82fb5e07cec5eea7ea4d52 |
| `history/r242-page-ui-vue-direct.opendesk-draft.json` | ca7c8e01193dfe1868244809bcbf440e15d073b9b109fafde49e02a842694885 |

## 当前手动导入步骤

1. 安全核对本地 main 和未提交改动，构建/加载对应 MV3 扩展，不覆盖其他 Agent 工作。
2. 标准测试页可在仓库根目录启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，Chrome 打开 `http://127.0.0.1:43111/demo-form.html`；**React Direct 悬浮示例还可在其他已获准的普通 HTTP(S) 网页手动运行**。
3. 满足 Chrome 网站许可和用户脚本条件，打开同窗口 OpenDesk Sidebar。
4. 发现 → 导入 → 导入任务包 JSON 或 JavaScript 草稿，选择本目录对应文件。独立目录标签页的导入会转给同窗口已打开的 Sidebar。
5. 返回开发 → 直接编辑，而不是本地项目；核对 Page 快照，点击“在当前网页试运行”。
6. R24.3 四个当前组件显示计数按钮，真实点击后计数递增；使用原 previewId 停止受管 UI，检查组件、样式和 DOM 清理。仅 `history/` 下的 R24.2 示例是高亮/撤销测试；两种行为不能混作同一回执。

导入、试运行和看到组件都不等于已安装或下次自动执行。当前文件是固定快照，不跟随磁盘源码变化。持续开发应使用 [React 普通 JS 项目](../programs/page-ui-react-direct/README.md)或 [Vue 普通 JS 项目](../programs/page-ui-vue-direct/README.md)。

**当前 React Direct** 示例的 `*://*/*` 可匹配普通 HTTP(S) 网页，但并不授予全站权限，跨站时需要独立 Chrome Site Access 和明确运行；不支持浏览器内部页及其他受限制页面。其他示例仍有各自独立的测试页规则，不因 React Direct 跨站化而改变。匹配范围也不取代正式安装授权。

## R24.3 源码变化时必须同步

- 四目录迁移后，需要发布的当前导入样例由真实准备/构建链重新生成，不手工拼接编译代码。
- 原快照与旧回执保留为兼容证据；新样例绑定新输入、框架/编译器身份、sourceHash 与实际测试结果。
- 一并更新导入校验、源码快照和当前产物一致性测试，不能只替换测试预期哈希，不能继续引用旧候选 PASS。
- 标准组件源码导入和现有预生成 JSON 导入是不同用例，都要经过原导入和权限流程；禁止导入即自动运行或自动安装。

## 现有自动检查

```sh
node --test tests/environment/page-ui-no-build-r242.test.mjs tests/environment/page-ui-import-drafts-r242.test.mjs tests/environment/page-component-import-ready-r243.test.mjs tests/environment/page-direct-import-ready-r243.test.mjs
```

原生驱动为 tests/framework/page-frameworks-r242-native.mjs，沿用已有 CFT/Native/MCP。新 R24.3 测试需另行覆盖浏览器无 Native 的源码编辑/导入。SPA、BFCache、撤权主动清理、独立 20 次 Run/Stop、CSP、暗色/200%/窄屏等未取得证据的项目不能因旧示例曾通过而填 PASS。
