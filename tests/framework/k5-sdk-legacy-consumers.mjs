import {parse} from 'acorn';

// Page observations invoke installed product exports; no completion/event,
// sender, grant, clock, receipt or SDK implementation is substituted here.
export async function observeLegacyStorage(key) {
  const completionExport = typeof ChromeBridgeOperationCompleted;
  const pendingBefore = ChromeBridgeEvents.size;
  const persistentPromise = AppStorage.setItem(key, false);
  const persistentIsPromise = persistentPromise instanceof Promise;
  const setPersistent = await persistentPromise;
  const persistent = await AppStorage.getItem(key);
  const sessionPromise = AppLocal.setItem(key, {u: undefined, f: false, z: 0});
  const sessionIsPromise = sessionPromise instanceof Promise;
  const setSession = await sessionPromise, session = await AppLocal.getItem(key);
  await AppLocal.setItem(key, false); const sessionFalseValue = await AppLocal.getItem(key);
  await AppLocal.setItem(key, 0); const sessionZeroValue = await AppLocal.getItem(key);
  await AppStorage.removeItem(key); await AppLocal.removeItem(key);
  return {completionExport, pendingBefore, persistentIsPromise, sessionIsPromise,
    persistentSetUndefined: setPersistent === undefined, persistent,
    sessionSetUndefined: setSession === undefined, sessionOwnUndefined: Object.hasOwn(session, 'u') && session.u === undefined,
    sessionFalse: session.f, sessionZero: session.z, sessionFalseValue, sessionZeroValue, persistentAfterRemove: await AppStorage.getItem(key),
    sessionAfterRemoveUndefined: (await AppLocal.getItem(key)) === undefined,
    pendingAfter: ChromeBridgeEvents.size, diagnostics: OpenDeskSDK.diagnostics()};
}

export async function observeLegacyHttp(verb, url, config) {
  try {
    const promise = ['post', 'put'].includes(verb)
      ? axiosx[verb](url, {f: false, z: 0}, config) : axiosx[verb](url, config);
    const isPromise = promise instanceof Promise;
    return {ok: true, isPromise, value: await promise};
  } catch (error) { return {ok: false, error: {code: error?.code, message: error?.message, status: error?.status, response: error?.response, stage: error?.stage}}; }
}

export async function observeLegacyService(name, args, direct = false) {
  const bridge = service.bridge;
  try {
    const promise = direct ? service[name](args) : bridge.send(name, args);
    const isPromise = promise instanceof Promise, result = await promise;
    const value = direct ? result : result.data;
    return {ok: true, isPromise, ownData: !direct && Object.hasOwn(result, 'data'),
      undefinedValue: value === undefined, valueKind: typeof value, value};
  } catch (error) { return {ok: false, error: {code: error?.code, message: error?.message}}; }
}

export async function observeLegacyResource(url, consumer = false) {
  const bridge = service.bridge;
  const result = consumer ? await OpenDeskSDK.resources.requestResourceByBridge(url)
    : await bridge.send('requestResource', {url});
  const value = consumer ? result : result.data;
  const bytes = typeof value?.data === 'string' ? new TextEncoder().encode(value.data) : null;
  const sha256 = bytes ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('') : null;
  return {url, consumer, ownData: !consumer && Object.hasOwn(result, 'data'),
    value, bytes: bytes?.byteLength, sha256};
}

// A read-only selector for the REAL completion's success-path settlement call.
// Ambiguity or an absent exact call breakpoint is NOT_TESTED, never a nearby
// breakpoint or a manually invoked ChromeBridgeOperationCompleted substitute.
export function discoverLegacyCompletion(source) {
  const ast = parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true}), entries = [];
  function walk(node, ancestors = []) {
    if (!node?.type) return;
    entries.push({node, ancestors});
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) walk(child, [...ancestors, node]);
      else if (value?.type) walk(value, [...ancestors, node]);
    }
  }
  walk(ast);
  const anchors = entries.filter(({node}) => node.type === 'Literal' && node.value === 'Invalid legacy result shape');
  if (anchors.length !== 1) throw Object.assign(new Error('Unique legacy completion anchor unavailable'), {code: 'E_NATIVE_OBSERVATION_UNAVAILABLE'});
  const fn = [...anchors[0].ancestors].reverse().find(node => /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type));
  const calls = entries.filter(({node, ancestors}) => node.type === 'CallExpression' &&
    [...ancestors].reverse().find(node => /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type)) === fn &&
    node.arguments.length === 3 && node.arguments[0]?.name === fn?.params[0]?.name &&
    node.arguments[1]?.type === 'CallExpression' && node.arguments[1].callee?.name === 'Boolean' &&
    node.arguments[2]?.type === 'ConditionalExpression' && node.arguments[2].test?.property?.name === 'PageBrigeCode');
  if (calls.length !== 1 || fn.params.slice(0, 2).some(node => node.type !== 'Identifier'))
    throw Object.assign(new Error('Unique real completion settlement unavailable'), {code: 'E_NATIVE_OBSERVATION_UNAVAILABLE'});
  const call = calls[0].node;
  return {location: {lineNumber: call.loc.start.line - 1, columnNumber: call.loc.start.column},
    endLocation: {lineNumber: call.loc.end.line - 1, columnNumber: call.loc.end.column},
    requestExpression: fn.params[0].name, resultExpression: fn.params[1].name,
    sourceRange: [call.start, call.end], sourceText: source.slice(call.start, call.end)};
}
