# Quick Notes React R2.3 交付工作记录

- 负责人：当前 Codex 会话（Quick Notes React R2.3）；2026-10-19，Asia/Shanghai。
- 初始 main：`63e53e718522bf6b44c4cfd4902dae0de36ef3e2`；首次核查远端 main：`149507305e9f5a0e0ab42d743ae439491f9ba242`。
- 实际写入范围：`examples/sidebar-tools/quick-notes-react/src/App.jsx`、`src/model.js`；该项目 `README.md`、`RELEASE-STATUS.zh-CN.md` 与唯一正式包；`scripts/tests/quick-notes-react-r21-installed-chrome.mjs`；`tests/environment/sidebar-quick-notes-react-r21.test.mjs`；`.github/workflows/quick-notes-react-r21.yml`；本记录与同目录 `quick-notes-react-r23-mac-evidence-20261019.json`。未修改专属 CSS 或其他框架业务源码。
- 不修改原生 Quick Notes、Prompt Shortcuts、Stay Focus、R35 Shell 或任何共享安全固定哈希。公开 SDK/安装合同不变。
- 资源：现有 node_modules、静态 Host 构建器的 output guard（仅空闲时使用）、Quick Notes React 独立 dist/preview、独立临时 Chrome Profile；不接管既有 CFT 实例或日常用户数据。
- Git 索引/HEAD 操作串行；只提交本任务指定文件，不推送远端 main。
- 初始并行改动：`src/ui/script-editor.js`、`tests/environment/script-editor-ui.test.mjs`、未跟踪续接提示；首次快进安全拒绝后，逐字节备份并核对预期合并结果，使用现有 autostash 安全快进至 `149507305`，保留他人内容。后续更多并行改动仅保留，不暂存。

## 交付门禁

沿用现有源项目、Runtime、Shared UI、打包器、真实 Host 安装测试。用户最终要求聚焦 React UI 收尾、复用已有功能证据，不再扩展整套测试；缩放、不同像素/宽度明确 OUT_OF_SCOPE。历史诊断保留但默认跳过，不计入门禁。真实 Host 或环境失败时保留失败证据，禁止以 preview adapter PASS 替代。

## 执行证据

- npm ci、静态 development Host 构建、React 编译、stage:preview、候选打包 PASS；原共享 Prompt Shortcuts 构建阻断已由当前 main 解决，本轮不修改其安全来源。
- 业务最小修复：重复 ID 损坏数据拒绝；React 确认后的焦点提交时序及 inert 背景。定向 Node/包测试 29/29，对照测试 1/1 PASS。
- 最新真实 Mac headed CFT 155 原生 Side Panel 34 条操作记录 PASS：双 ID/数据隔离、持久化/重启、草稿保护、容量、网页关联、无站点权限离线、更新/拒绝无效更新、停用撤销活动 iframe、恢复、卸载确认/取消、重装空数据及原生不受影响。历史缩放/宽度记录排除于本轮要求。
- 普通 tool.html 标签页已变为 catalog-only，修复验收驱动为真正 SIDE_PANEL，归因 TEST_CONTRACT_STALE；无 R35 修改。共享构建被并行输出覆盖时，使用原 verifyPackage 核验的 143 文件隔离快照，Host Hash `19b93be9062ce29cd31ea0e34de9f6786d4adc4373dd92d0ee55be5e31caf072`，不替换日常扩展。
- 候选经 --promote-from 晋升，--check-project 一致：`quick-notes-react@1.0.0`，29,489 字节，SHA256 `4019203b43d865f81eb9234cb448cf47ee445b4e8f5193bb7233ac83deb6185f`。
- CI 39145673834 是旧 Commit bdfbcb3992ad 的共享构建 FAILURE；新候选 Linux CI 未运行，不把本地 PASS 写成 CI PASS。不推送 main。
- 最后仅将缩放/宽度诊断改为显式可选；业务候选字节未变化，语法检查，不再重跑浏览器。原始执行 runner SHA 和收敛后 SHA 均保存在证据 JSON。
- 独立评审按八维记录在项目 RELEASE-STATUS；未全维达到 95，未测子项 NOT_SCORED。提交只含本任务路径，其他 Agent 的源码与共享构建回执保留原状。
