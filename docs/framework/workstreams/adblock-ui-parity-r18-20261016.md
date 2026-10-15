# AdBlock UI Parity R1.8（2026-10-16）

## 当前工作范围与互斥资源
- Branch: `main`，只在本轮专属文件与核对后的 AdBlock 固定 DOM、CSS、生成器/定向测试写入；不触及其他工具业务及原生 DNR service/rules。
- 读取起点 main `cff9eff4a37c4e5cdd763c5b04edb3d35d704d2a`；原件 blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`。
- 不使用用户 Mac `/Users/shopme/Documents/workspace/opendesk-browser` 的项目或 Chrome Profile：当前连接仅 GitHub，不能声称 Mac 本地原生验收。
- 初始问题：原文件路径缺失（历史 Blob 仍在）、可信控制只有两个普通设置行，沙箱例外常驻，来源驱动预览不代表生产 UI。
- 原始证据：R1.6 `5ca0876` CI 76/0 Node 但 production build failed；独立预览 `3fd457c` 74/0 Node、6 离线 Chrome 场景，均不可晋升当前候选的 NATIVE_PASS。
- 分工：`REQUIREMENTS.zh-CN.md` 负责设计与数据映射；`adblock-ui-parity-r18-20261016.md` 仅记本工作流候选/证据；不改既有 R1.4 记录。
- 应由实际产物的同一候选核实：完整构建/版本/安装包 SHA-256、Chrome ID、真实权限/DNR/HTTP/生命周期、320–480px 同视口截图；缺失保持 NOT_TESTED。

## 分阶段验收
- Original file exact blob and SHA-256: SOURCE_VERIFIED (GitHub SHA-1 可证，Node SHA-256 测试待 CI).
- Current formal UI: gaps identified; UI rewrite pending in this snapshot.
- Functional Native Chrome: NOT_TESTED for R1.8.
- Product acceptance 95+: NOT_SCORED; never report PRODUCT_ACCEPTED without screenshots/native requests.
