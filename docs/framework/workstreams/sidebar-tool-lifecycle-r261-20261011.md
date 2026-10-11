# R26.1 工具详情管理与启停回归

日期：2026-10-11。会话：01a12ae7-8346-7d63-acf2-389715be8715。
状态：IMPLEMENTED / COMPONENT_PASS / NATIVE_DEV_PASS；生产 SW 打包阻断仍未关闭，不构成整个框架 F3/ZIP 发布验收。

## 范围与实现

- 已安装工具每行只有一个详情入口，含图标、名称、描述、版本和停用状态；保留上游工具发现/预安装逻辑。
- 通用详情顶栏顺序为返回、标题、新标签页、设置、适用时显示隐藏、卸载；眼睛只为官方阅读目录的悬浮目录能力展示，并在卸载左侧。SVG、名称、焦点态与窄屏布局已经验证。
- 设置管理全局启停、当前网站授权和历史授权撤销。阅读目录另有网站/当前页面外观偏好及原有页面例外；其他工具不显示这些目录专用项。
- 眼睛恢复显示时清除相交的网站与当前页隐藏规则；仅写外观偏好，不更改授权。缺授权给出禁用原因，设置仍可进入。
- 启停是独立运行偏好，复用 installer、tool→catalog 锁、verified storage、既有 epoch。停用保留安装目录、数据、授权及偏好，恢复不自动创建 iframe；启停缺失兼容，损坏状态拒绝运行及修改并保留原始值。
- 宿主每次启动/请求/回程、TOC、剪藏、知识 Content Script、知识后台服务与工作区交接均重新检查启停及撤销代次。TOC 初始化旧回程与创建时的悬浮目录点击代次均有保护。普通工具的启停不会中断无关网页能力。
- 跨窗口停用立即销毁旧 iframe，同时保留已收到的表单/富文本草稿，只读显示供复制。快照最多 150000 字符，不含密码输入；只存当前窗口内存，不执行快照，不承诺恢复任意工具内部 JS 状态。
- 卸载继续经过确认及现有恢复清理事务，仅额外清理该工具运行偏好；安装、更新、停用和卸载未建立另一套 Runner/安装器/权限目录。
- 本地包确认导入后直接进入原有安装目录。同一包再次审阅不会重复安装。清单导入/只读开发预览未获得执行授权。

附带构建修复：新增上游 CryptoJS 在 Rollup CommonJS 默认配置下生成 constructor namespace helper，被既有严格扫描拒绝。仅对该固定 entry 使用 requireReturnsDefault:'preferred'，保留真正上游实现、扫描器、CSP 和所有字节预算；开发包和真实 SHA256 测试通过。

## 当前 main 与其他任务保护

开始 HEAD：63bcae0b9a739ce83b087232a8a8675f68bf4577；首次 fetch origin/main：a655d3ad433ca488bc5f1c9c308b14852853c1e7。用户确认不提供 apply.py，授权合理设计和人工完善，未运行来源不明脚本。

本会话未 merge、reset、clean、创建分支/worktree 或 push。另一个同步任务在本会话期间将 main 更新为 209016a8，stash 恢复产生三文件冲突；先备份各 stage 至 /tmp/opendesk-r261-conflict-backup-1791723121，再最小合并，保留预安装和发现页改动，列表遵守 R26.1 单入口合同。随后另一同步提交更新 HEAD 为 20d009ed9b554f95991992c5a50d10c2fcb157bd。

上述候选构建和 native 绑定 20d009ed 加当时可写工作区的完整源码输入哈希，验收结束逐项比对无漂移。随后同步更新 main，知识工具包冲突由其负责任务处理。第四轮同步收到 60ed45f3，新增上游知识新建接口及 SW health probe 预算修复；另一任务还在宿主/installer 增加 time-review 未提交逻辑。为避免提交它们，本任务将已测 R26.1 增量三方合并到最新 HEAD 的临时 Git index；真实文件和其他任务 index 不覆盖。对所选提交树补做验证后提交。

已测输入包含其他任务当时尚未提交的阅读目录/知识工具源码，不能把最终本任务 commit 单独解释为干净发布包。未覆盖或提交其他任务修改（包括 view.js、examples、知识原生驱动、全局 CSS/工作区测试与其他工作流）；最新 main 含外部冲突时无法提升此前候选为该主线的完整构建/Native PASS。

## 验证

原始日志、失败诊断、截图及绑定见 [证据目录](evidence/sidebar-tool-r261-20261011/evidence-index.json)。原始 .tap/.log 使用 .gz 无损压缩，避免原生终端空白触发 diff --check；用 gzip -dc 读取，不删改日志内容。

