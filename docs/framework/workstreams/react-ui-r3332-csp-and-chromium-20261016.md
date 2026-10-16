# R33.3.2 React 构建安全及真实 Chromium 测试整改

- 基线 main: a636e4a399cc46e5f33abd038bb6e29f51ec7ad5（读取时，非最终提交 SHA）。
- 实施所有者：R33.3.2 React UI；仅修改固定 CSP 适配、WXT 组合、对应回归测试和隔离 Chromium 测试脚本。
- 不碰 examples/sidebar-tools、权限、Host、Installer、CSP、包预算或旧工作流。
- 原始失败参考： [React Chromium CI #38920559237](https://github.com/shopable-ai/opendesk-browser/actions/runs/38920559237)（CDP port unavailable）；[Sidebar 工具 CI #38921588526](https://github.com/shopable-ai/opendesk-browser/actions/runs/38921588526)（development 生成 ui/tool-shell.js 后，AST 拒绝 Function.prototype.bind）。
- 改动 A：仅 ReactDOM 19.2.0 固定 development client 模块的静态 bind 赋值，使用函数实例原型提取原生 bind。真实动态构造器仍由原安全扫描拒绝；新增正反测试。
- 改动 B：fixture 使用独立 HTTP Server 先匹配固定测试页面和模块，再交给 Vite transform middleware；延长 CDP 冷启动探测并保留失败诊断，绝不模拟 isTrusted 或 Host。
- 执行环境限制：本会话容器没有 Mac 源码工作区和完整 npm 依赖，也无法连接 Mac Chrome；不能将这里的静态审阅升格为 Node/WXT/Chromium/Native PASS。
- 下一验证门槛：对最终 commit 的 CI 确认 npm ci、Node tests、production/development 包、verify、真实 source UI Chromium；检查未通过项目后最小修复。同候选已安装 Chrome 扩展及五 Tab 收尾继续 NOT_TESTED，直到有实际安装回执。
