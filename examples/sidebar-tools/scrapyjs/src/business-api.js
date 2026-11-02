import {resolveAiReply} from './ai-actions.js';
import {changes} from './ai-config.js';
import {completeCsvOutput} from './export-settings.js';
import {accessDenied} from './results-model.js';

const clone = value => structuredClone(value);
// A new facade must not revive a cached run whose access denial was observed.
const revokedRuns = new WeakMap();
function revokeRun(app, requestId) {
  if (!requestId) return;
  let runs = revokedRuns.get(app);
  if (!runs) revokedRuns.set(app,runs = new Set());
  runs.add(requestId);
}
const error = (code, message) => Object.assign(new Error(message), {code});
const string = {type:'string',minLength:1};
const objectSchema = (properties, required = []) => ({type:'object',additionalProperties:false,properties,required});
const identitySchema = objectSchema({instanceId:string,profileId:{type:['string','null']},
  profileEpoch:{type:'integer',minimum:0},configRevision:{type:'integer',minimum:0}},
['instanceId','profileId','profileEpoch','configRevision']);
const action = (kind, properties, required = []) => objectSchema({kind:{const:kind},...properties},['kind',...required]);
const actionsSchema = {type:'array',minItems:1,maxItems:16,items:{oneOf:[
  action('field.upsert',{key:string,rule:{type:['string','object']}},['key','rule']),
  action('field.remove',{key:string},['key']),
  action('list.configure',{container:{type:['string','null']},item:{type:['string','null']}}),
  action('pagination.configure',{maxPages:{type:['integer','null'],minimum:1,maximum:10},nextPageSelector:{type:['string','null']}}),
  action('detail.configure',{detail:{type:['object','null']}},['detail']),
  action('csv.configure',{fieldNames:{type:'object'},fieldOrder:{type:['array','null'],items:string,uniqueItems:true}})
]}};
const runSchema = objectSchema({instanceId:string,clientRequestId:{type:['string','null']},
  runId:{type:['string','null']},preparationId:{type:['string','null']}},['instanceId','clientRequestId','runId','preparationId']);
const exportProperties = {format:{enum:['json','csv']},mode:{enum:['raw','custom']},settingsSource:{enum:['current','run']}};
// Local JS descriptions only. No RPC transport, eval, dynamic registration or authority.
const tools = [
  ['tools.list',objectSchema({}),'列出本实例的静态业务接口'],
  ['state.read',objectSchema({}),'读取配置副本、修订、锁定和原运行句柄'],
  ['config.propose',{oneOf:[objectSchema({identity:identitySchema,actions:actionsSchema},['identity','actions']),
    objectSchema({identity:identitySchema,config:{type:'object'}},['identity','config'])]},'完整校验增量动作或原 Chat 配置，不写入'],
  ['config.apply',objectSchema({proposalId:string},['proposalId']),'将本实例候选一次写入原配置模型'],
  ['config.undo',objectSchema({undoId:string},['undoId']),'撤销最后一次仍有效的本地配置事务'],
  ['config.saveCopy',objectSchema({identity:identitySchema,name:{type:'string',minLength:1,maxLength:60}},['identity']),'沿原 ETag 配置库保存独立副本'],
  ['capture.start',objectSchema({identity:identitySchema},['identity']),'调用原开始入口，仍受原可信 Run 授权约束'],
  ['capture.stop',objectSchema({run:runSchema},['run']),'停止原准备过程或原运行'],
  ['results.read',objectSchema({}),'读取原结果快照副本，不启动新采集'],
  ['results.prepareExport',objectSchema(exportProperties,['format']),'冻结结果身份和本次输出设置'],
  ['results.export',{oneOf:[objectSchema({exportId:string},['exportId']),objectSchema(exportProperties,['format'])]},'请求原下载器导出；accepted 仅表示受理']
].map(([name,inputSchema,description]) => ({name,inputSchema,description}));

