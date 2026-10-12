# R24.5 浏览器编译器独立版本工作流

日期：2026-10-12。分支 `feature/r245-optional-browser-compiler` 从创建时 `main` 的 `43e7e47703b0fff40be2d9e5140dde91d7e20279` 快照起步。**用户本轮明确要求创建这个独立分支；未授权合并和发布。** 本工作流不更改当前 main、不对用户 Mac 本地文件系统做写入、不启动共享 Chrome Profile 或端口。

## 目标及方案

1. Standard **默认**构建实际去除浏览器 Babel 7.29.9 + Vue SFC compiler 3.5.22 + 受信 Worker 及链接资源，减去至少 4,249,817 未压缩 JS 字节；保留共享 React/Vue 运行时与 Direct 功能。
2. Developer Edition 是同源代码的**另外一个安装包**，物理文件独立，支持原 Chrome 直接编辑组件编译链和原用户脚本执行器。
3. 本地 Node `@shopable/opendesk-dev` 保持原有自动准备；不新写 Node JSX/SFC 编译器、不扩大权限、不改变 Controller/Page 业务执行环境。
4. 同一源码 tree 通过受限 `OPENDESK_BROWSER_EDITION=standard|developer` 决定输出资源闭包，输出不同 packageHash、Build/ZIP 证据与 manifest 名称；不通过前端开关伪装精简。

## 组件及资源变更

- `scripts/browser-editions-r245.mjs`：严格枚举版本、产物目录、marker 精确字节及固定浏览器资源闭包。
- `scripts/prepare-public.mjs`：普通版不复制编译器文件及许可证；所有版本都写 package edition marker。
- `scripts/verify-package.mjs`：根据 marker 推导**严格的期望文件清单**；普通版发现多余二进制、ESM 或许可证直接失败；Developer 的供应链 SHA 和许可校验不降低。
- `scripts/audit-fixed-entries.mjs`：加载组只对实际包含的 Developer compiler 进行统计；普通版的 startup 仍无 compiler。
- `wxt.config.mjs`、`scripts/build.mjs`、`scripts/pack.mjs`：扩展身份/构建包区分，生成 `production` 与 `production-developer` 独立路径和 ZIP。
- `src/ui/script-editor.js`：普通版关闭 React/Vue JSX/SFC 直接编辑控件并拒绝越权调用，同时保留本地项目和普通 JS 运行入口；Developer 保持原编辑能力。
- 新测试 `browser-editions-r245.test.mjs` / `browser-edition-package-r245.mjs`：分别校验来源合同与**真实包文件**的双版本精确资源差异。
- 验收 CI `.github/workflows/browser-compiler-editions-r245.yml`：Ubuntu 运行受影响检查、双生产包构建、验证、真实 ZIP 导出和差异报告；不会自动发布 Release。

## 证据与阻断

- 原本的 R24.3/24.4 本地编译、Mac 浏览器编辑 Run/Stop 及四目录 CLI 安装的历史原始 PASS 保留，不能直接归属为新分版。
- 新分支双版本 CI：**以 Actions 实际结果为准**；编译器文件实测差额不等于 ZIP 差值或运行时内存。
- **正式发布 BLOCKED**：需 Developer 真 Chrome 的 JSX/SFC 编辑、交互、Stop、无 Native 输入；Standard 真 Chrome 的普通 JavaScript/React/Vue Direct、旧草稿与本地 Native 链；分别安装/更新、扩展 ID 和对应 Go 授权；以及生产包与 ZIP 的同身份证据。
- 同一开发分支验证未完成前，不给独立 95 分；不创建 PR，不发布、不合入 `main`。
