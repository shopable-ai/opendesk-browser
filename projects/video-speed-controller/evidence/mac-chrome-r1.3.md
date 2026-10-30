# 视频倍速 R1.3 · Mac Chrome 差量验收记录

日期：2026-10-30（Asia/Shanghai）。Owner：Codex chat `01a18c47-8aa9-7cb3-af0b-350b936e0706`。

**总结果：BLOCKED，未完成 Mac Chrome 验收，不是 DONE。** 当前可证明 SOURCE / 定向 NODE / 静态 development BUILD；没有本轮真实 Chrome 操作、安装回执、播放计时或站点证据。

## 原始目标与去重

用户要在播放视频时打开 OpenDesk 侧栏，看到实际 1×，点击 2× 后由 Host 设置并独立读回，再点击唯一 1× 恢复；S/D/R 可调整，关闭开关后不能操作且刷新保留偏好。实际倍速、待验证目标及失败应明确区分。沿用唯一 `projects/video-speed-controller/`，不重做 UI、预览、播放器或运行时。

- 已阅读 [R1.1 原始证据](mac-chrome-r1.1.md) 与 [原 Fixture](fixture.mjs)。旧证据是 **1.0.0 的 PARTIAL/BLOCKED**：实际播放、1.5× 计时、2× 观察可作历史基础，缺完整 1×→2×→1× 和对应两个 set 回执，不升级为本轮 1.1.0 PASS。
- 开始 main：`b7ffa039724a837bcf86ad8fe28086fbd7d0db2d`。首次 fetch 后合入远端，源码/构建基线：`17b80d4eb5d78463b94e49b484a8398331b16b64` 加本轮修复。
- 收尾 fetch 得到 `origin/main=2088130d9`，仅 AI Account Usage / Browser Fingerprint 文件变化，与本产品、可信 Host 和本轮测试无重叠；安全合并后基线 `c1bf8d8a7534932763938162626c011b80d5d5f0`。未因无关更新重复构建。
- 本报告与修复一起提交；最终源码身份由 [构建与源码绑定记录](r1.3-build.json) 的逐文件 SHA256 / Git blob 确定，可通过 `git log -- projects/video-speed-controller/evidence/mac-chrome-r1.3.md` 定位交付提交。
- 没有发现更新的同候选原生验收记录。保留其他 owner 的未跟踪 `examples/programs/chatgpt-mindmap/`、`examples/sidebar-tools/bookmark-manager/`；未提交或操作它们。

## 环境与连接阻塞

| 项目 | 本轮实读结果 |
| --- | --- |
| OS | macOS 26.5.1 / 25F80，arm64；`sw_vers` / `uname -m` |
| Node | v24.16.0 |
| Chrome 连接 | 两次连接均返回 `Local browser use is disabled in Work settings`，未得到可用浏览器句柄 |
| 本轮实际 Chrome 版本、扩展 ID、加载路径及 Native 配对 | NOT_TESTED；旧 R1.1 的 CFT 155 / 扩展 ID 不是本轮已连接证明 |
| 实际已安装产品版本 / SHA | NOT_TESTED；仅构建候选是 1.1.0，未声称当前 Chrome 已安装这些字节 |
| 构建模式 | **静态 development 包**，standard edition，`dist/development`；没有启动 `npm run dev`，没有 serve 客户端连接证明，也不是 production 验收包 |
| writer | 开始观察旧 watcher；构建前确认 PID 已不存在且开发输出锁无活跃 owner；由既有构建守卫独占输出，未停止他人服务 |
| 原生 UI | 按既有租约协议申请后已释放；没有抢占其他 Profile、关闭浏览器或重启服务 |

未使用 CDP、AppleScript、另一浏览器驱动或直接改设置绕过禁用状态。用户要求继续完善后，继续执行能够独立完成的代码修复与取证；未把这条回复解释为连接已恢复。

## 本轮实际复现与最小修复

