# scrapyjs 返回恢复 · 2026-11-04

当前阶段为核心故障修复，工作在现有 `main`。不执行 production、评分或完整验收。

## 原生故障与根因

原窗口真实安装版为 **1.7.4**。采集根页显示“配置已保存 / 尚无运行”，宿主显示“当前工具正在保存，请完成后再切换”。进入原“本机试采 / 任务”后确认：历史 AI 请求仍为 unknown，本机原 request 查询返回 `Failed to fetch`。根页结果仅描述浏览器采集，不能代表隐藏本机工作区已空闲。

原生只读取证由同机 WebFlow owner 保存于 `artifacts/webflow-authorization-20261104/scrapy-native-task.ax.txt`，版本证据为该 owner 读取的标题 AXHelp。该历史窗口与两个原请求均保留；没有清锁、重放、强制重载或代替用户点击运行/停止。

## 修复行为

- 宿主根返回在已安装普通沙箱 busy 时只显示扩展列表；原 iframe、instance、草稿与请求继续存在。之后可查看其他 Tab，重开同 ID 恢复原实例。真正关闭、替换、更新、卸载仍走原保护。
- 子页导航、只读预览、可信原生 UI 保持原返回合同。宿主使用“未完成的操作”描述 busy，确认空闲后清除该条过期提示。
- ScrapyJS 根页提供“查看原本机任务”，使隐藏的任务恢复入口可见。未知请求仍只能查询或停止原身份，不应用迟到提案。
- 开发刷新检查纳入所有工具的 dirty/busy，显示列表不释放刷新围栏。安装包替换、撤权前后两种返回顺序均继续退役旧文档并保留可复制草稿；旧消息不能恢复权限。

## 定向验证

新增行为先复现失败，再修复通过：隐藏结构任务无恢复入口、根返回无法显示列表、开发刷新漏报，以及 epoch-only 撤权前后两种顺序。现有真实组件与 Host 夹具用于以下检查，不代表 Chrome 原生操作通过。

- Host 10 项 PASS：返回、重开同实例、原异步回包、关闭保护、更新/撤权/旧消息，以及未准入工具不可接管导航。
- ScrapyJS App / AI 10 项 PASS：空闲返回、隐藏结构任务恢复、终态解锁、错误身份/unknown/清理失回执/存储身份变化保留围栏、停止期间拒绝迟到提案。
- 原打包器与沙箱合同 6 项 PASS；候选包身份、Controller 与 Task pin 检查 1 项 PASS。共 27 项定向检查通过，不宣称全文件或全仓通过。
- App Vite 编译成功；原打包器候选 → 门禁 → `--promote-from` → `--check-project` 成功。

唯一正式包为 `../scrapyjs.opendesk-tool.json`，版本 **1.9.3**，1374735 bytes，SHA-256 `f30e3da1cc216d7b3a01d1c25b49294061a5aa1a926f85ebf313ef10cff18f19`。相对 1.9.2，ID、能力、站点范围、Controller 字节及委托 Task pin 不变。相对旧安装版 1.7.4 的升级仍须原可信安装审阅，不能据此声明已安装。

## 运行产物与限制

Browser 复用 PID 54212 的既有持续开发 watcher，加载目录保持 `/Users/mac/Documents/workspace/opendesk-browser/dist/development`，未启动第二个 Browser writer。磁盘开发 manifest 与 `ui/sidebar-tool-host.js` 摘要一致：revision `983643ebf078d07339d8fcc4130cf51dc4efc5bc558bf2654c3989c2513dfebc`，Host SHA-256 `fd6e2a4aa5a9f34c5b7467fd481a636cf5a5390bb1f9890a988814ff912d9373`。这仅证明磁盘产物；旧窗口是否已应用与真实新窗口操作分别核对。

**NOT_TESTED**：修复后真实 Chrome 返回/重开/跨 Tab、新 App 安装、真实未知请求终态、production、完整矩阵、独立评分。原窗口保留原请求，未为让新代码生效绕过刷新保护。
