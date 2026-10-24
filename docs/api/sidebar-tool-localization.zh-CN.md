# Sidebar Tool 应用级本地化合同（R2.1）

状态：2026-10-25 核心源码已接线，正式 Browser 构建与原生验收未完成。Reading TOC 是首个 Sidebar Tool 试点；包 metadata、语言包数据合同与运行接线的验证状态分别记录，不能以文档或 Node PASS 宣称真实安装完成。Page Program、Controller Task 和其他扩展类型以后接入，本轮不增加其语言包入口。

## 语言偏好与所有权

应用展示语言由可信宿主管理，设置键为 `opendesk.ui.locale.v1`，支持自动及 `en`、`zh-CN`、`zh-TW`、`ja`。自动选择、启动缓存和持久化失败处理以现有应用偏好实现为准；不得继续使用 R1.2「缺失一律中文、只有中英文」的旧描述。工具没有独立的全局语言写权限，缺少目标翻译时回退源文案。

本合同是框架 UI 展示状态，独立于 `chrome.i18n`、Browser SDK、网站语言和 AI 输出语言。用户正文、章节标题、业务记录、导航 ID、币种、时区、权限和身份不参与自动翻译。可信安装、网站授权、风险与安全文案由宿主维护，不从工具语言包覆盖，也不自动生成译文。

## 作者资源与正式包 metadata

单语言旧工具无需迁移。多语言工具在自己的 `tool.config.json` 中声明 `"locales":"locales.json"`，保留唯一构建器 `scripts/build-sidebar-tool.mjs`。作者文件示例：

```json
{
  "sourceLocale": "zh-CN",
  "messages": {
    "zh-CN": {"refreshLabel": "刷新阅读目录"},
    "en": {"refreshLabel": {"source": "刷新阅读目录", "text": "Refresh table of contents"}}
  }
}
```

目标行的 `source` 必须与当前原文一致，且占位符集合一致。构建器读取独立 JSON，不执行或扫描工具 JS 来提取文案；将唯一 `__OPENDESK_TOOL_MESSAGES__` 标记替换为编译后的纯文本表，供离线或旧预览环境兜底。

R2.1 在 `opendesk.sidebar-tool.v1/v2` 顶层增加**可选**只读数据字段 `localization`，不是顶层 `locales`，也不是另一种工具包格式：

```json
{
  "sourceLocale": "zh-CN",
  "sourceCatalogHash": "64位小写SHA-256（此处为说明，不可导入）",
  "messages": {
    "zh-CN": {"refreshLabel": "刷新阅读目录"},
    "en": {"refreshLabel": "Refresh table of contents"}
  }
}
```

metadata 中译文已是字符串；作者文件中的 `{source,text}` 不直接复制到该字段。旧包不补空字段，既有序列化字节及摘要保持不变。新包的 metadata 参与正式包摘要及原有版本/来源校验；老版不认识该字段的宿主不能假定兼容，应先更新支持 R2.1 的宿主。同步结构校验不等于 hash 验真，可信接纳仍须执行异步摘要验证。

`sourceCatalogHash` 算法：固定外层属性顺序 `sourceLocale`、`messages`；`messages` 仅含源语言键值，键用 JavaScript 默认字典序排序；`JSON.stringify` 紧凑序列化，不加换行、不做 Unicode 归一化，再对 UTF-8 字节计算 SHA-256。目标译文、工具版本及整个包摘要不进入此 hash；同源不同版本可复用翻译，但工具 ID 仍单独匹配。原文改动后必须重新生成 hash，并复核旧译文。

当前预算：`locales.json` 输入最多 96,000 字节；最多 12 个语言、每语言最多 160 键、每条文案最多 380 个 UTF-16 单元，键为 `^[a-z][a-zA-Z0-9]{0,63}$`。包整体上限仍为 320,000 UTF-8 字节，内嵌 JS 文案与 metadata 都计入，不能只算语言表。拒绝全空白或仅含 Unicode 默认不可见字符的文案、未知字段、原型危险键、HTML、事件属性、危险 URL、控制/双向控制字符和占位符漂移；不为翻译放宽 CSP、来源或资源限制。

## 独立语言包

Reading TOC 日语完整样例：[ja.opendesk-locale.json](../../examples/sidebar-tools/reading-toc/languages/ja.opendesk-locale.json)。格式为 `opendesk.locale-pack.v1`，字段固定为 `format`、`toolId`、`sourceLocale`、`targetLocale`、`sourceCatalogHash`、`messages`，每条消息为 `{source,text}`。样例包含 55 条原有业务 UI 文案；没有权限、安全授权或网页正文译文。

