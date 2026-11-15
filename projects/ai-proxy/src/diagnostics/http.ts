import {diagnosticUrl} from './catalog';
import {classifyHttp} from './logic';
import type {HttpObservation} from './types';

export type NetworkRequest = (input: {
  method:'GET'; url:string; config:{timeout:number;responseType:'text'}
}) => Promise<{status:number;data?:unknown}>;
export type HttpCheck = Pick<HttpObservation,'kind'|'httpStatus'|'elapsedMs'>;

/** Public bounded SDK request only. Response bodies and arbitrary errors never leave this adapter. */
export async function checkDiagnosticSite(id:string, request:NetworkRequest):Promise<HttpCheck> {
  const url=diagnosticUrl(id);
  if(!url)throw Object.assign(Error('Unknown diagnostic target'),{code:'E_INVALID_ARGUMENT'});
  const started=performance.now();
  try {
    const result=await request({method:'GET',url,config:{timeout:10000,responseType:'text'}});
    if(!Number.isInteger(result?.status)||result.status<0||result.status>599)
      return {kind:'network_error',httpStatus:null,elapsedMs:null};
    return {kind:result.status===0?'redirect':classifyHttp(result.status),
      httpStatus:result.status||null,elapsedMs:Math.max(0,Math.round(performance.now()-started))};
  } catch(error:any) {
    const code=typeof error?.code==='string'?error.code:'';
    const kind=/TIMEOUT|DEADLINE/.test(code)?'timeout'
      :/PERMISSION|CAPABILITY|GESTURE|NETWORK_NOT_SUBMITTED|REVOKED|TOOL_CHANGED/.test(code)?'permission'
      :/LIMIT|TOO_LARGE|QUOTA/.test(code)?'response_limit':code==='E_HTTP'?'http_error':'network_error';
    return {kind,httpStatus:null,elapsedMs:null};
  }
}
