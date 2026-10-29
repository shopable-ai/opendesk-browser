# Quick Notes React R2.3 交付记录

2026-10-19，Asia/Shanghai。按本轮最终范围收尾 React UI 迁移，复用已有功能与生命周期实现。缩放、不同像素/宽度均为 `OUT_OF_SCOPE`，不再作为门禁；历史原始记录保留。

本地正式 JSON 已由通过真实 Mac Host 检查的同一候选晋升，可在扩展中心选择 JSON 安装。当前候选的 Linux CI 尚未运行；不声明全维度 95+ 或远端正式发布完成。

## 源码与产物

- 初始本地 main：`63e53e718522bf6b44c4cfd4902dae0de36ef3e2`；安全快进后的实施起点：`149507305e9f5a0e0ab42d743ae439491f9ba242`。最终 Commit 由本次交付回复给出。
- 正式包：[quick-notes-react.opendesk-tool.json](quick-notes-react.opendesk-tool.json)，ID `quick-notes-react`，版本 `1.0.0`，29,489 字节。
- SHA256：`4019203b43d865f81eb9234cb448cf47ee445b4e8f5193bb7233ac83deb6185f`。
- Runtime：`opendesk.react-ui.v1`，宿主 React 19.2.0；复用 `@opendesk/ui`，包内没有第二套 React Runtime。
- JS：13,152 字节，SHA256 `5f13618a0d7b961211a32512f87c21680b4c347d42e2eed5beb3322f4c5b2c0d`。
- CSS：3,014 字节，SHA256 `b3d82f7335ee83aae1a2f4d4122e9d496cd9cb7ebb9bce9ee5da40dd3d2d863d`。与既有 Build Receipt 及打包检查一致。
- 原生工具保留 `quick-notes@1.1.9`，32,152 字节，SHA256 `9b8125e8f25734b86833e87ac27c40ca74a0775ef29929c660d75d84b6a5497d`；本轮无源码、正式包或用户数据修改。

安装后从扩展中心打开；更新、停用和卸载均在既有扩展管理界面操作，不要求修改浏览器框架或持续运行开发工作区。

## 最小业务修改与直接复用

| 文件 | 原因 |
| --- | --- |
| `src/App.jsx` | 确认框关闭后的焦点恢复移至 React 提交之后；确认期间背景设为 inert，避免键盘进入背景。 |
| `src/model.js` | 拒绝重复笔记 ID 的损坏存储，防止编辑或删除误作用于多条记录。 |
| `tests/environment/sidebar-quick-notes-react-r21.test.mjs` | 三个定向回归：重复 ID、UTF-8 容量边界、16 条笔记仍可编辑删除。 |
| `scripts/tests/quick-notes-react-r21-installed-chrome.mjs` | 修正过时的普通标签页入口，连接真实 SIDE_PANEL；复用原安装/生命周期驱动，核对候选与 Host 身份。缩放/宽度诊断改为显式可选，默认跳过。 |
| `.github/workflows/quick-notes-react-r21.yml` | 沿用原 CI，启动标准 demo-form 页面并清理服务器。 |
| `README.md`、本记录、交付工作记录与证据 JSON | 纠正旧阻断状态，记录实际包和验证边界。 |
| `quick-notes-react.opendesk-tool.json` | 用既有打包器从已测候选晋升唯一正式包。 |

直接沿用现有 App、Model、main、style、tool.config、Vite 配置、正式 SDK、共享 Runtime/UI、打包器和原生 Quick Notes。没有新建 Host、Dispatcher、框架业务分支或另一套工具包格式；未修改 R35、其他扩展可信源码或固定安全哈希。

## 已执行的必要验证

以下是已有执行结果，按用户最新收敛要求不再追加整套测试。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:dev
npm run build --prefix projects/quick-notes-react
OPENDESK_SHARED_UI_EXTENSION_DIR=dist/development npm run stage:preview --prefix projects/quick-notes-react
node --test tests/environment/sidebar-quick-notes.test.mjs tests/environment/sidebar-quick-notes-react-r21.test.mjs tests/environment/sidebar-quick-notes-react-pack-r21.test.mjs
node scripts/build-sidebar-tool.mjs projects/quick-notes-react --out artifacts/sidebar-tools/quick-notes-react/react-candidate.opendesk-tool.json
node --test tests/environment/sidebar-quick-notes-react-r22-compare.test.mjs
```

结果：依赖、Host 构建、React 编译、staging 和候选打包均 PASS；定向 Node/包测试 **29/29 PASS**，既有对照测试 **1/1 PASS**。预览测试单独记录，不用于证明真实 SDK、安装或持久化。

真实 Mac 检查采用静态 development Host 验收快照，非 dev serve：`artifacts/sidebar-tools/quick-notes-react/r23/host-verified`；143 个文件，Host Hash `19b93be9062ce29cd31ea0e34de9f6786d4adc4373dd92d0ee55be5e31caf072`，运行前后均由原 `verifyPackage` 校验。隔离快照避免其他 Agent 的构建覆盖，不替换日常加载目录。

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
# CHROME_BIN 指向本机 Chrome for Testing 155.0.8059.39。
OPENDESK_SHARED_UI_EXTENSION_DIR=artifacts/sidebar-tools/quick-notes-react/r23/host-verified OPENDESK_QN_HEADFUL=1 node scripts/tests/quick-notes-react-r21-installed-chrome.mjs artifacts/sidebar-tools/quick-notes-react/r23/mac-final-canonical
```

