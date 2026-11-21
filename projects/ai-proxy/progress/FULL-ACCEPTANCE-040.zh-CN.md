# AI Proxy 0.3.40 验收结论

**UI 通过 38/38（100%），业务通过 29/38（76.3%），S-REAL 通过。** D07 的 UI 从部分升为 `PASS`，UI 通过率由 97.4% 升至 100%。本次在 0.3.40 定向复测 D07 和 D03 的公共 HTTPS、状态刷新及实测耗时，其余用例沿用矩阵内对应版本的运行证据。S-REAL 沿用 0.3.36 的脱敏回执。[38 项矩阵](UI-FUNCTIONAL-TESTS.zh-CN.md#最新逐项状态及复测条件) · [0.3.39 验收](FULL-ACCEPTANCE-039.zh-CN.md) · [S-REAL](../evidence/s-real-20261119.json)

## D07 实测

从真实「扩展 → AI Proxy → 打开设置 → 网络诊断 → 基础诊断」进入 PC 的「基础代理诊断」。0.3.39 的「模拟出口探测」按钮禁用，未接入说明和公共 HTTPS 检测同屏。点击后者得到 HTTP 200、149 ms。0.3.40 将禁用按钮替换为静态「出口 IP 探测与下载吞吐测速」标题和「尚未接入」说明。辅助技术树读到标题及两个可用操作的名称，实按 Tab 和 Shift+Tab 可在「检测公共 HTTPS」和「重新读取状态」间往返。[脱敏运行证据](../evidence/ui-acceptance-040-20261119.json)

实点「检测公共 HTTPS」后，界面显示「HTTP 请求成功（非模型验证）」、HTTP 200 和 128 ms。「重新读取状态」保留该回执，未增加 HTTPS 请求。「测速」先说明下载吞吐未接入，三次明确触发的 GET 均返回 200，随后显示 p50 133 ms、p95 135 ms。两个测试主机名解析到自有回环 TLS 夹具，复用实际 Host 及 SDK。打开界面、点状态说明和键盘移动期间没有诊断请求。页面和 Worker 的请求记录及 Chrome NetLog 共核到四条诊断 GET、零出口 IP 探测请求，Chrome 代理设置与起点一致。Ego 同源预览实点确认 HTTPS 和耗时明确标为模拟。[脱敏运行证据](../evidence/ui-acceptance-040-20261119.json)

## 候选与复测边界

- **唯一正式 JSON。** 版本 0.3.40，717925 字节，SHA-256 `76ac45f2a183e4285a65706a008733f0722581bfac1024713a70609e69fe9620`。原打包器显式晋升并通过 `PROJECT_PACKAGE_MATCH`，正式文件和已安装候选逐字节一致。[正式包](../ai-proxy.opendesk-tool.json)
- **固定可信代码。** 在隔离静态开发候选中，用经 WXT 来源锁验证的新 `ui/tool-shell.js` 更新 0.3.39 测试底座。Chrome 实读该文件 SHA-256 为 `dd1585a92133e9bd7a69659416d83527b83b978a6f24faf5b63f9cb8e2dbbb17`，底座的 Worker 也与加载目录字节一致。扩展 ID 为 `dmplnllonnlkbmibofkjlebkajoedlah`，未连 dev serve。[加载身份](../evidence/ui-acceptance-040-20261119.json)
- **实际安装。** Chrome for Testing 155.0.8059.39 在临时 Profile 走扩展中心原审阅。取消无安装记录，确认后回读 0.3.40 同字节，实际 `SIDE_PANEL` 可信根唯一。测试 Profile、浏览器和夹具已释放。日常 Profile 升级、production、真实 AI 登录与模型调用、交易和正式评分本轮未测。[安装回执](../evidence/ui-acceptance-040-20261119.json)
- **定向检查。** 诊断、状态、HTTP 和可信准入 67/67，固定来源保护 3/3，打包 4/4。共享 R14 仍断言 48 px，现有源码为 53 px。另有两条旧可信 Host 集成夹具失败，分别依赖旧的当前页返回形状和未注入的 `clearClipRegions`。两处在本轮修改范围之外。[检查记录](../evidence/ui-acceptance-040-20261119.json)

业务仍有九项待关闭。A04 冷启动线路连续性实测失败，人工恢复路径沿用 0.3.39 的通过证据。P02、P06、R02 缺对应的受管线路能力，P05 缺轮换执行，S04 缺自动同步，D06 缺可撤销的使用统计，D07 缺真实出口 IP 与下载吞吐，O01 缺正式服务。D07 的 UI 通过只计入 UI 分子。[业务缺口和复测条件](UI-FUNCTIONAL-TESTS.zh-CN.md#最新逐项状态及复测条件)
