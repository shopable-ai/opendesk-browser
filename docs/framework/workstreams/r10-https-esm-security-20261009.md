# OpenDesk Browser · R10 HTTPS ESM 实施与验收记录

日期：2026-10-09。负责人：R10 HTTPS ESM 安全集成工作流。代码候选：[PR #39](https://github.com/shopable-ai/opendesk-browser/pull/39)（独立 `agent/r10-https-esm-security-20261009`；在通过必要检查与符合主集成规则前不直接写 main）。

## 基线与交叉分工

- 起点：`main` `ea9670df73561dc3460730de167ffc3baaa5306b`，真实仓库读取；不假定历史 SHA 是当前 HEAD。
- [PR #37](https://github.com/shopable-ai/opendesk-browser/pull/37)：Local Dev/MCP/Native 候选，目前本地 resolver 对 npm/HTTPS ESM 暂不支持，真实 Chrome CI 仍有失败；不复制其 Native/Controller。
- [PR #38](https://github.com/shopable-ai/opendesk-browser/pull/38)：旧 Background 依赖审计、npm lock/示例；此分支不接管它的独立迁移和 npm 回归。
- AGENTS.md 禁止未经验收的普通 Agent 直接写 main；本工作流采用独立 PR，留下可审查的代码和 CI。

## 已实施

1. `scripts/remote-esm-network.mjs`：Node HTTPS 请求，只选择完整 DNS 公网 A/AAAA 列表之一，固定实际连接的 IP、检查 TLS peer，拒绝重定向和私有/保留 IP；TLS 证书验证、响应流上限、MIME/编码和截止期限保持严格边界。
2. `scripts/remote-esm-modules.mjs`：普通 `build:program` 离线；`--lock-remote` 在可信本地开发构建时才走已固定的网络传输。防缓存目录和最终文件符号链接，哈希缓存不覆写；使用独占写锁目录避免并发静默覆盖。
3. `scripts/build-program-project.mjs`：去掉默认 `globalThis.fetch` 参数，确保 CLI 实际使用安全传输。保留既有 ESM 模块改写、不可变构建工件与 sourceHash。
4. `src/ui/page-dependencies.js`：普通脚本保持原路径，含未编译 `import/export` 的 Page 草稿在授权前给出 `E_ESM_BUILD_REQUIRED`，不从网页下载远程 JS。
5. `tests/environment/remote-esm-security.test.mjs`：模拟混合 DNS、重绑定、实际 peer、重定向、超大包/超时、锁竞争及符号链接；不攻击真实内网。
6. `.github/workflows/program-project-source.yml`：PR 单元/构建回归，并将仅本 R10 PR 或手工 dispatch 的真实公开 CDN 下载与离线再构建作为独立 CI job；CI **不执行未审查的 CDN JS**。

## 证据（按级别，不混淆）

- 早期 R10 安全候选 `a3b1e0ade47d7535b9e26c6752fad80be97bb32f`：[多文件源码构建](https://github.com/shopable-ai/opendesk-browser/actions/runs/37929228183) **PASS（Node/CI）**；不适用于后续变更的全部最终身份。
- UI 安全提示候选 `420760f5a789bc3161839c110440228a9256d362`：[多文件源码检查](https://github.com/shopable-ai/opendesk-browser/actions/runs/37929491284) **PASS（Node/CI）**，[Page 依赖打包](https://github.com/shopable-ai/opendesk-browser/actions/runs/37929491403) **PASS（组件/包）**。
- R10 代码候选 `21926e7fc92f40a90d5dc2f9680624fcd2a64da0`：[多文件源码 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/37930140128) **PASS（60/60 Node，含 import/export 和安全测试）**。其中 `live-https-esm-smoke` 独立 job 实际从公开 jsDelivr HTTPS 下载了 14 个模块，首次固定与离线重复构建成功；两次构建的 `sourceHash` 均为 `5e39e8c5dc53aa615ba5530ec13102747981bd19a540da2534f188fc8adc5ae1`。未在 CI 中执行第三方 CDN JS。
- 同一候选：[Page 依赖/包 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/37930140183) **PASS（打包/组件级）**，[Site access targeted CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/37930140154) **PASS**。
- Mac Chrome / Native Host / MCP / PR #37 编辑后运行 / 整体 F3 / ZIP：**NOT_TESTED（R10 当前候选）**。此前 main 的 Native CI 在 macOS Chrome for Testing `Runtime.evaluate` 超时并出现 MachPort rendezvous 权限错误（例：[main native job](https://github.com/shopable-ai/opendesk-browser/actions/runs/37927944806)）。这不是通过；也不能单凭同类环境失败断言 R10 无新回归。

## 已知范围与剩余任务

- **P0**：代码与模拟网络/文件系统攻击用例已提交；仍需验证最新 PR 的所有 CI 结果、真实 CDN job 和并发/符号链接实际行为；同 UID 进程主动并发替换目录组件的 TOCTOU 风险不由 Node 的 `O_NOFOLLOW` 单独彻底解决，不能把本地项目目录当恶意对手进程隔离沙箱。
- **P1**：Sidebar 尚不具备「直接编写 `import https` → 已授权 Native 构建 → 试运行」的自动连接。失败给出明确提示，不静默执行。npm + HTTPS 同图、远程 ESM 多种导出与 Source Map 仍需全面验收。
- **P2**：需要先完成 PR #37 的 Native/MCP 实接入，再在已授权目录复用 R10 的构建器，不允许第二套 RunHost。
- **P3**：真实 Mac Chrome 的同一候选 documentId / sourceHash / page result / Network / stop / 导航和断连无有效新证据，不计分。

## 质量规则

不能人为给出 95/100：网络安全、ESM、UX、离线、真实 Chrome、兼容六维分别扣分；**只有同一集成候选 CI 与原生验收满足用户合同才能宣称 95+**。代码提交、PR、fakeFetch、Node VM、CFT 启动截图均不代表完整框架正式交付。
