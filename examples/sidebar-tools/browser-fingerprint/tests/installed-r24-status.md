# Browser Fingerprint R2.4 — 正式安装恢复验证记录（2026-10-29）

**最终状态：CHROMIUM_INSTALLED_FULL_CHAIN = BLOCKED；0.2.2 尚未正式晋升，MAC_CHROME = NOT_TESTED。**

## 原始目标与范围

正式安装 OpenDesk Browser Fingerprint 0.2.2，选择美国/德国/日本或自定义环境，经单站点可信授权在当前 Chrome Tab 内应用 UA、网页语言、时区、视口，使用独立 MAIN 世界读回后停止恢复。网页 QA 用途；不冒充公网 IP、物理 OS/屏幕、Chrome Profile 或防关联能力。HTTP Accept-Language 独立网络核验仍 UNVERIFIABLE，UA-CH 只验证低熵平台，Geolocation UNSUPPORTED。

## 已真实通过，无需重复开发

- 正式 Chrome for Testing 155 物理 Side Panel、可信 OS 输入、安装审阅、0.2.2 候选包安装、Chrome Storage 安装身份/能力、SDK/Host/React 沙箱均已验证。
- 0.2.2 候选包 SHA256 `ed80ae800e486b862393aac6f308f77046c7c9d03e598014ab8084f640515d95`，88599 字节；多轮构建内容一致。
- 美国 US：apply / MAIN 世界独立 UA、UA-CH 低熵平台、语言、时区、视口读回 / 单次可信 restore / debugger detach / 原始值独立恢复 / 正式 React `restored_limited` 全链 PASS。
- 德国 DE：正式 apply、MAIN 世界应用值读回、可信 restore 按钮及 debugger detach PASS；但语言列表恢复 FAIL。
- React 预设/CAS/草稿保护/SDK/Schema/CDP 已有实现，禁止重写；R2.2 Node + Host 定向回归 [40902058729](https://github.com/shopable-ai/opendesk-browser/actions/runs/40902058729) PASS。定向 App CI [40902058572](https://github.com/shopable-ai/opendesk-browser/actions/runs/40902058572) PASS（仅对应其 head_sha，不代表之后 main）。

## P0/P1 已精确归因与修改

1. 历史 CI [40897606912](https://github.com/shopable-ai/opendesk-browser/actions/runs/40897606912) 显示德国 React `restore_unknown` 且测试字段 `NO_INDEPENDENT_READBACK`。测试在 React 异步 `record()` 和 `setVerification()` 完成前采集旧空列表。
2. 提交 [37f3c3b](https://github.com/shopable-ai/opendesk-browser/commit/37f3c3b5915371093faf0ee255cdba583134c6f5) 仅修复最终报告等待/取证。CI [40899487111](https://github.com/shopable-ai/opendesk-browser/actions/runs/40899487111) 揭示真正字段差异：Host 按 `navigator.languages[0]` 读取仍为 `de-DE`，基线为 `en-US`；独立测试先前只读取 `navigator.language`，其值为 `en-US`。
3. 提交 [19cc5df](https://github.com/shopable-ai/opendesk-browser/commit/19cc5df80f3b291d237aef6d92d41258ca22be8d) 在恢复时清理 UA/Locale 模拟，并令测试独立读取 `navigator.languages`。CI [40900809210](https://github.com/shopable-ai/opendesk-browser/actions/runs/40900809210) 仍 FAIL（`navigator.languages=['de-DE']`）。
4. 提交 [ba653e9](https://github.com/shopable-ai/opendesk-browser/commit/ba653e93edc0fad27265a206a89d736164a72a20) 改为显式传 `acceptLanguage:''`，提交 [7331319](https://github.com/shopable-ai/opendesk-browser/commit/73313196b5bfbd3a1850fe79a564fa504676b263) 加即时读回。最新 R2.4 CI [40902058380](https://github.com/shopable-ai/opendesk-browser/actions/runs/40902058380) 仍 FAIL，原始证据 Artifact [12910057367](https://github.com/shopable-ai/opendesk-browser/actions/runs/40902058380/artifacts/12910057367)。
5. 最新独立 MAIN 真实值：原始 `navigator.language=en-US`、`navigator.languages=['en-US']`；德国恢复后 `navigator.language=en-US`、`navigator.languages=['de-DE']`；其它可核验 JS 字段均恢复、debugger detached、React `restore_unknown`。**这是实际不一致，不能降级为网络头 UNVERIFIABLE 以取得 PASS。**
6. 运行记录存储写入的未知回执与原生恢复不同，不能以历史写入失败说明 Host CDP 恢复失败。复测已经收敛；不再无原因尝试相同 CDP 清除命令。

## 尚未完成与安全边界

- **P2：BLOCKED**，德国真实 JS 语言数组未恢复；美国全链证据已保留。
- **P3：NOT_STARTED**，按要求仅 P2 完成才补必要导航、切 Tab、停用/撤权/卸载/更新、DevTools takeover 生命周期验收；R2.2 已有部分隔离级覆盖。
- **P4：BLOCKED**；仓库正式可安装 `browser-fingerprint.opendesk-tool.json` 仍 0.2.1。不得只改 JSON 版本号、不得提前发布 Catalog。即使修复成功，发行工作流还要求最新 main、相同 Source Commit、成功独立 App CI 与候选 SHA 门禁。
- **MAC_CHROME：NOT_TESTED**，不可替代 Linux 真实安装 R2.4 或假定通过。

## 下一轮只做必要工作

先只读复核最新 main、Chromium `NavigatorLanguage` 的缓存/覆盖清理机制、Chrome 155 行为与本证据，提出能够使**同一个 Document**的 `navigator.languages` 恢复到基线、且不注入网页伪造值/不隐式导航/不重复副作用的最小修复。若没有可验证方案，维持 `restore_unknown` 并标明浏览器限制，不再盲目重跑。只有新证据支持生产修改时才做一次针对性修复与全链 CI；P2 PASS 后再进入 P3/P4。
