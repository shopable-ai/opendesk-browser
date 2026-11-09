import {canonical,invariant} from '../protocol.js';
import {BUILTIN_ABI} from '../../libs/runtime-contract.js';
import {installedKey} from './contract.js';

const TASK_STORE='frameworkKV';

// Shared run admission reads persisted installation authority. It must not
// import packaged installation data into fixed runner/observer bundles.
export async function assertRunTaskAuthorization(tx,run) {
  if(!run.scriptId?.startsWith('task:'))return;
  const bound=run.installedTaskAuthorization;
  invariant(bound?.taskId&&bound.authorization,'E_PERMISSION','旧任务运行没有可恢复的安装授权，请重新运行');
  invariant(run.builtinAbi===BUILTIN_ABI,'E_BUILTIN_VERSION_UNAVAILABLE','旧任务运行内置库身份已改变，禁止继续执行');
  const current=await tx.get(TASK_STORE,installedKey(run.namespace,bound.taskId));
  invariant(current?.tag==='task-installed-v1'&&current.enabled&&current.scriptId===run.scriptId&&
    current.version===bound.version&&current.manifestHash===bound.manifestHash&&
    canonical(current.authorization)===canonical(bound.authorization),
    'E_PERMISSION','任务已停用、卸载或授权版本改变；旧运行不能恢复');
}
