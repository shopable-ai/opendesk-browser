import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

export const CP1 = 'B05.SDK.crash.before-admission-commit';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const functionNode = node => ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type);
const property = (object, name) => object?.properties?.find(item => (item.key?.name ?? item.key?.value) === name)?.value;
const memberName = node => node?.type === 'MemberExpression' ? node.property.name ?? node.property.value : null;
const tag = node => property(node, 'tag')?.value;
const location = node => ({lineNumber: node.loc.start.line - 1, columnNumber: node.loc.start.column});

// Structural selection in the unchanged production source. A missing/ambiguous
// statement or changed transaction shape cannot become a proximity breakpoint.
export function discoverAdmissionPoint(source) {
  const {parse} = createRequire(import.meta.url)('acorn');
  const result = {id: CP1, sourceSha256: sha256(source), ready: false};
  let ast;
  try { ast = parse(source, {ecmaVersion: 'latest', locations: true}); }
  catch (error) { return {...result, reason: `Production source cannot be parsed: ${error.message}`}; }
  const entries = [];
  function visit(node, ancestors = []) {
    if (!node || typeof node.type !== 'string') return;
    entries.push({node, ancestors});
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) visit(child, [...ancestors, node]);
      else if (value && typeof value === 'object' && typeof value.type === 'string') visit(value, [...ancestors, node]);
    }
  }
  visit(ast);
  const runs = entries.filter(({node}) => node.type === 'CallExpression' && memberName(node.callee) === 'put' &&
    node.arguments[0]?.value === 'runs' && tag(node.arguments[1]) === 'sdk-service');
  if (runs.length !== 1) return {...result, reason: `Exactly one sdk-service runs put required; observed ${runs.length}`};
  const {node: run, ancestors} = runs[0], fn = [...ancestors].reverse().find(functionNode);
  const txName = fn?.params[0]?.name;
  if (!txName || run.callee.object.name !== txName) return {...result, reason: 'Runs put is not bound to the admission callback transaction parameter'};
  const transaction = entries.find(({node}) => node.type === 'CallExpression' && memberName(node.callee) === 'transaction' && node.arguments[2] === fn)?.node;
  const stores = transaction?.arguments[0]?.elements?.map(item => item.value);
  if (transaction?.arguments[1]?.value !== 'readwrite' || JSON.stringify(stores) !== JSON.stringify(['commandJournal', 'runs', 'results']))
    return {...result, reason: 'Native admission readwrite store contract changed'};
  const block = [...ancestors].reverse().find(node => node.type === 'BlockStatement');
  const sequence = [...ancestors].reverse().find(node => node.type === 'SequenceExpression');
  const expressions = sequence ? sequence.expressions : block?.body?.filter(node => node.type === 'ExpressionStatement').map(node => node.expression);
  const calls = expressions?.filter(node => node.type === 'AwaitExpression').map(node => node.argument);
  const index = calls?.indexOf(run), operationPut = calls?.[index - 2], requestPut = calls?.[index - 1];
  if (index !== 2 || calls.length !== 3 || operationPut?.arguments[0]?.value !== 'commandJournal' ||
      requestPut?.arguments[0]?.value !== 'commandJournal' || tag(requestPut.arguments[1]) !== 'sdk-request' ||
      [operationPut, requestPut].some(call => memberName(call.callee) !== 'put' || call.callee.object.name !== txName))
    return {...result, reason: 'Two awaited journal puts must precede the runs put in this same transaction/block'};
  const operationName = operationPut.arguments[1]?.name, lockName = requestPut.arguments[2]?.name;
  const assignment = expressions.find(node => node.type === 'AssignmentExpression' &&
    node.left.name === operationName && tag(node.right) === 'sdk-operation');
  if (!assignment || !lockName || property(run.arguments[1], 'runId')?.object?.name !== operationName ||
      property(run.arguments[1], 'runId')?.property?.name !== 'runId')
    return {...result, reason: 'Operation/request/run identity association is not structurally proven'};
  const outer = [...ancestors].reverse().filter(functionNode).find(node => node !== fn && node.params[0]?.type === 'Identifier' && node.params[1]?.type === 'Identifier');
  if (!outer) return {...result, reason: 'Actual request and native MessageSender bindings are unavailable'};
  const keepalive = entries.filter(({node}) => node.type === 'Literal' && node.value === '@storage-keepalive');
  if (keepalive.length !== 1) return {...result, reason: 'Native transaction keepalive implementation is absent or ambiguous'};
  const pump = [...keepalive[0].ancestors].reverse().find(functionNode);
  const guards = keepalive[0].ancestors.filter(node => node.type === 'IfStatement' && node.test.type === 'UnaryExpression' &&
    node.test.operator === '!' && node.test.argument.type === 'Identifier').map(node => node.test.argument.name);
  const workDone = guards.at(-1);
  const ended = guards.length === 2 ? guards[0] : pump.body.body.find(node => node.type === 'IfStatement' &&
    node.test.type === 'Identifier' && node.consequent.type === 'ReturnStatement')?.test.name;
  if (!workDone || !ended || workDone === ended) return {...result, reason: 'Native transaction completion/termination guard bindings cannot be derived'};
  return {...result, ready: true, transactionStores: stores, transactionMode: 'readwrite',
    nativeTransactionStateBindings: {workDone, ended},
    bindings: {tx: txName, operation: operationName, lockKey: lockName, request: outer.params[0].name, sender: outer.params[1].name},
    point: {range: [run.start, run.end], location: location(run.callee.property),
      locationNode: 'callee.property', calleePropertyRange: [run.callee.property.start, run.callee.property.end], breakpointType: 'call',
      endLocation: {lineNumber: run.loc.end.line - 1, columnNumber: run.loc.end.column}, text: source.slice(run.start, run.end)},
    precedingJournalPuts: [operationPut, requestPut].map(node => ({range: [node.start, node.end], location: location(node), text: source.slice(node.start, node.end)})),
    rule: 'Only a unique exact getPossibleBreakpoints location of type call at this runs-put callee.property is eligible; no relocation or neighbour fallback'};
}