### 1. macOS 临时路径导致来源夹具误报

命令：`node --test tests/environment/video-speed-controller.test.mjs tests/environment/video-speed-bundle-boundary.test.mjs`。

- 修复前退出 1，10 PASS / 1 FAIL：干净复制的可信源码被报告为 symlink。
- 原因：macOS 的 `tmpdir()` 使用 `/var/...`，`realpath` 为 `/private/var/...`；测试夹具未规范化根路径，触发生产代码的真实 symlink guard。
- 仅修改 `tests/environment/video-speed-bundle-boundary.test.mjs`，以 `realpath(mkdtemp(...))` 创建夹具。未放宽生产来源检查，变更源码拒绝、错误 bundle 拒绝断言仍在。
- 修复后原两份测试退出 0，11/11 PASS。

### 2. 关闭工具 / 切页期间，最后一次异步准入后仍写入

- 复现：执行真实 `requestVideoSpeed`；把关闭或目标变化安排在探测后、设置前最后一次 `assertInstalled` 的 await 内。
- 预期：请求拒绝，零次 `set` 注入。
- 修复前：关闭后仍发生 1 次 set，之后才拒绝回执；切换目标后旧请求甚至返回成功。两个新增回归均 FAIL，退出 1。
- 修改 `trusted/host.js`：异步准入完成后重新同步核对 live session、window/tab/document/url/origin；写入前不再留下异步间隙。旧目标不得靠事后拒绝掩盖已发生的写入。
- 修复后：上述两个回归 PASS，退出 0，零次 set。
- 同步审阅并更新 `scripts/bundle-provenance.mjs` 的 host Git blob pin 为 `3a75076eac82b8e6bac434ed606fc08f2b720733`。policy/admission pin 未变。

### 3. 保存 OFF 时刷新 / 页面变化重新激活快捷键

- 使用 linkedom + VM 执行真实 `src/main.js`，仅 SDK 请求边界使用可控 Promise。
- 复现：状态刷新挂起 → 点击 OFF → Host disable 完成 → 偏好写入仍挂起 → 状态读取完成。
- 修复前：刷新或页面变化回调多发 enable；启动偏好尚未读取时也可提前 enable。执行子 agent 报告 3 PASS / 3 FAIL。
- 修改 `src/main.js`：加载/保存偏好期间阻止自动激活；保存结束后根据最终 ON/OFF 状态恢复，保留 OFF 保存失败时恢复原 ON 的行为。
- `tests/shortcut-preference.test.mjs` 六项 PASS：刷新/导航竞态、启动已保存 OFF、ON 保存成功、OFF/ON 保存失败，以及保存期间侧栏 D 不产生 set。
- 这是 UI 业务时序修复；未改变 HTML/CSS、视觉层级或预览。没有把 VM 当作真实侧栏验收。

### 4. 网页快捷键绕过安装 / 撤权锁

- 在已有共享 Host 夹具中启用当前官方包，持有 `opendesk.sidebar-tools:tool:video-speed-controller` 锁，再发真实接收器格式的网页 D 信号。
- 修复前：持锁时仍探测、设置和读回，注入次数从 1 增至 5。回归退出 1。
- 修改 `src/ui/sidebar-tools.js`：网页快捷键链使用已有同名工具锁，与侧栏请求、安装和撤权协调；没有新增 Host、授权层或权限。
- 回归等待“实际请求锁或发生注入”后判定，不以几次空 pause 当作未写入证明。修复后持锁期间零新增注入，释放后只写一次并独立读回。
- 接收器另验证 foreign extension ID、错误 frameId/tabId/documentId、伪造 nonce、不支持 key 均不能探测媒体；有效重复忙碌按键只写一次；关闭、disable、epoch 撤销、卸载后的旧信号不再注入。
- 独立复核指出负向用例的空 pause 可能提前判断；已改为伪造信号同步断言零锁请求，生命周期用同一工具锁的屏障等待队列排空后断言，最终 6/6 通过。
- disable 的页内移除失败时，Host 已同步撤销 nonce，可保存 OFF，回执仍为 `listenerRemoved:false`。自己的偏好保存不改变其他工具数据。

