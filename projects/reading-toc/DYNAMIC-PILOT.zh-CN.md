# 阅读目录动态应用试点

本轮完成目标：在既有 Sidebar 安装审阅中同时安装应用 UI 与 USER_SCRIPT 网页模块；网页目录的索引、定位、观察器和展示由应用包交付。先修通开发闭环，不进入 production、全量 CI 或独立评分。

## 已证实的缺口与边界

- 旧入口 `src/entrypoints/page-relay.js` 固定导入本项目 `trusted/page.js`。1.0.15 工具 JSON 只包含侧栏 UI，更新 JSON 不能替换网页业务。
- 复用已有 `opendesk.page-install.v1`、Installed Page Authority、原生 USER_SCRIPT world 和 managed UI 清理；缺少的是应用包与 Page 安装的身份关联，以及侧栏到该应用网页实例的受控请求。
- 最小公共范围：v2 工具包可选 `pageModule` 与 `page.module`；现有 Installer 组合审阅；Page 行绑定父包摘要、安装代际；同一 Authority 校验后才允许启动和通信。动态代码不进入可信 Content、Background 或宿主。
- 父应用停用、升级、卸载及 Chrome 撤权都使旧实例失效；安装回执未知不自动重放。新网页权限仍由现有 Chrome 可信手势审阅。
- 旧目录的站点/页面停用、显示偏好、位置和折叠设置通过一次性可信迁移进入该应用私有存储。损坏或容量不足时保留原数据并停止升级，不截断设置或扩大允许范围。

## 实施顺序与回归依据

1. 复用既有真实入口与算法测试，记录旧行为。
2. 为组合包补身份、源码完整性和来源漂移检查；为 Authority 补父包/代际/目标文档/撤权负向测试。
3. 将网页调度改为应用 USER_SCRIPT，复用现有 model/view/placement；侧栏通过公共桥请求同一网页实例。业务设置保留在应用内。
4. 接入原安装器及生命周期，迁移旧数据；移除固定网页业务入口。
5. 使用原打包器生成候选，相关检查通过后晋升唯一正式 JSON；冻结 Browser 基线后仅更新应用 A→B，检查真实网页变化及关闭侧栏后继续运行。

## 迁移前观察（2026-11-09）

- Ego TaskSpace 8 的本任务文章页中，旧目录自动显示；四个模式、章节列表与折叠按钮可见。扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；该观察不替代更新后运行证据。
- 索引、模式和位置定向检查 34 项中 33 项通过；唯一失败为旧测试断言扩展中心 React 源码必须含 `data-extension-action="primary"`。它没有执行产品动作，且属于并行 UI 变更范围，本轮不修该无关断言。
- 持续开发复用既有 `dist/development` watcher，不覆盖或停止其他服务。此处为迁移前观察；更新后的运行证据见下节。

## 交付证据

### 同 Browser 的应用独立更新（2026-11-09）

环境为持续开发，实际路径 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；调试页显示开发服务已连接。Ego TaskSpace 8 使用本任务文章 `http://127.0.0.1:43111/reading-toc-article.html`（1 个 H1、20 个 H2）和真正的原生 Side Panel，通过「扩展 → 导入」的组合审阅更新。没有替换加载目录、扩展 ID、Native 配对或停止已有 watcher。

先从已安装的旧 1.0.12 更新为 A 1.1.0，网页自动显示目录，侧栏读取到 21 个章节且点击章节真实定位成功。随后冻结 Browser 基线，仅通过应用包更新为 B 1.1.1；全程未重建或重载 Browser，更新后正常刷新本任务文章以激活新注册的 USER_SCRIPT。

| 核对项 | A | B |
| --- | --- | --- |
| 应用版本 / Page 修订 | 1.1.0 / 1 | 1.1.1 / 2 |
| 网页源码 SHA-256 | `1ba5fc51a599d65f619c55e0563393663367c0e26a4dad206e30b24a1a9ff616` | `627e14ca9c996c980b878c53409c955f99846420b81f21d63addbb28d9251abd` |
| Browser 已应用构建指纹 | `7db2dd2dc8a5650c1ae912fd3ff781cb67d3cd5558cee9c7afdc0e818f3808ca` | 相同 |
| 固定文件 | 116 个（排除官方包/目录数据） | 116 个哈希全部相同 |
| 网页折叠按钮 `:focus-visible` 的实测 outline-width | 2px | 3px |

