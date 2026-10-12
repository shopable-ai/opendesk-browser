# Cookie Editor · 本地核心 UI（R1）

这是 OpenDesk Browser 的 **Side Panel → 工具 → 发现工具**中的可选工具，沿用现有 `opendesk.sidebar-tool.v1`、官方发行目录、隔离沙箱和主设计规范。它不是另一个 Chrome 扩展。

> **当前状态：Cookie 编辑工作区已实现，真实浏览器 Cookie 读写尚未接入。** 界面展示醒目的“本地演示模式”提示。新增、修改、删除、清空、导入均只影响工具打开期间的临时内存。刷新同一工具可保留当前工作区，关闭或切换网站会清空数据；不会读取、修改或持久化真实登录 Cookie。

## 功能

| 模块 | 本轮支持 | 备注 |
| --- | --- | --- |
| 列表 | Cookie 数量、名称/域名/路径搜索、值默认遮挡，手动显示/隐藏，Secure/HttpOnly/分区状态 | 从空工作区开始，可显式载入两条虚构示例数据 |
| 新增与编辑 | name、value、domain、path、hostOnly、secure、httpOnly、sameSite、session、expires | 编辑保持原身份，拒绝重复、新旧值冲突与跨域 Cookie |
| 删除 | 单条、当前工作区全部清空 | 非阻塞工具内确认，未使用 `alert/confirm` |
| 导入 | 粘贴或本地文件；自动检测 / JSON / Header 字符串 / Netscape | 校验后显示“新增 N / 覆盖 N”，用户确认后一次性在内存合并；最多 100 条 |
| 导出 | JSON（保留对象字段）、Cookie Header 字符串、Netscape | 手动复制或下载 `.json`/`.txt`；导出超 150KB 拒绝，分区 Cookie 不允许降级到 Netscape |
| 浏览器网站 | `currentPage.info` 仅读取当前普通网页 URL，选择隔离工作区域名 | 无普通网页时使用明确标示的 `example.test` 演示工作区，不请求 Cookie |

### 格式示例

**JSON 对象数组**（导入也接受 `{"cookies":[...]}` 和 `{"sid":"value"}` 的简单对象）：

```json
[
  {
    "name": "sid",
    "value": "preview-token",
    "domain": "example.test",
    "path": "/",
    "hostOnly": true,
    "secure": false,
    "httpOnly": false,
    "sameSite": "lax",
    "session": true
  }
]
```

**HTTP Cookie Header 字符串**：

```text
sid=preview-token; theme=light
```

Header 仅包含名称和值，不包含域名、安全标记、过期时间等属性。

**Netscape**：每行使用 7 个 Tab 分隔字段（domain、includeSubdomains、path、secure、expiry Unix 秒、name、value），支持注释和 `#HttpOnly_` 前缀：

```text
# Netscape HTTP Cookie File
.example.test\tTRUE\t/\tTRUE\t0\tsid\tpreview-token
```

上面的 `\t` 表示实际文件中的制表符。

## 体验与安装

1. 构建最新版 OpenDesk Browser，载入 Chrome 扩展。
2. 打开 Side Panel 的「工具」→「发现工具」，找到「Cookie Editor · Cookie 管理」，按现有工具的审阅流程选择安装（**非预装**）。
3. 打开工具后先观察本地模式提示。点击「载入两条虚构示例」，或点击「＋」新增临时 Cookie。
4. 使用列表搜索、编辑/删除，点击导入图标粘贴 JSON / Header / Netscape，核对合并数量并确认。
5. 选择导出格式后点击「复制」或「导出」。扩展的 `user.export` 能力负责用户主动执行的受限文本复制/文件下载。

没有真实网页也可以测试 UI；有当前网页时，工作区域名自动与该网站对应。切换页面后 UI 会清空临时数据以避免误认。不要输入真正的生产环境登录 Cookie 用于 UI 演示。

## 文件与后续接入

```text
examples/sidebar-tools/cookie-editor/
  tool.config.json
  src/
    index.html   # 沙箱 HTML 片段
    style.css    # 映射 R27 的隔离样式
    main.js      # 本地 Cookie 数据模型、交互与导入导出
  README.zh-CN.md
```

源码修改后在仓库根运行：

```sh
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor
node scripts/build-official-tools.mjs --out artifacts/official-tools-release
node --test tests/environment/cookie-editor-ui.test.mjs tests/environment/official-tools-catalog-r45.test.mjs
```

打包器输出 `artifacts/sidebar-tools/cookie-editor/1.0.0/cookie-editor.opendesk-tool.json`，不会自动安装。正式扩展打包时，由 `official-tools/catalog.json` 生成经过 SHA-256 校验的官方可选工具包。

**待 Browser SDK 完成后再单独接入：** 通过可信宿主为经过安装校验的工具增加 `cookies.manage` 能力，逐站授权；按活动 Tab、documentId、host-only/domain/storeId/partitionKey 限制读取、编辑、删除和导入。届时需新增真实 Chrome 权限拒绝、授权撤销、并发导航、隐身隔离、导入部分失败、Cookie 前缀/分区兼容性专项测试。本轮不更改 MV3 Cookie 权限、不过度授予沙箱权限，也不把本地效果误报为真实浏览器成功。

**安全提示：** Cookie 可能包含能复用登录状态的会话凭据。敏感输入设置了 `data-sensitive`，受信工具桥不将其复制到普通草稿恢复通道。剪贴板和导出文件仅在用户点击后生成，务必谨慎保存和分享。