以上回归均为 NODE 级；**修复后的真实 Chrome 回归均 NOT_TESTED**。

## 命令、退出码与证据

本机日志目录：`artifacts/video-speed-r13-20261030/`（忽略产物，不把临时构建快照提交到仓库）。测试源码和精简构建绑定 JSON 随本报告提交。

| 命令 / 检查 | 退出码 | 结果与日志 |
| --- | --- | --- |
| 初始两份指定 Node 测试 | 1 | 10/11；`node-baseline.log` |
| canonical 路径修正后同两份测试 | 0 | 11/11；`node-canonical-path.log` |
| `node --test --test-name-pattern='final admission await' tests/environment/video-speed-controller.test.mjs` | 修复前 1 / 后 0 | 两项；`admission-race-before.log` / `admission-race-after.log` |
| `node --test --test-name-pattern='video shortcut mutation' tests/environment/sidebar-tools-host.test.mjs` | 修复前 1 | `shortcut-lock-before.log` |
| `node --test --test-name-pattern='video shortcut' tests/environment/sidebar-tools-host.test.mjs` | 0 | 6/6；最终等待屏障版本 `shortcut-receiver-final.log` |
| `node --test tests/environment/video-speed-controller.test.mjs tests/environment/video-speed-bundle-boundary.test.mjs projects/video-speed-controller/tests/shortcut-preference.test.mjs` | 0 | 19/19；`node-final.log` |
| `npm run build:sidebar-tool -- projects/video-speed-controller` | 0 | 修复前后均成功；最终 `package-final.log` |
| `npm run build:dev` | 0 | 修复前后各一次；第二次由真实输入变化触发；最终 `build-dev-final.log` |
| 相关 JS `node --check`、`git diff --check` | 0 | 定向语法与差异检查 |
| 官方 Catalog / 独立候选 / build 内包逐字节及 SHA 核对 | 0 | [r1.3-build.json](r1.3-build.json)；sourceDriftDuringBuild=[] |

最终定向 NODE 合计 **25/25**。没有运行根完整测试、其他产品回归或无关故障注入。构建日志中有既有体积预警；构建退出 0，不据此开展其他模块整改。

## 当前候选身份

| 字段 | 修复后候选 |
| --- | --- |
| 产品 / 官方发行 | `video-speed-controller` / `opendesk/video-speed-controller` |
| 版本 / 能力 | 1.1.0；`page.videoSpeed`、`storage.local` |
| 安装包 | 20,723 字节；候选与 `dist/development/official-tools/video-speed-controller/video-speed-controller.opendesk-tool.json` 相同 |
| 安装包 SHA256 | `a2ddf1b08571d036d7f35b4d086380885b738db0dcbdfc53a6644a181d3e5bf1` |
| trusted host 源码 SHA256 | `d4849a5c103e6755b873413e8bb46ab7093809c28924e4fc279cfb4d1a2fe284` |
| 编译后 `ui/sidebar-tool-host.js` SHA256 | `ae046943943f330f5bc2d074825d0c5fd24a223f2fec3096c6222b94c7e274b5` |
| development 整包 packageHash | `2df5d954f9464a4fc4ad1689e7d189a088bd0448981ed2b0dc5333ddca14d22a` |

修复前 1.1.0 候选为 20,733 字节 / `428f806cfd2b32837cabf2f635921760ca691777ec7b6d4d1b74a30674996ed5`，不能与修复后的证据混用。没有改写已安装 Chrome 数据、来源证明或权限身份来让新 SHA 获准；真实安装/升级仍未执行。

## 分层结果与尚缺的真实操作