function input(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value,key)))
    throw error('INVALID_INPUT','业务参数缺失或含有未支持的字段');
  return value;
}
function validate(fn) {
  try {return fn();} catch (cause) {throw cause.code ? cause : error('INVALID_INPUT',cause.message);}
}

/** Bind one facade to the existing createApp instance. The caller owns intent
 * classification and unfinished UI input fences; this API never grants authority.
 */
export function createBusinessApi(app, {isBlocked = () => false} = {}) {
  const proposals = new Map(), exports = new Map();
  let disposed = false;
  const alive = () => {
    if (disposed || app.configurationLock() === 'DISPOSED') throw error('DISPOSED','业务实例已关闭');
  };
  const editable = identity => {
    alive();
    if (isBlocked()) throw error('LOCKED','请先完成当前表单或配置操作');
    app.assertConfiguration(identity);
  };
  const remember = (map, value) => {
    const id = crypto.randomUUID();
    if (map.size >= 16) map.delete(map.keys().next().value);
    map.set(id,value);return id;
  };
  const lookup = (map,id) => {
    const row = typeof id === 'string' && map.get(id);
    if (!row) throw error('STALE_STATE','候选不属于此门面或已过期');
    if (row.consumed) throw error('REPLAYED','这次操作已消费，不会自动重放');
    return row;
  };
  const run = () => ({instanceId:app.configIdentity().instanceId,clientRequestId:app.state.clientRequestId,
    runId:app.state.runId,preparationId:app.state.preparationId});
  function resultBinding() {
    alive();
    const s = app.state;
    if (accessDenied(s)) {
      revokeRun(app,s.clientRequestId);
      exports.clear();
      throw error('PERMISSION_DENIED','当前访问已被拒绝，不可读取或导出缓存结果');
    }
    if (s.clientRequestId && revokedRuns.get(app)?.has(s.clientRequestId))
      throw error('PERMISSION_DENIED','原缓存结果已撤权，请使用重新授权后的新运行');
    if (!s.snapshot || s.result == null || s.snapshot.result !== s.result ||
        s.snapshot.clientRequestId !== s.clientRequestId || s.snapshot.runId !== s.runId)
      throw error('NOT_AVAILABLE','尚无身份一致的真实结果');
    return {snapshot:s.snapshot,result:s.result,clientRequestId:s.clientRequestId,runId:s.runId,
      resultId:s.snapshot.resultId,profileEpoch:s.profileEpoch};
  }
  function prepareExport(args) {
    input(args,['format','mode','settingsSource'],['format']);
    const {format,mode = 'raw',settingsSource = 'current'} = args;
    if (!['json','csv'].includes(format) || !['raw','custom'].includes(mode) ||
        !['current','run'].includes(settingsSource) || format === 'json' && mode !== 'raw' ||
        mode === 'raw' && Object.hasOwn(args,'settingsSource')) throw error('INVALID_INPUT','导出格式或设置来源无效');
    const binding = resultBinding();
    const settingsRevision = mode === 'custom' && settingsSource === 'current' ? app.configIdentity().configRevision : null;
    const {output,warnings} = mode === 'custom' ? validate(() => completeCsvOutput(binding.snapshot,
      clone((settingsSource === 'run' ? app.state.runProfile?.config : app.state.config)?.output || {}))) : {output:undefined,warnings:[]};
    const exportId = remember(exports,{binding,format,output,warnings,mode,settingsSource,settingsRevision});
    return {status:'prepared',exportId,format,mode,settingsSource,settingsRevision,warnings:clone(warnings)};
  }
  return Object.freeze({
    protocolVersion:1,
    tools:Object.freeze({list:() => {alive();return clone(tools);}}),
    state:Object.freeze({read:() => {
      alive();const s = app.state;
      return {protocolVersion:1,identity:app.configIdentity(),config:clone(s.config),dirty:s.dirty,
        lockReason:app.configurationLock() || (isBlocked() ? 'LOCKED' : null),storageReady:s.storageReady,
        storageConflict:Boolean(s.conflict),profiles:s.records.map(({id,name})=>({id,name})),
        run:run(),phase:s.phase,retired:s.retired,hasResult:s.result != null};
    }}),
    config:Object.freeze({
      propose(args) {
        input(args,['identity','actions','config'],['identity']);
        if (Object.hasOwn(args,'actions') === Object.hasOwn(args,'config')) throw error('INVALID_INPUT','请指定增量动作或完整配置之一');
        editable(args.identity);
        const response = Object.hasOwn(args,'actions') ? {type:'actions',actions:args.actions} : {type:'config.proposal',config:args.config};
        const reply = validate(() => resolveAiReply(response,{base:app.state.config,
          expectedUrl:app.state.config.url || app.state.target?.url,validate:globalThis.ScrapyAppModel.validateConfig,changes}));
        const proposalId = remember(proposals,{identity:app.configIdentity(),config:clone(reply.config)});
        return {status:'proposed',proposalId,identity:app.configIdentity(),config:clone(reply.config),
          summary:reply.actions.join('；') || '配置保持不变',warnings:clone(reply.warnings)};
      },
      apply(args) {
        input(args,['proposalId'],['proposalId']);alive();const row = lookup(proposals,args.proposalId);
        editable(row.identity);
        const receipt = app.applyConfiguration(row.identity,row.config);row.consumed = true;return receipt;
      },
      undo(args) {
        input(args,['undoId'],['undoId']);alive();
        if (isBlocked()) throw error('LOCKED','请先完成当前表单操作');
        return app.undoConfiguration(args.undoId);
      },
      async saveCopy(args) {
        input(args,['identity','name'],['identity']);editable(args.identity);
        return app.saveConfigurationCopy(args.identity,args.name);
      }
    }),
    capture:Object.freeze({
      async start(args) {
        input(args,['identity'],['identity']);editable(args.identity);
        if (accessDenied(app.state)) throw error('PERMISSION_DENIED','请先恢复当前所需权限');
        return app.start(app.state.config.url);
      },
      async stop(args) {
        input(args,['run'],['run']);alive();
        // Stop intentionally ignores configuration, page and Provider drift.
        const current = run();
        if (!args.run || Object.keys(args.run).length !== 4 || Object.keys(current).some(key => current[key] !== args.run[key]))
          throw error('STALE_STATE','原运行句柄已变化');
        if (!current.preparationId && (!current.clientRequestId || app.state.retired)) throw error('NOT_AVAILABLE','没有可停止的原运行');
        return app.stop();
      }
    }),
    results:Object.freeze({
      read() {const binding = resultBinding();return {status:'observed',run:run(),snapshot:clone(binding.snapshot)};},
      prepareExport,
      async export(args) {
        alive();input(args,['exportId','format','mode','settingsSource']);
        if (Object.hasOwn(args,'exportId') && Object.keys(args).length !== 1) throw error('INVALID_INPUT','冻结导出不能附加新设置');
        const id = Object.hasOwn(args,'exportId') ? args.exportId : prepareExport(args).exportId;
        const current = resultBinding(), row = lookup(exports,id);
        if (Object.keys(current).some(key => current[key] !== row.binding[key])) throw error('STALE_STATE','原结果快照已变化');
        row.consumed = true;
        const receipt = await app.download(row.format,clone(row.output));
        if (receipt.errorCode === 'E_PERMISSION_DENIED') {
          revokeRun(app,row.binding.clientRequestId);
          for (const [exportId,command] of exports) {
            if (command.binding.clientRequestId === row.binding.clientRequestId) exports.delete(exportId);
          }
        }
        return {...receipt,mode:row.mode,settingsSource:row.settingsSource,settingsRevision:row.settingsRevision,warnings:clone(row.warnings)};
      }
    }),
    dispose() {disposed = true;proposals.clear();exports.clear();}
  });
}
