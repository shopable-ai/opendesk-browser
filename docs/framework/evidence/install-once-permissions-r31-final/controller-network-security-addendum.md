# R3.1 相邻 Controller 跨站权限修复：独立安全附录

## 结论与适用范围

**PASS：本次发现的 Controller 附加 Origin 撤销 P2 已在下列生产源码快照中修复，可解除该具体阻断。** 这是对 `39c9d352`、`7d7a8569` 新增 Controller axiosx Origin 范围以及随后修复的独立组件级结论。未重审未变的 Page 安装链，未重新给整体质量评分，也不借用此前 6d 原生 PASS 或 96 分证明这项新增能力。

最终复核绑定提交 `bb95bd3e1ad0cfb7839b65e78c72782943bb6b78`。已核对以下 SHA-256 与该提交的 Git 原文一致；它们精确标识实际执行的代码和 fixture：

| 文件 | 审计时 SHA-256 |
| --- | --- |
| `src/platform/host/controller-methods.js` | `1518ae5a8803b1d82dbff868f33998b5b2bbcf8c394a26d7f2c4fe139c79cfbe` |
| `src/platform/host/controller-network-scope.js` | `0b70885fd4114be58cbac6956dd163a2e2cb9e98c20a2f16a9453c7699db2fa4` |
| `tests/framework/k3-controller-authority.test.mjs` | `3db14036c2adfd616dfb10af4666719d8831e74de99789506e55288408f816b9` |

## 修复实现复核

`controller-methods.js` 的 `runOrigins` 汇集源站及已固定的网络 Origin；`removedRunGrant` 复用该范围匹配撤销。`requireRunGrants` 在存储事务外静默检查 Chrome 权限，仅对明确 `E_PERMISSION` 复用现有 invalidation 持久化缺权，不创建第二个权限仓库。普通原生查询异常不会被升级为永久撤权。

最终等价收敛复用了现有 `environment.permissionPattern` 生成 Chrome host pattern；它与原先的 protocol/hostname 转换一致。网络撤销错误说明缩短后错误码和条件不变。已针对该最终源码重新执行本附录全部定向验证。

运行操作 pre/post、保存响应重放和 snapshot 均使用完整运行范围。撤销任一附加 Origin 后，既有 run 进入同一持久撤销与停止路径，待处理 HTTP 的 abort 信号被触发。Chrome 权限恢复不会恢复被撤销的旧 run。

snapshot 以本次读取入口的 `permissionRemovals.length` 为基线，在原生检查及最后持久读取之后同步检查新到达的匹配事件。它没有拿历史 run 的 Worker 内存 epoch 当作持久凭据，也没有混入导航 epoch，因此不会因正常导航或 Worker 重建误隐藏仍获授权的历史结果。

结果和已观测的服务回执不删除、不改写；撤销后拒绝向调用者交付。对已提交但没有完成回执的 HTTP，取消不代表已回滚，重复请求继续按原有 `E_EFFECT_UNKNOWN` 拒绝，不重新提交。

## 独立动态证据

使用当前工作树的真实 Authority、存储与既有 fixture，独立编写 scratch 脚本执行。只替换 Chrome 回调及 fetch；未伪造持久授权记录，未修改仓库，未运行全量或原生浏览器。

| 验证边界 | 实际结果 |
| --- | --- |
| 活跃 run 已有跨站回执，仅撤销附加 Origin | 持久 revoked；run stopping；重放与迟到 finish 为 E_PERMISSION；终态 stopped；恢复 Chrome 权限后仍拒绝 |
| 已完成 run 仅撤销附加 Origin | 已存 completed 结果和服务回执逐值不变；重复 finish、重放及 snapshot 无授权交付；恢复权限不能复活 |
| contains=false、onRemoved 尚未到达 | 分别从保存响应重放、新 page.title、finish、已完成 snapshot 进入，均形成持久拒绝；随后 regrant 不复活；没有新页面派发 |
| 最后 snapshot IDB 读取完成后才收到 onRemoved | 故意挂起撤销的持久写，此时 revoked 字段尚未写入；该次返回仍交付 0 个结果，证明同步事件检查有效 |
| 在途 HTTP 被撤销 | 原生 signal 已 abort；首次返回 E_CANCELLED；重复同 request 返回 E_EFFECT_UNKNOWN；submissionCount=1，fetch=1 |
| 历史非零权限 epoch、导航与重建 | 正常导航、Worker 重建及新 browser session 均可读取未撤销历史；随后持久撤销跨 Worker 重建仍拒绝，原结果保留 |
| 非权限原生查询错误 | 临时拒绝交付但不写永久撤销；查询恢复后有效历史仍可读 |
| 已安装 Task 注入附加 Origin | 完整 Task 安装 fixture 后 start 拒绝 E_PERMISSION，不继承普通 Controller 跨站范围 |

两个事件撤销用例各对同一已保存响应额外读取 20 次，物理 fetch 均为 1，permissions.request 均为 0。其余网络用例 requests 同样为 0。本轮这些次数证明定向组件行为，不等同于 20 次独立原生 Run 或整体项目完成度。

无事件、由 finish 首次发现缺权时，既有实现仍可保留此前提交的完成事实，再拒绝交付；本报告未将内部持久完成事实错误描述为成功交付或已回滚。已观察撤销事件先发生的活跃 run 则明确以 stopped 终结。

## 原始文件与执行方式

修复前固定 `7d7a856928c8a32a59f6540a2ad287107b5c595a` 的原始复现未改写：

- `r31-controller-network-delta-audit.mjs` / `.output.json`：事件撤销后 finish 与 snapshot 仍泄漏；SHA-256 分别 `b3f17380a7ba70a90070f8428984001e20354f2884c438235a2c3981e8de06c3`、`07f9b32449bed57c8ff3b701f36e2ad257a1101ff2daa26060daa938f7f9a20d`。
- `r31-controller-network-contains-gap.mjs` / `.output.json`：无事件静默缺权后仍交付；SHA-256 分别 `bbfb88cde8873f899c2b15e89aacc1c56bbed135d8675c1ef7868946db45f5f4`、`abe75d9e6155d197b320696d5dc3a64086d0b2c7e2e1770cbdfd620a64989dca`。

修复后独立运行：

```bash
node /workspace/scratch/eceef8694f0a/r31-controller-network-fixed-audit.mjs
```

- 脚本：`/workspace/scratch/eceef8694f0a/r31-controller-network-fixed-audit.mjs`，SHA-256 `dc51d784f1a070ffb951128fcae881b47565c0101c68fdf7b4a54b89d12fedb0`。
- 原始 PASS 输出：`/workspace/scratch/eceef8694f0a/r31-controller-network-fixed-audit.output.json`，SHA-256 `a2bdefc50e328d9092b4fddc5f18f63c1742afd3aee37d2099d725b57a8761d6`。

执行 exit code 为 0；脚本在开始与结束核对相关源文件哈希，审计执行期间未发生源文件变化。原始输出包含各场景的实际错误码、持久状态、请求/派发计数和文件哈希。

## 真实余项

本轮没有实测新增 Controller 跨站 Origin 在真实 Chrome UI 中撤权、onRemoved 到达时序或在途跨站网络取消，也没有据此签署所有浏览器版本和所有网络异常。新 browser session 的验证是完整 Authority/存储组件重建，不是本轮重新启动 Chrome 的证据。真实原生新增能力验收须独立记录；此前 Page 安装一次授权的原生证据保持其原有适用范围。

未见本次限定范围内仍需阻断发布的具体 P1/P2。全量 check/build/CI、最终提交 SHA 和整体评分由主任务统一核验，本附录不代替这些门槛。