B 的第 15 节点击后真实标题顶部为 `87.8984375px`，`scrollY=4081`，原 URL hash 保持空；焦点样式来自应用 `trusted/view.js`，按钮 `z-index=3`。旧实例在更新时清理，刷新文章后运行新模块，未把旧实例或临时 DevTools 样式当作更新结果。

### 同候选核心操作

- 侧栏隐藏本页浮层后，网页浮层消失，侧栏仍保留 21 个章节；恢复后浮层重现。设置的 `saved:true` 回执解除 dirty 状态，返回列表没有未保存提示；失败或未知保存仍保留关闭保护。
- 「管理阅读目录 → 停用应用」后，网页浮层和 `app.reading-toc` 受管 UI 均消失，产品显示数据和授权保留；通过同菜单恢复并正常刷新文章后可用。
- 关闭本任务的原生 Side Panel 后，网页仍有一个浮层和一个受管生命周期锚点；点击第 3 节后标题顶部 `87.8984375px`，hash 未改。TaskSpace 8 最后已释放，其他任务页面和服务未操作。
- 原生卸载、真实 Chrome 网站权限撤销未执行，分别为 `NOT_TESTED`；不得把主动停用结果替代这两项。网站撤权、父包缺失/摘要或代际变化、清理未知等保护由相应 Node 检查覆盖。

### 正式包与检查

原打包器从通过检查的同源候选晋升唯一正式包 `reading-toc.opendesk-tool.json`，版本 **1.1.1**，**123646 bytes**，文件 SHA-256 **`9d0d1000b9f28dda4bd2ed3e72ad445c537343409b302477e2295064836832f5`**；随后 `--check-project` 返回 `PROJECT_PACKAGE_MATCH`。原生导入使用的就是该候选；打包器自身的 `installed:false` 只表示打包操作没有安装能力，不覆盖上述独立原生安装证据。

首轮组合定向检查 **143/143 PASS**。提交前独立复核随后发现并修复两处框架问题：侧栏 `page.request` 不再持有会阻塞 Page 处理器 `storage.set` 的同一工具锁，派发前后仍复核安装、启停、代际和精确目标；Page 桥每次按真实 frame/document 取得当前已批准 URL，并校验发送者同源，使同文档锚点/history 变化不再误停模块，侧栏捕获目标仍要求精确 URL。

新增真实 Host→处理器→私有 CAS 写入及失效代际回归；Page Authority 定向检查由 21 项增至 **30/30 PASS**，覆盖同文档地址、排除范围、跨来源、文档替换和旧侧栏目标。相关回归先在修复前失败，再通过；最终以下 **9 个受影响测试文件全部通过**，语法和 diff 检查通过：

```sh
node --test tests/environment/app-page-programs.test.mjs tests/environment/sidebar-tool-page-module-package.test.mjs tests/environment/sidebar-tool-page-module-install.test.mjs projects/reading-toc/tests/dynamic-page.test.mjs projects/reading-toc/tests/legacy-upgrade.test.mjs tests/environment/market-trusted-install.test.mjs tests/environment/market-install-sheet.test.mjs tests/environment/sidebar-tool-installation.test.mjs tests/environment/sidebar-tool-export-bridge-host.test.mjs
```

范围覆盖组合包/来源漂移、可信确认手势和权限拒绝、父安装绑定/文档/world/会话围栏、私有存储 CAS 和容量、停用及不确定清理、未知安装只读恢复、旧设置迁移、索引/定位/隐藏与保存回执。旧 Page 定向回归 227 项通过；本轮不重复执行全仓测试。

最终两处框架复核补丁的原生复验为 **NOT_TESTED**：TaskSpace 已结束，未重复创建或操作已释放浏览器资源。上文真实 A→B 对应所列冻结 Browser 指纹，不冒充这两处最终框架补丁的原生证据。应用源码/正式包未再变化，最后一次 `--check-project` 仍为同一字节和摘要。

另外两个历史断言不作为产品故障修复：上述扩展中心 `primary` 源码字符串断言，以及 `sidebar-tool-enable-r26.test.mjs` 中要求 `E_OFFICIAL_ID_RESERVED` 的发行身份断言（与用户已取消发行匹配运行门槛冲突）。它们未被改成虚假 PASS。production、全量 CI、登录网站完整验收和独立评分分别保留 `NOT_TESTED` / `NOT_SCORED`，不自动进入下一阶段。

本机原始 A/B 运行记录保留在忽略的 `artifacts/sidebar-tools/reading-toc/browser-a.json`、`browser-b.json`；正式包和本记录与源码一同提交，不提交临时快照。