| 等级 | 结果 | 证据边界 |
| --- | --- | --- |
| SOURCE | PASS（本轮范围） | 正式单一源码、来源 pin、身份/权限接线与最小修复 |
| NODE | PASS（定向 25 项） | 真实业务函数 / Host 接收器 / UI entry，Chrome API 与媒体 DOM 是夹具 |
| BUILD | PASS（静态 development） | 现有 WXT 构建、官方包字节和固定可信模块来源 |
| CHROMIUM | NOT_TESTED | 没有同候选浏览器运行证据 |
| MAC_CHROME | BLOCKED | 本地浏览器使用被 Work 设置禁用 |
| REAL_SITE | NOT_TESTED | 未连接并播放 B站、优酷或其他实际网站 |

| 必验操作 | 当前结果 |
| --- | --- |
| 真实 `/single` 1×→2×→1×，两个 set 回执、独立 DOM 与实际计时 | BLOCKED；没有本轮执行网址、回执或速度样本 |
| S/D/R、连续按键、OFF、刷新持久化、输入/IME、网站冲突 | NODE 部分 PASS；真实 Chrome BLOCKED |
| 检测/待验证/覆盖失败/切页反馈，过期回执不覆盖 | NODE 部分覆盖；真实 Chrome BLOCKED |
| `/dual`、`/iframe`、`/reset` | 本轮 NOT_TESTED；继续使用原 Fixture，不创建第二套 |
| 安装/升级、撤销网站权限、非当前窗口、停用/卸载 | NODE 有拒绝路径；Chrome 权限与生命周期 BLOCKED |
| 320 / 360 / 400 / 440 / 520 CSS px | 五档全部 NOT_TESTED |
| 200% 缩放、浅/深色、长错误、横向溢出、Tab/Enter/Space/焦点 | 全部 NOT_TESTED；没有用 preview 或 DOM 测试替代 |
| B站 / 优酷 / 第三个普通网站 | 均未访问，NOT_TESTED；未尝试绕过登录、DRM 或付费限制 |

源码审阅另提出两个**尚待操作复现**的问题：其他已开窗口不会同步 OFF 偏好；同文档视频节点重排/替换时，下标不能证明同一元素。这不是本轮 Chrome 已复现缺陷，也不是已修复项。原生入口恢复后，应优先做最小复现，确认后再修，不能据此重建业务或运行时。网页 S/D/R 与站点自身按键的冲突仍需实测，当前监听器不拦截站点事件。

## 九维独立评分

| 维度（各满分 100） | 分数 | 缺口 |
| --- | --- | --- |
| 倍速功能正确性 | NOT_TESTED | 缺本轮真实完整闭环 |
| 快捷键完整性 | NOT_TESTED | 缺网页焦点、IME、冲突和持久化实际操作 |
| 可信权限安全 | NOT_TESTED | NODE 拒绝路径已通过；缺 Chrome 原生撤权 / 安装升级 |
| 实际速度反馈准确性 | NOT_TESTED | 缺实际播放计时与回执对照 |
| UI 视觉与信息层级 | NOT_TESTED | 未看到本轮真实侧栏 |
| 响应式与无障碍 | NOT_TESTED | 指定宽度、缩放和键盘矩阵未执行 |
| 生命周期和异常恢复 | NOT_TESTED | 缺真实切页、窗口、关闭和权限生命周期 |
| 视频网站兼容性 | NOT_TESTED | 无当前真实站点样本 |
| 测试证据与可复现性 | NOT_TESTED | 源码/Node/build 可复现；必需原生原始证据仍缺 |

综合评分：**NOT_SCORED**。没有足够的已完成维度可计算九项算术平均值，不以预估分数替代，不满足“每项及综合 ≥95”的完成标准。

下一步仅为：恢复真实 Chrome 连接后，核验实际安装身份及本候选字节，执行 `/single` 最短闭环，再补快捷键、原生权限生命周期、指定 UI 矩阵和可播放真实站点；优先复现上述两个剩余风险。已有有效 Node/build 证据继续复用。
