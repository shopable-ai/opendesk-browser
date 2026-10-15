# ChatGPT Mind Map R2.1 — 固定引擎完整性与 HTML 预览增量记录

Date: 2026-10-15. Branch: `main` (only). Scope: `examples/programs/chatgpt-mindmap/preview/*`, `tests/environment/chatgpt-mindmap-preview.test.mjs`, 本记录。沿用 R2 工作流、已有 XMind 适配器、权限和构建路线，不建立第二权限体系。

## 已核对源码差异（为什么当前目录没有“大量 XMind 代码”）

原参考：`shopable-ai/shopable-station@b76abf4b95e34c1234a33927051ea13165d92715`。

| 旧项目路径/责任 | 当前项目对照 | 迁移判断 |
| --- | --- | --- |
| `public/lib/xmind/{jszip,polyfill,xmind-sdk,snowbrush}` | `tests/xmind-provenance.json` 记录但未携带字节 | **P0 缺口**。原始引擎 4,042,573 B 未进入正式安装包 |
| `xmind/convert.ts`、`skin.ts` | `src/xmind-convert.js` | 已迁真实 Workbook、主题、notes、branch 状态；继续保持单一产品实现 |
| `xmind/sdk.ts` | `src/xmind-adapter.js` 的能力检查 | 目前只做全局存在性检查，缺固定本地资源的正式注入/授权；不能声称安装可运行 |
| `xmind-renderer.ts` (37,995 B) | `src/xmind-adapter.js` (6,400 B) | 只读 subset：真实 createWorkbookEditor、缩放、展开折叠和 close。未移植旧业务编辑器、命令系统、React 面板，**不能用行数判断漏迁** |
| `xmind-renderer-seams.ts` (14,950 B) | 产品逐回复 Registry + 转换器路径标识 | 旧编辑/选择状态兼容层不必全量迁入只读工具；选中节点/备注/定位待真实验收 |
| `MindbankMindMapPanel.tsx` / React 页面 | `src/view.js`、`src/answer-registry.js` | 复用独立页面程序生命周期而非搬入 Next.js/React |

固定 4 个 Git blob 与原记录完全一致；本轮从 GitHub 目录元数据再次确认 **文件名、大小、Git blob SHA**。内容 SHA-256 沿用 R2 记录，**本轮无法再次读取本机原始字节执行哈希**，不可误报为新轮通过。

## 新增 P0-0：完整引擎独立 HTML 垂直切片

先用 `preview/index.html` 和 `preview/serve.mjs` 以真正同源的产品 Registry/adapter + 本地固定四件套进行正向预览。唯一资源身份来源是 `tests/xmind-provenance.json`，服务器启动前核对文件大小、SHA-256、Git blob，不以源码目录存在/脚本 200 就判定渲染成功。无需复制已在本地的原旧仓库资源。

`preview/app.js` 只承担 fixture 宿主和测试按钮/诊断，不包含新绘图算法；原业务行为来自 `src/answer-registry.js`、`extract.js`、`view.js`、`xmind-adapter.js`、`xmind-convert.js`。亮色 HTML 提供 A/B/C 以及 320px、操作栏重建、单回复更新、Stop/全局样式残留检查。CSP 固定 `script-src 'self'`，无运行时外部依赖；仅在独立预览文档中允许 SDK 现有的内联样式。

**验收层次：**
- `SOURCE_LINKED`：HTML/JS 导入真实产品源码，不能漂移到第二份预览实现。
- `ASSET_VERIFIED`：实际固定四个字节文件均通过 hash；不是第三方分发权利批准。
- `LOCAL_BROWSER_RENDERED`：在 Chrome/Chromium 真正点击打开主题、缩放、折叠、返回、Stop，并保留截图和控制器数据；未运行不得宣称。
- `PRODUCT_RUNTIME_ADMITTED`：可信本地运行路径、隔离及生命周期经原框架审查。
- `INSTALLED_CHROME_VERIFIED`：同一 candidate + receipt + extension ID，在登录后的 ChatGPT 自动运行，不需再次点击 Run。

单独预览页面的成功**不能替代**安装、授权、style/CSP 隔离及真实 ChatGPT。残留全局 `style` 是现有 SDK 的已知问题，须在可信运行边界内解决；绝不能把 `style-src 'unsafe-inline'` 的本地预览策略复制到生产站点。并且必须追索固定 Snowbrush 合并文件、其所有第三方代码以及准确版本的分发许可；官方 viewer/SDK MIT 不自动授予未知合并产物的权利。

## 增量验证和阻塞登记

静态/Node 定向入口：`node --test tests/environment/chatgpt-mindmap-preview.test.mjs`。真实正向资源验收命令见 `examples/programs/chatgpt-mindmap/preview/README.md`。本轮经 connector 直接写入 GitHub，**不能假设本地 Mac 目录、扩展 Profile 或 Native Host 可访问**。原 R2 成果与测试证据保持其原始等级，不覆盖。

