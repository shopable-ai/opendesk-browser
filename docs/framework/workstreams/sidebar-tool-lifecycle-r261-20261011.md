# R26.1 工具详情管理与启停回归

日期：2026-10-11。会话：01a12ae7-8346-7d63-acf2-389715be8715。
状态：IMPLEMENTED / COMPONENT_PASS / NATIVE_PRODUCTION_PASS（本任务限定范围）；整个框架 F3、ZIP、发布仍为 NOT_TESTED。

## 实现结果

- 已安装列表每行只有一个详情入口，展示图标、名称、描述、版本/停用状态。保留现有发现和预安装逻辑，列表没有管理按钮。
- 详情共用顶栏为返回、标题、新标签页、设置、适用时显示隐藏、卸载。眼睛仅为阅读目录悬浮能力展示，并在卸载左侧；使用本地 SVG、aria-label/title 和键盘焦点态。
- 设置管理全局启停、当前网站授权和历史授权撤销；阅读目录另有网站/仅当前页面的外观偏好和页面例外。恢复显示时清除相交的两级隐藏规则，只写外观偏好。缺权限的眼睛有明确禁用原因，设置仍可打开。
- 停用工具可进入管理详情，不创建 iframe；重新启用不执行代码，需用户主动打开。运行偏好与安装目录、网站权限、外观偏好独立；停用保留用户数据、授权和偏好。
- 复用现有 installer、tool→catalog 锁、verified chrome.storage.local、撤销 epoch 和卸载恢复清理事务。启停记录缺失兼容默认可用；损坏记录拒绝执行/修改并保留原始记录。
- 宿主启动、请求和回程，TOC、网页剪藏、知识 Content Script、后台服务及工作区交接均重新校验启停和撤销代次。TOC 初读回程及 view 创建时代次有保护；无关工具变化不撤销其他工具能力。
- 跨 Side Panel 停用销毁旧沙箱，同时保留已经收到的表单/富文本草稿供只读复制。快照最多 150000 字符，不含密码输入，仅存当前窗口内存，不执行快照，不保证任意内部 JS 状态恢复。
- 本地包在确认导入后进入原安装目录，同版本重复审阅不会重复安装。卸载仍需确认；只读开发预览及清单导入没有执行权限。
- 阅读目录的历史授权提示改为详情设置入口。CryptoJS 仅对固定入口使用 requireReturnsDefault:'preferred'，保留真实实现与严格扫描；SW 仅许可四个固定同扩展单字面量启动资源，计算/远端/成员调用/非 SW 导入仍被拒绝。没有新增依赖或放宽字节预算。

## 源码、提交与其他任务保护

开始 HEAD：63bcae0b9a739ce83b087232a8a8675f68bf4577；首次 fetch origin/main：a655d3ad433ca488bc5f1c9c308b14852853c1e7。用户明确不提供 apply.py，授权合理设计与人工完善；未执行来源不明脚本。

本任务在真实 main 编辑，未创建分支/worktree、未 reset/clean、未推送。其他同步任务持续更新 main，并在本地 e268eb6c4e267c1d71125f91a7e14cb46acb44a9 中纳入大部分 R26.1 实现。四个固定启动资源补充提交为 c96c65da1071a72b090b66740894101b9d145a1d。最终源码提交为 **22ed2b1b88874ef564ada5a903f8f0ba0a33bbcf**，包含 c55bade0 已整合的上游输入及阅读目录提示修复。

使用临时 Git index 选择本任务差异，以预期父提交的 update-ref 原子条件提交，避免夹带并行 Time Review、Cloud Control、依赖草稿和其他未提交修改。真实共享文件和其他任务的 index 内容保留；只对本任务已确认无其他待提交差异的路径同步提交后的 index。未覆盖旧 receipt 或伪造资源释放。

从最终提交树导出独立普通源码副本（非 Git worktree）用于构建和测试，不写共享 dist。1626 个相关源码、测试、脚本、examples 和配置输入与该 Git 提交逐字节匹配，见 accepted-source-binding.json。之后主线或工作区其他任务的变化不自动继承本候选 Native PASS。

## 最终验证

原始日志、全部失败诊断、截图和身份绑定见 [证据索引](evidence/sidebar-tool-r261-20261011/evidence-index.json) 与 [最终绑定](evidence/sidebar-tool-r261-20261011/accepted-binding.json)。.tap/.log 以 .gz 无损保存，可用 gzip -dc 读取。

