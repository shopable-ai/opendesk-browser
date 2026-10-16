# Cookie Editor 真实批量导入修复 · 2026-10-17

状态：DEVELOPMENT_COMPLETE。负责人：本对话 leader；main only。起点 9dc6f4c63，执行期间其他会话安全提交持续推进 main；远端读取到 b40847bf6。保留其他会话全部修改，不建分支/worktree/PR。

写入：`examples/sidebar-tools/cookie-editor/src/{main.js,index.html,style.css}`、`tool.config.json`、唯一正式包、`README.zh-CN.md`，`tests/environment/{cookie-editor-ui,cookie-editor-r43-parity}.test.mjs`，本记录。子 Agent 的独立范围和结果见 `cookie-import-native-driver-20261017.md`、`cookie-import-sdk-batch-20261017.md`。

分类：现有 Sidebar Tool / opaque-origin iframe / 公开 OpenDeskSDK.browser.cookies / 原目录及原安装器；开发与打包 Skill。仅已证明的批量确认缺口交 Runtime Skill，解析器继续归工具。

用户样本只在本机原路径读取，不复制、不提交、不输出内容/值。结构检查：17447 bytes、30 条、3 条过期。原工具真实路径硬限制10条，解析器单条异常拒绝整批且UI隐藏具体原因。旧9/9证据不覆盖本样本。

资源：dist/development 归既有 npm dev watcher（观察到PID23751），本任务不写。端口43111已有Python服务，只读复用标准demo-form。观察到其他会话CFT PID52056，不能争用前台输入；先完成本地修复/定向验证，待真实资源释放后运行最小原生导入case。production使用 artifacts/cookie-import-real-20261017/ 独立快照输出。

验证目标：30条输入显示有效/过期/无效的逐条说明；有效记录属性保留、显式错误不改身份；一次站点授权后文本及真实文件选择器导入，新增/覆盖原生回读一致，错误输入可修改重试。只做受影响Node/包/构建与这些原生case，历史撤权/升级/缩放无关矩阵不重跑。

## 当前实施与验证

- 工具内逐条解析/预检，JSON、Cookie Header、Netscape保持各自语义。BOM、Cookie:、多行、额外等号、空值、导出回导已补回归。有效、新增、覆盖、过期、无效及重复身份逐条显示；原文保留以供修改。取消真实导入10条硬限制；明确150 KB/500条预览上限，自动按SDK字节和Store/Partition分批。
- 已证明公开SDK缺少一次确认的批量写；复用installed Authority及既有单条set/readback实现cookies.setMany，最多50条且不放宽既有12000-byte预算。每批一个真实Host确认，失败/未知立即停止，不重放。平台范围和133项定向验证见SDK工作记录。
- 原打包器临时候选→受影响87项测试→--promote-from→--check-project通过；提升2.0.20，唯一正式JSON SHA-256 a5f9372d855becd9207774473dfcfefb40dee8071e9f029d3e6e75ea75819874（132287 bytes）。晋升后UI/格式81项通过。批准预览未改。
- 独立只读合并树快照构建通过，packageHash 8702354f59a025d9c3eaec85e696a8c515e624e90151968fe16f270248132cfc，源码检查794文件通过。失败尝试及最终receipt保留在本任务artifacts，未写dist/development。该构建不是原生PASS。
- 用户最新明确“完成开发环境调试即可，不用生产环境”，覆盖先前production验收要求。已停止自己的旧生产基线CFT，取消production原生验收。后续复用现有watcher PID23773的真实 /Users/shopme/Documents/workspace/opendesk-browser/dist/development，不启动第二个writer。目录已同步2.0.20同SHA，Host/SW包含setMany；43119/43120监听，实际Chrome连接状态待记录。
- 原生资源已获Mind Map/AdBlock明确交接。旧基线已完成正式安装和单次网站授权；文件输入点击中心未打开当前Profile真实选择器。诊断证明落在filename区域，驱动修复为真实file按钮左侧。此中断不算导入PASS。
- 样本过期条数随时间变化，不延长expiry，不硬编码3条；最新组件预检30条、25有效、5过期。只在本机内存读取，无值/样本文件提交。最终真实开发环境验证待完成。

## 本轮直接收尾（2026-10-17）

负责人：本对话 leader 接续；仅原任务文件。最新用户禁止启动/协调其他聊天，本轮不发消息、不派新 Agent。初始本地 main a33d842200bf8371f667f5a9d0ae5ab0e4ea8806，远端继续正常推进（fetch 后 06cead240）；暂存区为空，保留全部并行差异。Git 写入由本对话在收尾短窗口串行执行。