- Resource bits / true browser preview: **NOT_TESTED** (本环境未获取四份原始资源供可执行浏览器验证)
- Local preview script/source: **SOURCE_LINKED** (新文件，待当前候选 CI 验证)
- Vendor license/distribution: **BLOCKED / insufficient evidence**，不是确认为禁止分发
- Common fixed local JS admission in installed Page USER_SCRIPT: **NOT_IMPLEMENTED**；现行 CSS/JSON/图片资产额度不能替代可信 JS Runtime
- Style isolation/cleanup on real ChatGPT: **BLOCKED**
- Source → Build → Candidate → Verification → Available → Installed: **R2 仅到 Build；新候选后四环节仍 NOT_TESTED**
- Independent 10 dimensions 95+: **NOT_SCORED**；95+ 是验收目标，不是作者愿望值

## 下一环节（不能跳步）

1. 在可访问旧资源字节的开发环境执行新 HTML 正向验证，记录真实 Chrome 证据，并修复发现的产品 `src/` 问题，不改成伪 XMind。
2. 对四个文件完成许可/来源闭包与逐项安全评估：提供原 SDK/viewer 与 Snowbrush 合并产物的精确版本、著作权归属、第三方 NOTICE/LICENSE、打包/再分发依据。没有材料只阻塞正式分发，不阻塞私有源码分析和组件测试。
3. 复用现有受审静态库/安装签名/运行世界，先证明可行，再给共享框架追加**最小**固定资源接线；检查 Stop、撤权、升级、卸载、BFCache 和文档隔离。不得因本预览通过而添加宽泛 `@require` 或任意远端 JS 能力。
4. 对同一个冻结产物走真实 Candidate→Verification→Available→Installed，记录 package/build hash、runtime hash、扩展与程序安装身份、Page Authority 回执以及登录后 ChatGPT 页面实测，之后再进行独立专家逐维打分。


## 固定二进制的新增许可发现（R2.1 原始 blob 只读抽查）

对原始 Git blob 逐项读取可解码代码及注释，不改变本仓库 vendor 分发策略。以下是 **已在原始字节中观察到的嵌入标头**，不是完整软件组成清单或独立权利审批。

| 固定文件 | 实际可见版本 / 授权痕迹 | 尚缺 |
| --- | --- | --- |
| `jszip.min.js` | 头部写明 **JSZip 3.10.1**，MIT 或 GPLv3 双许可证；标注内含 MIT pako | 与所包含版本完全一致的 LICENSE/NOTICE 及发布保留方式 |
| `polyfill-45b9836beb.min.js` | 未找到足以识别完整传递依赖的版权/许可标头 | 精确源码图谱、构建锁和所有对应许可证 |
| `xmind-sdk.bundle.js` | 包含 JSZip 兼容代码；自身未检出明确完整合并清单 | 与 XMind SDK 官方 MIT 发行版的构建对应、原始依赖许可证 |
| `snowbrush-2c2b5d62b5.js` | 内含 **jQuery 3.5.1/Sizzle 2.3.5**（MIT）、**Hammer.js 2.0.7**（MIT）、buffer（MIT）、ieee754（BSD-3-Clause），以及 **GSAP 3.5.1 / CSSPlugin 3.5.1**（GreenSock Standard License 自有条款） | XMind/Snowbrush 原始合并包权利凭证；GSAP 3.5.1 原许可及当前授权适用范围；完整 SBOM/NOTICE 和专有部分授权 |

原 Snowbrush 同时包含插入全局 `<style id="snowbrush_style">` 的调用；这与 R2 fixture 实测样式未随控制器关闭全部清理相符。**不能只调用 controller.close() 就宣布在真实 ChatGPT 中已完全清理。**

第三方许可重要细节：官方 XMind SDK 和 XMind Viewer 自称 MIT，不能推导包含它们的任意合并文件全体 MIT。GSAP 于 **2025-04-30** 改为更宽松的 Standard "No Charge" 许可，但仍存在禁止竞争性可视动画构建器等限制；对此固定二进制中的旧版 GSAP 3.5.1，**不能直接假定新条款已无条件追溯、也不能据此判定禁止分发**。源头：
- https://github.com/xmindltd/xmind-sdk-js
- https://github.com/xmindltd/xmind-viewer
- https://webflow.com/updates/gsap-becomes-free
- https://gsap.com/standard-license/

完成正式分发前需要：**完整原始合并构建记录/精确版本→逐依赖版权和许可证→NOTICE/声明保留→对固定实际二进制与 OpenDesk 安装包分发方式的权利确认**。这是一项明确的第三方权利批准门槛，不能被本地 HASH PASS 替代；继续保持全部 vendor 资产不入库、无 CDN、无 MAIN 注入。