结果：**真实 Mac 原生 Side Panel 自动化 PASS，34 条操作记录**。Chrome 返回 `SIDE_PANEL` 与带 `hostInstanceId` 的真实扩展 URL；独立临时 Profile，未访问用户原生笔记，`simulatedSDK:false`。原始记录见[本轮证据 JSON](../../docs/framework/workstreams/quick-notes-react-r23-mac-evidence-20261019.json)。

- 双安装：两个 ID/版本/包 SHA 核验；分别写入、关闭重开及浏览器完整重启；React 写入、更新、卸载后原生数据摘要仍相同。
- 核心数据：新建、编辑、删除、多条切换、16 条与 8 KiB；ETag 冲突、真实 Host 超时导致的结果未知均保留草稿；HTTP(S) 网页关联通过。
- 离线权限：真实 Chrome Site Access 收回后 `permissions.contains` 为 false，离线保存成功且未恢复网站权限。`tabs` 仍可返回标题/URL，不将其误判为网页权限。
- 生命周期：真实安装审阅；同 ID 受控 `1.0.1` 更新保留数据；错误 Runtime 更新被拒绝，旧安装和数据保持；停用销毁已打开 iframe，恢复后可读；卸载取消/确认、清除自有记录与数据、重装空数据通过。受控版本不是历史正式发行。
- React 交互：真实 Enter/Space 操作、未保存确认、删除确认、焦点恢复、背景 inert、保存错误反馈有证据。

缩放/宽度的历史记录不计入本轮要求；最后只将相应诊断改为默认跳过并做语法核对，没有为该范围调整重跑产品测试。已测业务包字节保持不变，证据内保留实际执行时的 runner SHA。

晋升与同源验证均 PASS：

```sh
node scripts/build-sidebar-tool.mjs projects/quick-notes-react --promote-from artifacts/sidebar-tools/quick-notes-react/react-candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs projects/quick-notes-react --check-project
shasum -a 256 projects/quick-notes-react/quick-notes-react.opendesk-tool.json
```

## CI 与未验证范围

已核对的最新 Quick Notes CI：[39145673834](https://github.com/shopable-ai/opendesk-browser/actions/runs/39145673834)，Commit `bdfbcb3992ad691677cda38c1f7f7b725373aea4`，结论 **FAILURE**，原因为共享 Host 的 Trusted Prompt Shortcuts 来源校验。当前 main 已有其他工作流的修复，本地共享构建成功；本轮没有改动其源码或固定哈希。

此前的真实 Host 入口失败归因为 `TEST_CONTRACT_STALE`，不是 R35 业务故障；焦点和重复 ID 属于本工具修复。并行构建导致的目录漂移用已验证隔离快照处理。

当前候选 Linux CI 为 `NOT_TESTED`；未推送远端 main，未创建新 CI Run。Mac 自动化不是人工 VoiceOver、IME 完整体验或性能验证；这些项目为 `NOT_TESTED`。production Host 专项与商店发布不在本轮 React UI 收尾结论内。

## 分维度独立评审

评审针对本轮工具范围，无平均分。目标仍为每项 95；未达到的项目不作 95+ 声明。

| 维度 | 评分 | 依据与限制 |
| --- | --- | --- |
| 业务功能完整性 | 95/100 | CRUD、关联、容量、冲突、未知结果与离线保存通过。 |
| 独立扩展架构 | 97/100 | 业务留在工具目录，公开 SDK，框架不引用 App/Model。 |
| SDK 数据安全 | 95/100（本工具边界） | 隔离、ETag、网站权限收回与停用撤销有真实证据；不评价整个 SDK。 |
| 安装更新卸载生命周期 | 96/100 | 同 ID 更新、拒绝无效更新、停用/恢复、卸载重装及原生不受影响。 |
| React / Shared UI 复用 | 96/100 | 唯一共享运行时与公共组件，无重复打包。 |
| 交互与可访问性 | 92/100 | 键盘、焦点和 inert 有证据；VoiceOver 未验证。 |
| 自动化测试与证据可信度 | 91/100 | 本地 29+1 与真实 Mac 34 条；当前候选 Linux CI 未闭环。 |
| 可维护性 | 91/100 | 小范围业务修复、复用既有工具链；真实浏览器脚本较集中，维护成本仍在。 |

未执行的 Linux、VoiceOver、性能独立子项均 `NOT_SCORED`，不由上述分数推定 PASS。