| 验证 | 最终结果 | 原始证据 |
| --- | --- | --- |
| 用户指定四文件 node --test | 96/96 PASS | accepted-requested.tap.gz |
| 加 TOC 授权/生命周期/显隐、知识收件箱的八文件 | 139/139 PASS | accepted-components.tap.gz |
| npm run check | PASS，407 source/test/build 文件 | accepted-check.log.gz |
| npm run build:dev | PASS，86 assets，严格包/CSP/哈希验证 | accepted-development.log.gz、accepted-build/build-development.json |
| npm run build | PASS，62 assets；SW 322660/327680，剩余 5020 字节 | accepted-production.log.gz、accepted-build/build-production.json |
| CryptoJS API、源码身份、生产/开发包真实 SHA256 | 4/4 PASS | accepted-crypto.tap.gz |
| 真实 Mac CFT 生产包详情管理回归 | REAL_CHROME_R261_PASS | native-accepted.tap.gz、native-accepted/native-result.json |
| git diff --check、限定提交差异检查 | PASS | 最终提交前执行 |

```sh
node --test tests/environment/sidebar-tool-enable-r26.test.mjs tests/environment/sidebar-tools-host.test.mjs tests/environment/sidebar-tools.test.mjs tests/environment/app-market-r3.test.mjs
npm run check
npm run build:dev
npm run build
node --test tests/environment/crypto-js-r158.test.mjs
```

扩展组件命令在四文件后添加 reading-toc-auth-r41、reading-toc-lifecycle-r41、reading-toc-visibility-r46、knowledge-inbox-r1 的 tests/environment/*.test.mjs。

原生验收复用 tests/framework/app-market-r3-native.test.mjs，OPENDESK_NATIVE_R261=1、OPENDESK_NATIVE_BUILD_MODE=production、GITHUB_SHA=22ed2b1b88874ef564ada5a903f8f0ba0a33bbcf；通过 tests/helpers/sidebar-tool-r261-native.mjs 扩展既有控制器。OPENDESK_NATIVE_EXTENSION_PATH、OPENDESK_BUILD_EVIDENCE_DIR 和独立 profile 都绑定下述候选。产品写操作走可信原生 Input/确认和真实文件选择；storage 只读观察，protectedStorageWritesFromDriver=0。

## Native 身份与范围

- 源码提交：22ed2b1b88874ef564ada5a903f8f0ba0a33bbcf。
- 生产 packageHash：d4b8e452205a03c459691255587da2ca2bbb1c71b80a72b0d96d9a9e0c3a895a。
- 开发 packageHash：63b24a5728f11d8983e7e0a11102713ad086e7fb652487a7fdbf87dd145f7da7。
- Chrome for Testing：Chrome/156.0.8078.4，真实 macOS headless；扩展 ID：oekhdpmangfomejjjdheieiofflkdmdo。
- dist 和真实网页路径/动态端口见 accepted-binding.json、native-accepted/native-result.json 的 extensionPath/sites/r261.site；本轮使用已有自动原生驱动的 /article 路由，标准人工入口仍为 demo-form.html。
- 验证：经确认卸载预装工具、一次本地导入、同版本重复审阅禁装、单入口列表、SVG/aria/order、缺授权眼睛禁用且设置可用、两级隐藏交叉恢复且授权保持、320/360/400/600 CSS px、真实 Chrome 200% 缩放、原生 Tab 焦点、TOC 停用立即撤销/保留权限/恢复不自动运行、两个真实 Side Panel 同步、已保存笔记保留/未保存草稿只读恢复、取消卸载和确认清理。
- Chrome stdout/stderr、版本、argv、dialogs、CDP 过程和截图均保留。consoleErrors/runtimeExceptions/dialogErrors 为空；macOS headless CVDisplayLink stderr 原文保留，不算产品错误。
- 正常 Browser.close 退出，专用 profile 删除、动态服务器和 guard 52019 释放。未操作个人/他人 Chrome profile、43111 服务或共享 dist。

## 历史结果与未测项

此前 20d009ed 加当时工作区输入的开发包 Native PASS 仍保留在 native-delivery，并保留其 packageHash/sourceInputs；未把旧身份改写为最终 PASS。此前生产 SW 330248 超限的基线与候选失败日志完整保留；上游既有健康探针拆分加固定资源扫描合并后，最终两种构建通过，旧阻断已不适用于最终候选。

- ChatGPT 知识 Content Script/后台真实网站停用与在途原生副作用：本轮仅组件/静态边界证据。已发下载/写入不能反向撤销；锁内持久停止为撤销边界，未知效果不确认成功、不盲目重放。
- 清单/开发预览提权、损坏存储、失败清理恢复：组件 PASS，未执行真实 Chrome 故障注入。卸载确认/清理及停用保留数据已做真实回归。
- 整个框架独立最终 F3、ZIP 安装、发布均 NOT_TESTED。后续并行主线或未提交功能未被本回执接受。
- SW 硬预算剩余 5020 字节；tool-shell.js 373884 字节触发软审查，低于 524288 硬门限，未提高预算。
- 草稿有长度和窗口存活限制；任意非 DOM 编辑状态不保证恢复。
- 独立只读审查未发现生命周期、TOC 初始化/epoch 或草稿边界阻断。本任务提交只保存本地 main，不推送 origin/main。
