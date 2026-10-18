# Stay Focus R4.1 — 独立安装包网站规则建议接线

- 日期：2026-10-18。仓库：shopable-ai/opendesk-browser，目标分支 main。
- 目标：**同一 OpenDesk Browser 构建**，只更新 Stay Focus 的可安装 JSON，能改变可信后台理解的可申请网站规则；仅经用户明确确认后加入本地额度与 DNR。
- 范围：兼容旧 v1/v2 工具包、已有 Installer / Host / Authority / SW；不新增第二套 SDK、特权 JS 装载器或 Manifest 权限。
- 实际结果必须分开报告：SOURCE_IMPLEMENTED、NODE_PASS/FAIL、BUILD_PASS/FAIL、CHROME_NOT_TESTED、NATIVE_NOT_TESTED。源码实现、Node Mock 不能冒充 Chrome 后台拦截成功。

## 最小职责

| 层 | 文件/合同 | 本阶段职责 |
| --- | --- | --- |
| 安装包源 | `examples/sidebar-tools/stay-focus/tool.config.json` | 版本 1.0.2，新增有界 `backgroundPolicy`（Pinterest 建议），可改为不同网站的数据，无动态 JS |
| 通用包校验 | `src/ui/sidebar-tools/background-policy.js` 和 `package.js` | 只支持 `site-budget.v1`、最多 40 条网站建议、无 URL/代码、强类型与内容大小限制；必须声明 `focus.control`；稳定序列化绑定包身份 |
| 唯一打包器 | `scripts/build-sidebar-tool.mjs` | 把配置中的规则数据打包进既有同一 JSON，拒绝任意旁路字段 |
| Stay Focus 应用可信实现 | `trusted/policy.js`、`catalog.js`、`model.js`、`service.js` | 旧包旧 SHA 合同不变；新规则参与包授权 Hash；后台只呈现建议，不自动修改已保存的站点；被确认加入后沿现有 DNR/Alarm/持久状态运行 |
| 验收 | `tests/environment/stay-focus-r41-policy-package.test.mjs` | 包构建、恶意声明拒绝、重排稳定、版本身份与 DNR 读回的受控服务测试 |

本阶段**尚未实现**：完整公用多应用网站预算 SDK、业务自有默认清单与推荐组/工作时段的整体动态升级、任意后台业务算法更新、浏览器真实使用时间的原生验收。现有 `FOCUS_CATALOG` 仅保留作为旧包回退和未配置首次使用的兼容默认值。新包可扩展/改写显示建议，但不会静默变更已有用户设置。新增网站必须通过 `focus.site.put` 的受信任确认，并在安装版本被重新批准后开始执行。

## 快速验证

```bash
node --test tests/environment/stay-focus-r41-policy-package.test.mjs
node --test tests/environment/stay-focus-service-r1.test.mjs tests/environment/stay-focus-r1.test.mjs tests/environment/stay-focus-boundary-r1.test.mjs tests/environment/sidebar-tools.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/stay-focus
npm run check
```

安装包候选生成后、确认测试通过，仍须沿原 `--promote-from` → `--check-project` 发行门禁；没有达到门禁前不声称拥有已晋升正式发行包。

## 必须完成的 Mac Chrome 反证

1. 固定 OpenDesk Browser 的 extension ID、Manifest 与构建 SHA。用该**同一** Browser 构建分别安装旧的 1.0.1、更新至新 1.0.2（仅替换工具 JSON）。
2. 旧版本建立真实的原生限制、正常使用时间与自定义额度。升级后核对旧 DNR ID 段 `730000–730199` 已清理、已保存额度/使用时长没有重置。更新未确认的新网站**不应被阻止**；旧工具实例不得继续发送通过认证的消息。
3. 打开 1.0.2，确认新 Pinterest 建议从包数据出现；通过真实外层受信任点击加入。未启用期间不得写任何新的受限 DNR；然后明确批准重新启用。
4. 在真实前台页面使用到 1 分钟测试额度（不得测试代码直接写 usage/DNR），确认从 `chrome.declarativeNetRequest.getDynamicRules()` 读回的应用专属规则含新域名，真实导航至 quota 阻止页。
5. 关闭侧栏、重启 SW/Chrome，测试恢复；随后停用、撤权、卸载，原生 DNR 和数据清理结果必须读回。Time Review/AdBlock 自有规则、存储不能被清除。
6. 提交证据必须记录 Browser 构建 SHA、旧包 SHA、新包 SHA、Chrome 版本、用户点击回执、前台使用时间采样、DNR 原始 readback 与失败/未知状态。未完成全部步骤则 CHROME_NOT_TESTED，不得报 95+ 正式交付。

## 下一阶段（R4.2）

沿唯一 Browser SDK Registry → Schema → Authority → Chrome Driver 抽离可复用预算/时段/访问规则能力；迁移**真正拥有业务的应用规则模型**到应用包，保证新默认不覆盖用户修改。不要把 `src/stay-focus` 兼容转发再次迁移，也不删除仍承担固定 Chrome 驱动的代码。