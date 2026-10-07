import {PageError, requireValue, encodeValue, decodeValue, selector, options, duration} from '../../framework/control/value.js';
import {createValueCodec} from '../../platform/page-port/codec.js';

// Build code for chrome.userScripts.execute only. No host/SW evaluator exists.
// The broker owns switch/grant/document checks and passes this descriptor to its
// one userScripts adapter, including cancellation of admitted page waits.
export function buildPageEvaluation(method, args, {operationId, runId} = {}) {
  requireValue(typeof operationId === 'string' && operationId && typeof runId === 'string' && runId, 'E_ARGUMENT_TYPE');
  requireValue(Array.isArray(args), 'E_ARGUMENT_TYPE');
  const serialize = value => JSON.stringify(encodeValue(value));
  let body, mode = 'USER_SCRIPT', wait = false;
  switch (method) {
    case 'evaluate': {
      const [descriptor, values] = args;
      requireValue(descriptor && typeof descriptor.source === 'string', 'E_ARGUMENT_TYPE');
      requireValue(!descriptor.source.includes('[native code]'), 'E_FUNCTION_SOURCE_UNSUPPORTED');
      if (descriptor.mode === 'legacy-statement') body = `${descriptor.source}\n;return true;`;
      else { requireValue(descriptor.mode === 'function', 'E_ARGUMENT_TYPE'); body = `return await (${descriptor.source})(...decodeValue(${serialize(values)}));`; }
      break;
    }
    case '$eval': case '$$eval': {
      const [css, source, values] = args; selector(css); requireValue(typeof source === 'string' && !source.includes('[native code]'), 'E_FUNCTION_SOURCE_UNSUPPORTED');
      body = method === '$eval' ? `const el=document.querySelector(${JSON.stringify(css)});requireValue(el,'E_SELECTOR_NOT_FOUND');return await (${source})(el,...decodeValue(${serialize(values)}));`
        : `return await (${source})(Array.from(document.querySelectorAll(${JSON.stringify(css)})),...decodeValue(${serialize(values)}));`;
      break;
    }
    case 'evaluateExpression': requireValue(args.length === 1 && typeof args[0] === 'string' && args[0].trim(), 'E_ARGUMENT_TYPE'); mode = 'MAIN'; body = `return await (${args[0]}\n);`; break;
    case 'eval': {
      const [source, config] = args; requireValue(typeof source === 'string' && source.length, 'E_ARGUMENT_TYPE'); options(config, ['mode']);
      requireValue(['expression', 'statement'].includes(config.mode), 'E_LEGACY_AMBIGUOUS_EXECUTION'); mode = 'MAIN';
      body = config.mode === 'expression' ? `return await (${source}\n);` : `await (async()=>{${source}\n})();return undefined;`; break;
    }
    case 'waitForFunction': {
      const [source, config, values] = args; requireValue(typeof source === 'string' && !source.includes('[native code]'), 'E_FUNCTION_SOURCE_UNSUPPORTED');
      options(config, ['timeout', 'polling']); duration(config.timeout);
      requireValue(config.polling === 'raf' || (Number.isFinite(config.polling) && config.polling > 0), 'E_ARGUMENT_TYPE'); wait = true;
      body = `const predicate=(${source}),values=decodeValue(${serialize(values)});const started=performance.now();for(;;){check();if(await Promise.race([Promise.resolve().then(()=>predicate(...values)),cancelled])){check();return true;}check();if(${config.timeout}!==0&&performance.now()-started>=${config.timeout})throw new PageError('E_TIMEOUT');await tick(${JSON.stringify(config.polling)});}`;
      break;
    }
    default: throw new PageError('E_OPERATION_UNSUPPORTED');
  }
  const constants = `const PageError=${PageError.toString()};const requireValue=${requireValue.toString()};const createValueCodec=${createValueCodec.toString()};const {encodeValue,decodeValue}=createValueCodec({profile:'control',ErrorType:PageError,maxDepth:12,maxBytes:65536});`;
  const lifecycle = wait ? `
    const key=Symbol.for('opendesk.userScripts.waits.v1');const waits=globalThis[key]||(globalThis[key]=new Map());
    let stopped=false,timer=null,raf=null,deadlineTimer=null,rejectCancel;const cancelled=new Promise((_,reject)=>rejectCancel=reject);cancelled.catch(()=>{});
    const owner={runId:${JSON.stringify(runId)},cancel(){if(stopped)return;stopped=true;clearTimeout(timer);clearTimeout(deadlineTimer);if(raf!==null)cancelAnimationFrame(raf);rejectCancel(new PageError('E_CANCELLED'));}};
    ${wait && args[1].timeout > 0 ? `deadlineTimer=setTimeout(()=>{stopped=true;rejectCancel(new PageError('E_TIMEOUT'));},${args[1].timeout});` : ''}
    requireValue(!waits.has(${JSON.stringify(operationId)}),'E_OPERATION_CONFLICT');waits.set(${JSON.stringify(operationId)},owner);
    function check(){requireValue(!stopped,'E_CANCELLED');}
    function tick(polling){return Promise.race([new Promise(resolve=>{if(polling==='raf')raf=requestAnimationFrame(()=>{raf=null;resolve();});else timer=setTimeout(()=>{timer=null;resolve();},polling);}),cancelled]);}
  ` : '';
  const code = `(async()=>{${constants}${lifecycle}try{const value=await(async()=>{${body}\n})();return {ok:true,value:encodeValue(value)};}catch(error){return {ok:false,error:{code:error.code||'E_PAGE_EXECUTION',name:error.name,message:String(error.message),cause:{name:error.name,message:String(error.message)}}};}${wait ? `finally{clearTimeout(timer);clearTimeout(deadlineTimer);if(raf!==null)cancelAnimationFrame(raf);waits.delete(${JSON.stringify(operationId)});}` : ''}})()`;
  return Object.freeze({world: mode, code, wait, operationId, runId});
}

// Only called by the admitted broker's userScripts adapter in the same world.
// Cancellation of a wait fences future delivery, not a synchronous MAIN loop.
export function buildCancelPageWaits(runId) {
  requireValue(typeof runId === 'string', 'E_ARGUMENT_TYPE');
  return `(()=>{const waits=globalThis[Symbol.for('opendesk.userScripts.waits.v1')];if(waits)for(const owner of waits.values())if(owner.runId===${JSON.stringify(runId)})owner.cancel();return true;})()`;
}
export function readPageEvaluationResult(reply) {
  requireValue(reply && typeof reply.ok === 'boolean', 'E_RESULT_FORMAT');
  if (!reply.ok) throw new PageError(reply.error?.code || 'E_PAGE_EXECUTION', reply.error?.message, reply.error?.cause);
  return decodeValue(reply.value);
}
