import {FoundationError} from '../../platform/protocol.js';

export function userScriptsNativeError(error) {
  // Chrome 155 retains the namespace in existing contexts after the user
  // disables the switch, then throws this exact synchronous API guard.
  // Do not infer switch state from unrelated quota or invalidation errors.
  if (error?.message === "'userScripts.getScripts' is not available in this context.") {
    return new FoundationError('E_USER_SCRIPTS_UNAVAILABLE',
      'Chrome 当前未开放用户脚本能力；请核对此扩展的「允许用户脚本」开关，已开启时重新打开开发界面再检测。');
  }
  return new FoundationError(error?.code || 'E_USER_SCRIPTS_NATIVE',
    error?.message || 'Chrome 用户脚本状态读取失败，请重新检测');
}

// Read-only availability check; never executes code or changes a permission.
export async function readNativeUserScripts(api, filter) {
  const native = api?.userScripts;
  if (typeof native?.getScripts !== 'function' || typeof native.execute !== 'function')
    throw new FoundationError('E_USER_SCRIPTS_UNAVAILABLE',
      '请在 chrome://extensions 中打开此扩展的「允许用户脚本」开关');
  try {
    const rows = filter === undefined ? await native.getScripts() : await native.getScripts(filter);
    if (!Array.isArray(rows)) throw new FoundationError('E_USER_SCRIPTS_NATIVE', 'Chrome 用户脚本状态回执无效，请重新检测');
    return rows;
  } catch (error) { throw userScriptsNativeError(error); }
}