语言包是展示数据，不是 `.opendesk-tool.json`，不能当作工具导入或赋予能力，也不会仅因放入 `languages/` 就被打包器自动安装。宿主接纳时须核对工具 ID、源语言、当前 source hash、键、逐条原文、占位符和纯文本约束；危险数据拒绝；源 hash 改变时报告差异，只复用逐条原文仍完全一致的译文，失效/缺失键回退源文案。接纳、存储、移除、通知的实际产品入口由同一宿主实现负责，未测试的入口标记 `NOT_TESTED`，不虚构公共请求方法。

用户入口为扩展中心管理菜单的「语言与翻译管理」、现有 JSON 文件选择/拖放入口，以及工具设置中的「界面语言 / 翻译与语言包」。没有 metadata 的工具不显示无效语言控件。工具默认「跟随 OpenDesk」，覆盖偏好与语言包按工具独立保存在宿主键 `opendesk.sidebar-tools.locales.v1:<toolId>`，不占工具业务存储预算。语言包最多 256 KiB；每工具最多 12 包、合计存储最多 1 MiB。保存同一次写入中包括包与目标语言，随后持久化读回确认。优先级为逐条有效自定义译文 → 正式内置译文 → 源文案。

同 ID 升级保留语言数据并按当前原文逐条失效；确认卸载通过原安装器清理日志删除对应语言键。删除单个语言包不改变安装身份、授权、工具源码或业务数据。写入结果未知时禁止自动重放；通知刷新不能解除屏障，须用户明确重新读取存储。恢复前排队的旧请求仍然失效，新请求才可写入。全局语言偏好使用同样的未知结果与恢复语义，并通过同源 Web Locks 串行化跨页面写入。

## 手动 AI 补译

「导出缺失翻译 AI 任务」输出当前业务词条、源/目标语言、原文、占位符约束、`translationKeys` 与标准 `pack`。只翻译 `translationKeys` 中的 `text`；其他有效行完整保留，AI 仅返回 `pack` 对象，不返回外层任务或 Markdown。完整包经过相同导入预览和校验再保存，避免部分补译覆盖丢失已有译文。普通语言包导入仍按覆盖语义处理，删除的键逐条回退。

此入口仅下载数据；用户自行选择已有 AI Chat、ChatGPT 或 Codex。当前共享 Provider 的 consumer 白名单不包括语言管理，未扩大其身份/授权合同，未展示一键翻译按钮。没有后台上传、模型配置复制或安全授权文案自动翻译。

## 动态展示合同与试点范围

R2.1 工具从只读 `OpenDeskTool.messages` 获取宿主当前合成 catalog，保留内嵌 catalog 兜底。`OpenDeskTool.locale` 与 `onLocaleChange(callback)` 延续展示偏好合同；语言或 catalog 更新时工具重新读取 `messages` 并重新计算可用语言，不能仅捕获初始语言列表。宿主与工具代码是否已完成及对应证据见 [R2.1 交付记录](../framework/workstreams/locale-packs-r21-reading-toc.md)。

重绘只更新 `textContent`、Tooltip 和 ARIA，保留目录快照、视图、当前位置与业务状态，不重新请求 TOC、不触发导航或重建 iframe。动态 catalog 只读不等于工具获得宿主权限；权限、来源、身份、撤权和沙箱边界保持原合同。

网页悬浮目录由固定编译的可信 Content Script 在既有官方包验真之后读取同一受控语言 store，复用纯 helper 合成 catalog，再调用同一 view 的 `setLocale(next,catalog)` 原位更新。该源码已接线，Node 与真实 Chrome 状态仍须分别核对；JSON 包升级不会替换固定 Content Script。官方名称/简介和设置中的可信文案仍由其现有 owner 管理。其他扩展类型与全应用翻译不属于本试点完成条件。

## 同源交付与证据

文案、metadata 或 JS 改变包字节时须提升工具版本。执行唯一 [打包 Skill](../../.agents/skills/opendesk-sidebar-tool-package/SKILL.md) 的 candidate → 定向 tests → `--promote-from` → `--check-project`；晋升前候选必须匹配最新工具源码，主 agent 的动态 API 接线未就绪时不得晋升旧 JS。正式版本和 `src/sidebar-tools/official-reading-toc.js` 中的 SHA pin 以同一最终包字节同步，不编辑历史不可变 release 来伪造新版本。

`SOURCE_WIRED`、`NODE_PASS`、`PACKAGE_PASS` 与真实 Chrome 安装/升级独立记录。自动测试不证明原生安装、动态导入/移除、网页悬浮层、production 或 95+ 验收；无同候选证据统一记 `NOT_TESTED`。构建、提交、评分与当前阻断见 [R2.1 总交付记录](../framework/workstreams/locale-packs-r21-delivery.md)。