SDK 冻结15文件 SHA 全部一致；工具 main/index/style/config 与已有成功构建快照相同；正式包2.0.20同 a5f9372d855becd9207774473dfcfefb40dee8071e9f029d3e6e75ea75819874。不重跑134项联测、不重新打包/升级/构建production。

本轮仅补样本精确身份观察器及原生属性比较回归，然后真实 sample file/paste 和独立 import-invalid。使用原 CFT155 指定二进制、独立临时Profile、原 dev watcher23773 的 dist/development；43111复用现有Python48261。当前无其他非孤立headed CFT，保留59188；原守卫保持不变。真实样本仅内存读取/本机原路径选择，不记录值/输入/截图。验证期间不修改driver或相关产品输入。

### 开发环境最小收尾结果

- 复用不变输入的134项工具+SDK联测、133项SDK、87/81项包/UI门禁及既有虚构样本Chrome PASS；本轮没有全量重跑、重新构建、重新打包或升版本。工具源码仍与原快照相同，SDK冻结15文件收尾前逐项同SHA。
- 本轮持续开发目录仍为 dist/development、watcher23773，实读两个工具宿主页“开发服务已连接”；真实ID ccfcjegpkdlgbclopjmadlcjedelidmf。使用指定CFT155与新临时Profile；所有本任务Profile已由原launcher清理，旧孤立CFT和其他会话进程未关闭。
- 样本文件与粘贴两个case：各30条，按本次时间25有效、5过期，0无效；各一次实际Host批次确认，25条原生精确身份/值/属性得到确认，5条过期跳过。文件首次新增21、覆盖4；粘贴覆盖25。文件末尾24条仍匹配、1条在已观测到正确原生写入后改变；粘贴末尾25条全部匹配。网站可自主改写Cookie，不能承诺导入后持续保持。数量不硬编码，未改变原expiry。
- 文件选择通过真实macOS原生框：按真实PID定位AX文件框、原生键盘路径导航与原生“打开”操作；未使用setFileInputFiles、DOM赋值或Cookie API写入。值与变化事件仅在内存，样本case禁截图/输入/CDP trace落盘。
- 样本原始证据：`artifacts/cookie-import-real-20261017/development-sample-closeout-5/native-core-2026-10-16T19-56-14-782Z-d447e799/`，两个指定case均PASS，driver/candidateUnchanged=true、launcher cleanup PASS。该原始report整体complete=false：两个case之后误进入fixture-only gap-cleanup，被首个只读断言拦截，未删除Cookie。后续补显式!sampleMode执行守卫及单项可执行回归PASS；保留原report不改写，也不重跑已PASS样本case。
- 错误恢复原生证据：`artifacts/cookie-import-real-20261017/development-invalid-closeout-2/native-core-2026-10-16T20-00-29-129Z-ecb29b77/`：具体JSON错误、输入保留、同一textarea修改、1条导入、原生回读及fixture清理均PASS，complete=true、driver/candidateUnchanged=true、launcher cleanup PASS。
- 仅修测试观察器：样本预览快照移至文件选择完成后/点击预览前；真实滚轮从Host右侧gutter滚动避免预览内层吞掉滚动；样本只读onChanged观察捕捉精确写入及随后变化；样本禁止fixture清理；错误状态按真实data-state读取。产品包未变。
- 本轮仅新增/受影响观察器7个单项回归分别PASS，日志为sample-observer/attributes/baseline/scroll/native-events/cleanup-closeout.tap与invalid-dataset-closeout.tap；最新driver syntax、定向diff检查PASS。保留先前文件选择超时、预览时间窗口、滚轮、动态值变化与错误class观察失败记录，未伪报产品失败或重写旧证据。
- production验收按最新用户指示取消，未执行；不评分、不宣称production/F3/ZIP PASS。本任务产品缺陷无新增未解决项；并行工作区差异必须原样保留。

Git交付：固定28个任务路径；保留本地a33d842独有提交及远端main全部历史，已用git merge-tree验证两侧提交树可无冲突合并。其他18个dirty文件逐字节保留，不stash、不覆盖、不混入任务提交；仅更新原先clean的远端路径并将本任务setMany的两处通用UI接线合并至当前宿主。主分支整合与任务提交均使用Lore决策记录，正常push、不强推。准确提交/推送收据保存在本任务忽略的artifacts，不改旧原生报告。
