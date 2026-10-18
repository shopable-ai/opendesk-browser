# R34.6 Scheduled Tasks 业务身份安全收敛（2026-10-18）

- 对话工作范围：`src/ui/scheduled-task-workbench.js`、`tests/environment/scheduled-task-ui-r1.test.mjs`、本工作记录；仅 GitHub `main`。基础 HEAD：`6015ff3729072b125f74415830a5bc11e69bb2b3`。
- 当前源码所有权：R35/R35.1 独立负责 `src/ui/tool.html`、`src/ui/tool-shell.js`、`src/ui/react/main.tsx`、`src/ui/react/tabs/schedule.tsx` 和 Shared UI。本次这些文件均未写入。
- 真实发现 P0：新建计划保存前固定任务身份比对缺少 `generation`，安装授权代次变更时存在静默绑定新代次的风险；现加入匹配。
- 真实发现 P0：任务复制到 Developer 只使用旧的 installed 快照；Host 读取 Candidate 期间若任务授权或版本变更，曾缺少读取后的权威 Registry 对账。现校验返回 Candidate 的 TaskId/Version/ManifestHash/源码存在性，随后通过现有 `listTaskCatalog` 再次检查 Version、ManifestHash、Installation ID、Generation，失败不进入原 Developer 导入。
- 只复用 `listTaskCatalog` / `getTaskCandidate` / `resolveInstalledTask` 既有 Host RPC；没有第二套 Host、Registry、调度器或 React UI；停用任务仍能复制源码（因此复制核查不能改用仅允许已启用任务的 `resolveInstalledTask`）。
- 增加组件回归：新建计划 Generation 源约束；Candidate 读取后授权代次漂移不得覆盖 Developer 或计划；未变化的固定源码仍可复制且无计划副作用。Node 组件 fixture 不等于真实 Chrome。
- R35 当前集成事实：已有单 React App Shell，但计划列表与管理页仍采用同根 `createPortal`；由 R35 负责退出旧视图。不得恢复历史 `#catalog-open-dev-sidebar`。
- 验收状态：本轮提交前没有可访问的用户本地工作目录或 Chrome profile；`LOCAL_MAC_NOT_TESTED`。本轮 Node/Build/Native CI 须以本提交之后新触发的对应 SHA 判定，提交前均为 `NOT_TESTED`。旧 R34.4/R34.5 运行证据只属于各自旧候选。
- GitHub API 文件 Blob 前置核对：`src/ui/scheduled-task-workbench.js` `287bc4627178e11f8ed89fe2bbbf7c1ba0828872`；`tests/environment/scheduled-task-ui-r1.test.mjs` `5a41ccb03039a740935c467745c3280e65c00722`。本轮提交未占用用户 Mac `dist`、Chrome profile、Git index 或 watcher。其他任务源文件不改。
- 阶段 B：正式 React 新入口稳定后由 R35 交接，重跑 Chrome 创建/编辑/历史/任务管理/启停/复制/卸载/关闭重开；未测项目不得评分 ≥95。