| 验证 | 结果 | 原始证据 |
| --- | --- | --- |
| 用户指定四文件 node --test | 95/95 PASS | requested-targeted.tap |
| 扩展到 TOC 授权/生命周期/显隐和知识收件箱的八文件 | 135/135 PASS | delivery-components.tap |
| npm run check | PASS，405 个 source/test/build 文件 | delivery-check.log |
| npm run build:dev | PASS，82 assets；严格包/CSP/哈希验证通过 | build-development-delivery.log、build/build-development.json |
| CryptoJS 源码 API、锁定身份及开发产物执行 | 3/3 PASS，同一库字节复用 | crypto-development.tap |
| 真实 Mac CFT 开发包详情管理回归 | REAL_CHROME_R261_PASS | native-delivery.tap、native-delivery/native-result.json |
| git diff --check | PASS | 提交前执行 |
| 额外生产构建 | FAIL：sw.js 330248 > 327680；去除本轮实现后的基线同样失败 | build-production.log、baseline-production.log、对应 FAILED 诊断 |

指定命令：

```sh
node --test tests/environment/sidebar-tool-enable-r26.test.mjs tests/environment/sidebar-tools-host.test.mjs tests/environment/sidebar-tools.test.mjs tests/environment/app-market-r3.test.mjs
npm run check
npm run build:dev
```

扩展组件命令在上述四文件后添加 reading-toc-auth-r41、reading-toc-lifecycle-r41、reading-toc-visibility-r46、knowledge-inbox-r1 的 tests/environment/*.test.mjs。首次失败与中间失败均保留，未改写为 PASS。

构建在独立临时源码副本中执行，未使用 Git worktree、未写共享 dist，依照根 package-lock.json 在该副本 npm ci；独占 guard 52019，已释放。快照目录与输入见 source-snapshot.json；已验证开发 dist 保留在 /private/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/opendesk-r261-source-x_p_4ucy/dist/development。

真实验收命令使用既有 tests/framework/app-market-r3-native.test.mjs，OPENDESK_NATIVE_R261=1、OPENDESK_NATIVE_BUILD_MODE=development、上述独立 dist 与独立 evidence dir；通过 tests/helpers/sidebar-tool-r261-native.mjs 扩展既有驱动。产品写操作走原生 Input/确认，storage 只读观察；未通过 storage 注入安排测试状态。

## Native 身份与范围

- 已测 HEAD：20d009ed9b554f95991992c5a50d10c2fcb157bd；sourceInputs 与最终 build receipt 完整绑定，验收结束无输入漂移。其后的同步与外部冲突见上节。
- 开发包 packageHash：79afa163021500b8165a213e85e425034ff4f619a48bce2f05f9eee25d437e3f。
- Chrome for Testing：Chrome/156.0.8078.4，macOS headless；扩展 ID：dojheamjabacibfgcfnilhffahpfghfp。
- 本轮真实网页路径/动态端口在 native-delivery/native-result.json 的 sites/r261.site。标准人工入口仍为 demo-form.html；本轮复用原有自动原生验收专用 /article 路由。
- 验证：预装工具通过确认卸载后重新本地导入、同版本重复审阅禁装、单入口列表、SVG/aria/order、无权限眼睛禁用、网站/页面隐藏交叉恢复、授权保持、320/360/400/600 CSS px、真实 200% Chrome 缩放、原生 Tab 焦点、网页停用撤销、恢复不运行 iframe、两个真实 Side Panel 同步、未保存便笺草稿副本、保存数据保持、取消/确认卸载及偏好清理。
- 原始 CDP/浏览器过程、dialogs、截图、Chrome stderr 在 native-result.json。页面 console/runtime/dialogErrors 均空；Mac headless 的 CVDisplayLink stderr 原样保留。
- 正常 Browser.close 退出；专用 profile 已删除、动态服务器和构建 guard 已释放，未碰现有 Chrome profile、43111 或共享 dist。

## 未测项与风险

- ChatGPT 知识 Content Script 和后台的真实网站停用/在途原生副作用，本轮只有组件与静态边界证据；已发出的下载/写入不能保证反向撤销，锁内事务的持久停用提交是撤销边界，未知效果拒绝成功回执、不盲目重放。
- 清单/开发预览提权、存储损坏和清理失败恢复是组件证据，未提升为真实 Chrome 故障注入 PASS。
- 生产 SW 超限为上游基线阻断，未提高硬上限；本轮没有生产 Native/F3/ZIP/发布验收。
- 提交前另一同步任务留下知识工具包冲突；最新整个 main 的 check/构建/Native 尚不能关闭，本轮 PASS 仅指上述已冻结候选和本任务保持相同输入的实现。
- 200% 缩放已测真实扩展标签页及后续 Side Panel；窄屏会换行，按钮顺序保持。
- 表单草稿副本有长度和窗口存活限制，工具自定义非 DOM 编辑状态可能没有副本。原官方目录包部分历史提示仍可能指向“工具列表授权”；这些已由其他任务修改的包源未被本会话覆盖，宿主真实授权入口是详情齿轮。
- 独立最终审查未发现生命周期、TOC 初始化/epoch 或草稿边界阻断问题。本任务本地提交不推送 origin/main，不代表其他任务或整个框架已发布。
