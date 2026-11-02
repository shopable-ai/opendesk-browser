import {CONTROLLER_SOURCE_LIMIT} from '../source-budgets.js';
import {validExactSiteOrigins} from '../local-project-site-scope.js';
import {checkParamsSchema} from './contract.js';
import {BUILTIN_ABI} from '../../libs/runtime-contract.js';
import {canonical,digestUtf8,invariant} from '../protocol.js';

export const APP_CONTROLLER_OPERATIONS=Object.freeze(['controllers.start','controllers.read','controllers.stop']);
const SHA256=/^[a-f0-9]{64}$/;
function fields(value,keys){
  invariant(value&&typeof value==='object'&&!Array.isArray(value)&&
    (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)&&
    Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)),
    'E_SCHEMA','Unexpected app controller fields');
}

// Fixed package data only. Admission never compiles or executes this source.
export function normalizeAppController(value){
  fields(value,['sourceUtf8','sourceHash','siteOrigins','paramsSchema','deadlineMs','builtinIdentity','permissions']);
  invariant(typeof value.sourceUtf8==='string'&&value.sourceUtf8.trim().length>0&&
    new TextEncoder().encode(value.sourceUtf8).byteLength<=CONTROLLER_SOURCE_LIMIT,
    'E_LIMIT','Invalid or oversized app controller source');
  invariant(typeof value.sourceHash==='string'&&SHA256.test(value.sourceHash),'E_SCHEMA','Invalid controller source SHA-256');
  invariant(!/(?:^|\n)\s*(?:import|export)\s+(?:[\w*{]|["'])/.test(value.sourceUtf8),
    'E_SCHEMA','App controller requires precompiled Classic JavaScript');
  invariant(validExactSiteOrigins(value.siteOrigins),'E_PERMISSION','App controller requires exact site origins');
  checkParamsSchema(value.paramsSchema);
  invariant(Number.isSafeInteger(value.deadlineMs)&&value.deadlineMs>=1&&value.deadlineMs<=90000,
    'E_SCHEMA','App controller deadline must be 1–90000 ms');
  fields(value.builtinIdentity,['abi','catalogSha256','bundleSha256']);
  const identity=value.builtinIdentity;
  invariant(identity.abi===BUILTIN_ABI&&
    typeof identity.catalogSha256==='string'&&SHA256.test(identity.catalogSha256)&&
    typeof identity.bundleSha256==='string'&&SHA256.test(identity.bundleSha256),
    'E_BUILTIN_VERSION_UNAVAILABLE','Invalid app controller builtin runtime identity');
  invariant(Array.isArray(value.permissions)&&value.permissions.length===1&&value.permissions[0]==='page.automation',
    'E_PERMISSION','App controller permits only page.automation');
  // Validates JSON and unpaired UTF-16 surrogates before encoding UTF-8.
  canonical(value);
  return structuredClone(value);
}

export async function verifyAppController(value){
  const controller=normalizeAppController(value);
  invariant(await digestUtf8(controller.sourceUtf8)===controller.sourceHash,
    'E_TOOL_CONTROLLER_SHA','Controller source does not match its fixed SHA-256');
  return controller;
}

export function appControllerReview(tool){
  if(tool.controller===undefined)return '';
  const controller=normalizeAppController(tool.controller),identity=controller.builtinIdentity;
  return '\n固定 Controller（可运行、读取结果及停止）：\n'+
    `源码 SHA-256：${controller.sourceHash}\n`+
    `内置运行时：${identity.abi} · catalog SHA-256：${identity.catalogSha256} · bundle SHA-256：${identity.bundleSha256}\n`+
    `网站：${controller.siteOrigins.join('、')}\n参数：${canonical(controller.paramsSchema)}\n`+
    `期限：${controller.deadlineMs} ms\n仅页面能力：page.automation`;
}
