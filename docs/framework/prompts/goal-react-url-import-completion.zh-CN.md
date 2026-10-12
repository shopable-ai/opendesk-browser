# GOAL：复用已有 URL import，让 React 网页工具真正使用第三方库

首要用户需求：作者在自己的 React 项目源码顶部写标准
import ... from 'https://.../module.js'，就能由 OpenDesk 的原有准备流程
固定依赖并运行；安装者使用已准备的 JSON，不必修改扩展、安装 npm
或手动往目标网页插入 script 标签。

本轮在真实源码上核查、实现、测试和提交，不再只产出另一份设计方案。
默认中文。目标仓库：https://github.com/shopable-ai/opendesk-browser
本地目录：/Users/shopme/Documents/workspace/opendesk-browser
唯一可写分支 main。遵守 AGENTS.md；不创建分支、Worktree、PR；不强推、
reset/clean 或覆盖其他 Agent。写入前核对最新 HEAD 与相关文件冲突。

## 必须保留的事实

已有 remote-esm-page 使用静态 HTTPS ESM import；不是从零设计此能力。
page-ui-toc-react-direct/src/main.js 已直接导入官方 D3 max.js 的 HTTPS URL，
并随项目提供 opendesk.remote-lock.json、真实上游缓存和 ISC 许可证。
当前 D3 只参与统计计算，不等于 ECharts 图表已经完成。
本地项目 URL import、浏览器只编辑源码、冻结 JSON 安装是不同入口，
不能把一条路径的成功算成全部成功。

## 先读这些真实文件

AGENTS.md
examples/programs/remote-esm-page/src/add.js
examples/programs/page-ui-toc-react-direct/package.json
examples/programs/page-ui-toc-react-direct/src/main.js
examples/programs/page-ui-toc-react-direct/README.md
examples/programs/page-ui-react-direct/package.json
scripts/lock-program-remote.mjs
scripts/remote-esm-modules.mjs
scripts/remote-esm-network.mjs
scripts/build-program-project.mjs
native-agent/local-dev/resolver.mjs
src/ui/page-component-preparer.js
src/scripting/user-scripts/execution-source.js
src/ui/sidebar-tools/package.js
以及原测试指南、react-url-import-20261012 工作记录和项目/JSON 架构文档。

## 按实际需求推进

1. 先跑通现有示例的完整链路。
   执行 heading-stats.test.mjs、page-ui-toc-react-direct.test.mjs 和受影响的
   remote-esm 测试，修复真实失败。检查 URL 可见且确实参与计算、React
   仍来自固定框架、完整锁缓存可离线构建、JSON sourceHash 可复现。
   实测缺锁、缺缓存、篡改和 URL 变化阻断；不能自动联网补锁或退回本地函数。

2. 再完成真实 ECharts 接入，而不是把 D3 数学函数当成已交付图表库。
   先确认固定版本的真实 ESM URL、exports、许可证和完整传递依赖图。
   不把 UMD .min.js 当成 ESM，不虚构网址/哈希、不自动批准未知传递来源。
   测量源码图、最终 JS、JSON/Native 报文及运行资源的实际体积，再决定
   必要的按需裁剪或版本化资产支持；不盲目扩大所有预算或绕过原校验。
   在现有 React 示例内提供实际图表、数据更新、尺寸变化和错误状态，
   不新建另一套 SDK、安装器或依赖管理界面。

3. 检查只有浏览器源码编辑权限的作者路径。
   不假定该入口已经支持任意 URL 模块。若尚缺依赖准备，应在现有
   组件准备器/项目快照/安装审阅链补齐相应适配，复用原锁身份和安全规则。
   新来源首次准备需要明确确认，但保存、Run、重试不能暗中下载新代码。
   不要求用户修改扩展 src/libs、manifest 或 Service Worker；不以必须
   安装 Native/运行 CLI 来冒充这条浏览器内闭环已经完成。

4. 保持 JSON 和执行世界一致。
   package.json 是作者配置，不是安装包；保留现有各包类型及兼容性。
   Page 组件和库在同一个获准 USER_SCRIPT 世界执行；Side Panel 图表
   在自己的工具 iframe 中执行。不得向网页 MAIN 注入 CDN 标签或依赖
   网站 window.echarts，不修改网站 CSP，不在特权扩展页/SW 执行用户依赖。
   若确需新资源字段，必须同时实现 schema、构建、导入、存储、运行及
   更新/卸载，不得只写 JSON 字段；哈希或 JSON 包装不自动保证商店合规。

5. 验证生命周期和用户体验。
   ECharts 在容器挂载且有尺寸后 init，数据变化 setOption，尺寸变化 resize；
   React 清理 effect 中 dispose、断开 observer 和事件。加载中 Stop、
   导航、换版本或改源码后，晚到结果不得重新挂载。运行不自动安装，
   保存不自动运行；未知效果只查原回执，不盲目重放。
   保留当前 TOC、匹配规则、权限与已有组件入口。

## 交付与验收

先复用相关输入未变化的历史证据，只补受影响测试。
在实际可用环境验证：新依赖准备→运行→可见图表→数据更新→resize→Stop→
重跑→离线→JSON 导入/安装；保存 sourceHash、依赖哈希、实际包身份和
previewId/documentId 等回执。模型测试不算真实 Chrome，准备成功不算绘制成功。
按功能分别给出“已实现/测试等级/缺口”，不要用综合 95 分掩盖未实现项。

最终直接写入并安全提交 main，列出提交 SHA、改动文件、用户操作方法、
真实测试结果及未测项。环境不能访问用户 Mac 时如实说明，不伪造原生验收；
提供针对剩余实际缺口的本地验证命令，而不是要求用户下载补丁或 ZIP。
