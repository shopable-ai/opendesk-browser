# 阅读目录安装与更新：目标和关键测试条件

2026-11-09，开发阶段核心目标 **COMPLETE**。安装器修复提交：`536ad9d4c`；正式包升级提交：`8aa5b0ef1`。本记录只证明下列安装/更新与最小使用闭环，不表示 production 发布验收。

用户操作：在「扩展 → 导入扩展 / 更换安装包」选择正式 JSON，审阅确认后安装或更新，再打开目录并点击章节。

故障原因：官方 App 资源可以独立前进，旧宿主编译的阅读目录 pin 却仍停留在旧版，导致已由当前官方目录校验的新版包被安装器误拒为 `E_OFFICIAL_ID_RESERVED`。修复复用扩展自身的官方 Catalog 与逐字节包校验；保留编译 pin 快路径、审阅、来源替换、身份、权限及撤权保护。**宿主必须包含该修复，仅换 JSON 不能修复旧宿主。**

## 完成条件与结果

| 关键条件 | 结果与证据 |
| --- | --- |
| 正式包与源码、内置 Catalog/包逐字节一致 | PASS：原打包器 `--check-project`；快照包与正式 JSON 相等，Catalog ID/版本/字节数/SHA 一致 |
| 本地 JSON 全新安装，不再误报保留 ID | PASS：CFT 155、空临时 Profile、真实 `SIDE_PANEL`；确认前无 reading-toc，审阅显示「OpenDesk 官方发行 · 安装包已校验」，确认后唯一 v1.0.12 与正确来源/SHA |
| 同 ID 1.0.11 → 1.0.12 更新 | PASS：本对话上一轮 ego lite 原生 Side Panel，本地正式 JSON 实际确认更新，详情读回 v1.0.12、官方来源与 SHA |
| 更新保留数据、设置和主动停用状态 | PASS：定向安装器测试保留私有数据、网站/页面/浮层设置及主动停用状态，安装 epoch 正常轮换 |
| 安装本身不执行包 JS | PASS：Node 测试中的执行标记不存在；原生确认安装后沙箱为 0，主动打开才出现受限 iframe |
| 打开后读取章节并精准跳转 | PASS：本机受控文章列出标题及三章；点击第三章，scrollY 从 0 到 1940.5，目标顶部进入视口（87.89px） |
| 不接受未经校验的官方身份声明 | PASS：未审阅、本地伪造来源、伪造摘要、缺失目录、篡改字节、审阅后改包和过期基线均拒绝且不写存储 |
| 未知安装写入不盲目重放 | PASS：复用上一轮相关市场安装测试；注册写入丢失回执/不可读时保留恢复屏障，事务身份及只读最终确认仍校验 |
| 修复已进入实际测试宿主 | PASS：两个已加载 bundle 的源图中安装器源码逐字节等于当前修复文件；当前 CFT 快照编译 pin 已为 1.0.12，超出 pin 的新发行分支由定向测试覆盖 |
| 不损坏用户现有环境 | PASS：仅卸载空测试 Profile 自身的预装项来模拟新装；未卸载用户目录、未修改 Native 配对、未停止 watcher；测试浏览器已退出，临时 Profile 已清理，无残留 |

## 包与宿主身份

正式包：[reading-toc.opendesk-tool.json](reading-toc.opendesk-tool.json)，ID `reading-toc`，版本 `1.0.12`，42146 bytes。官方来源 `opendesk/reading-toc`，SHA-256：

```text
8f1f3ec7fda6417f3c971bea30cf11493492c528f476c584ef755e600f2df84a
```

本轮 CFT `155.0.8059.39` 从原产品「打开 OpenDesk 侧栏」按钮打开侧栏，`chrome.runtime.getContexts` 验证 `SIDE_PANEL`，不把普通扩展标签页当侧栏。加载路径为本机 `artifacts/reading-toc-installation-20261109/development-snapshot`，扩展 ID `oaocgdhibalmnpeemblbolmjpechigdl`。它是现有 `dist/development` 的独立静态开发快照；复制前后与快照文件哈希相等，不另起 Browser 构建覆盖 watcher。

受测安装器源码 SHA-256：`ba3309d0e57a6ede3158178d3b8b1667d9806d1638ab0c374a21bcdb08ffef39`。`ui/tool-shell.js` SHA-256：`94d30fe895d0b985e0d8965f0e4dc3e04305e2a2c9edbd1ab0552718627ab4ce`；`ui/sidebar-tool-host.js`：`64861b9caa6f653bc5cc4416be7e3407edd3bbdd499de2959a69fb3fb9d8a2d2`。这些身份限定证据对应的开发候选，后续变更需按实际影响补测。

## 定向验证与复用

本轮运行：

```sh
node --test tests/environment/reading-toc-official-identity-r11.test.mjs
node scripts/build-sidebar-tool.mjs projects/reading-toc --check-project
git diff --check
```

Identity 测试 **16/16 PASS**。本轮为原更新测试增加网站、页面与浮层设置保留断言。安装器源码与 `536ad9d4c` 一致，因此复用本对话上一轮 **11 项**相关 `app-market-r3.test.mjs` 结果：官方保留 ID、来源替换确认、不执行代码、幂等/过期基线、两项未知注册写入结果、事务身份、升级只读恢复、摘要与损坏注册表。本轮未重复不变输入的测试，也未执行全量 Browser 构建或根测试。

本机原始证据、截图、文件哈希、原生 Profile 身份与清理回执保留在 `artifacts/reading-toc-installation-20261109/`，汇总为 `acceptance.json`；包含原始证据哈希和清理结果的本机索引为 `docs/framework/workstreams/reading-toc-installation-20261109.json`。这些日志/快照按仓库规则不提交。

## 未测边界与旁路问题

用户日常 Chrome、production、真实 ChatGPT/知乎为 **NOT_TESTED**；受控文章通过不替代真实网站验收。上一轮 ego 更新与本轮 CFT 新装属于不同环境，分别记录，不冒称为同一个 production 候选。

测试 Profile 首次预装另报既有 `E_PAGE_RELEASE_CHANGED` Page 发行提示；阅读目录自身安装和使用闭环成功。此不相关 Page 预装问题未扩大进本次修复，不宣称整个框架无错误。
