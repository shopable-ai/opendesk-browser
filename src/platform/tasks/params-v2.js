// Version 2 only. Legacy semantics remain in contract.js; installation stays
// gated until all consumers carry the explicit version and UI metadata.
import {canonical, invariant} from '../protocol.js';
import {TASK_PACKAGE_LIMIT} from '../source-budgets.js';

const SCALARS=['string','integer','number','boolean'];
const NUMERIC=['integer','number'];
const TIME='^(?:[01][0-9]|2[0-3]):[0-5][0-9]$';
const HTTP='^https?://';
const MAX_BYTES=65536;
const own=Object.hasOwn;
const nameOk=k=>typeof k==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k)&&!['constructor','prototype','__proto__'].includes(k);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const count=v=>[...v].length;
const boundedInt=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const check=(ok,path,message,code='E_SCHEMA')=>invariant(ok,code,`${path}: ${message}`);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
function record(v,allowed,required,path,code='E_SCHEMA'){
  check(plain(v),path,'Expected closed object',code);
  const keys=Reflect.ownKeys(v);
  check(keys.length<=allowed.length&&keys.every(k=>typeof k==='string'&&allowed.includes(k)&&
    Object.getOwnPropertyDescriptor(v,k).enumerable&&own(Object.getOwnPropertyDescriptor(v,k),'value'))&&
    required.every(k=>own(v,k)),path,'Unexpected or missing fields',code);
}
function array(v,max,path,code='E_SCHEMA'){
  check(Array.isArray(v)&&v.length<=max,path,'Invalid array size',code);
  check(Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>i).every(i=>{
    const d=Object.getOwnPropertyDescriptor(v,String(i));return d?.enumerable&&own(d,'value');
  }),path,'Expected dense JSON array',code);
}
function text(v,min,max,path){
  check(typeof v==='string'&&v.length>=min&&v.length<=max,path,'Invalid text');
}
function budget(v,path,code,limit=MAX_BYTES){
  let serialized;
  try{serialized=canonical(v);}catch{check(false,path,'Invalid JSON value or depth',code);}
  check(new TextEncoder().encode(serialized).byteLength<=limit,path,'JSON exceeds byte budget',code);
}
// Exact grid arithmetic over the shortest decimal representation of a JSON
// number. No floating-point tolerance, including for exponent notation.
function decimal(v){
  const [mantissa,exponent='0']=String(v).split('e');
  const [whole,fraction='']=mantissa.split('.');
  const scale=fraction.length-Number(exponent);
  return [BigInt(whole+fraction)*10n**BigInt(Math.max(0,-scale)),10n**BigInt(Math.max(0,scale))];
}
function ratio(v,step){const [n,d]=decimal(v),[s,t]=decimal(step);return [n*t,d*s];}
function onGrid(v,step){const [n,d]=ratio(v,step);return n%d===0n;}
const floor=(n,d)=>n/d-(n<0n&&n%d!==0n?1n:0n);
const ceil=(n,d)=>-floor(-n,d);
function gcd(a,b){while(b){[a,b]=[b,a%b];}return a;}
function numericDomain(r,path){
  const integer=r.type==='integer',lo=r.minimum??(integer?-Number.MAX_SAFE_INTEGER:-Number.MAX_VALUE),
    hi=r.maximum??(integer?Number.MAX_SAFE_INTEGER:Number.MAX_VALUE);
  if(integer){
    const min=Math.max(lo,-Number.MAX_SAFE_INTEGER),max=Math.min(hi,Number.MAX_SAFE_INTEGER);
    check(Math.ceil(min)<=Math.floor(max),path,'No safe integer in range');
    if(own(r,'multipleOf')){
      const [n,d]=decimal(r.multipleOf),grid=n/gcd(n,d);
      check(ceil(BigInt(Math.ceil(min)),grid)<=floor(BigInt(Math.floor(max)),grid),path,'Empty integer step grid');
    }
  }else if(own(r,'multipleOf')){
    const [a,b]=ratio(lo,r.multipleOf),[c,d]=ratio(hi,r.multipleOf);
    check(ceil(a,b)<=floor(c,d),path,'Empty numeric step grid');
  }
}
function date(v){
  if(v.length!==10||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v.startsWith('0000'))return false;
  const [y,m,d]=v.split('-').map(Number),leap=y%4===0&&(y%100!==0||y%400===0);
  return m>=1&&m<=12&&d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
}
function uri(v){
  if(!/^https?:\/\/[^/\\?#]/i.test(v)||/[\s\u0000-\u001f\u007f\\]/u.test(v)||v.split('/')[2].includes('@'))return false;
  try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!!u.hostname&&!u.hostname.includes('*')&&!u.username&&!u.password;}
  catch{return false;}
}
function scalar(r,v,path,code='E_SCHEMA',skipChoices=false){
  const ok=r.type==='integer'?Number.isSafeInteger(v):r.type==='number'?finite(v):typeof v===r.type;
  check(ok,path,'Wrong value type',code);
  if(r.type==='string'){
    const max=r.maxLength??1024;
    check(v.length<=max*2&&count(v)>= (r.minLength??0)&&count(v)<=max,path,'Invalid string length',code);
    if(r.format==='date')check(date(v),path,'Invalid calendar date',code);
    if(r.format==='uri')check(uri(v),path,'Expected absolute HTTP(S) URL without credentials',code);
    if(r.pattern===HTTP)check(v.startsWith('http://')||v.startsWith('https://'),path,'Invalid HTTP(S) scheme',code);
    if(r.pattern===TIME)check(v.length===5&&new RegExp(TIME).test(v),path,'Invalid HH:mm time',code);
  }else if(NUMERIC.includes(r.type)){
    check((!own(r,'minimum')||v>=r.minimum)&&(!own(r,'maximum')||v<=r.maximum),path,'Outside numeric bounds',code);
    if(own(r,'multipleOf'))check(onGrid(v,r.multipleOf),path,'Off numeric step grid',code);
  }
  if(own(r,'const'))check(v===r.const,path,'Wrong fixed value',code);
  if(!skipChoices&&own(r,'enum'))check(r.enum.includes(v),path,'Unknown choice',code);
}
function value(r,v,path,code='E_SCHEMA'){
  if(r.type!=='array'){scalar(r,v,path,code);return;}
  array(v,r.maxItems??32,path,code);
  check(v.length>=(r.minItems??0)&&new Set(v).size===v.length&&v.every(x=>r.items.enum.includes(x)),path,'Invalid or duplicate array choice',code);
}
function choices(list,r,path){
  array(list,32,path);check(list.length>0&&new Set(list).size===list.length,path,'Invalid or duplicate choices');
  for(const x of list)scalar(r,x,path,'E_SCHEMA',true);
}
function field(r,path){
  check(plain(r)&&own(r,'type')&&own(Object.getOwnPropertyDescriptor(r,'type'),'value'),path,'Expected field');
  const type=r.type;
  check([...SCALARS,'array'].includes(type),path,'Unsupported field type');
  const common=['type','title','description','default'];
  const specific=type==='array'?['items','uniqueItems','minItems','maxItems']:
    ['enum','const',...(type==='string'?['minLength','maxLength','format','pattern']:NUMERIC.includes(type)?['minimum','maximum','multipleOf']:[])];
  record(r,[...common,...specific],['type','title',...(type==='array'?['items','uniqueItems']:[])],path);
  text(r.title,1,60,path);check(r.title.trim()===r.title,path,'Invalid title');
  if(own(r,'description')){text(r.description,1,240,path);check(r.description.trim()===r.description,path,'Invalid description');}
  if(type==='string'){
    for(const key of ['minLength','maxLength'])if(own(r,key))check(boundedInt(r[key],4096),path,'Invalid length bound');
    check((r.minLength??0)<=(r.maxLength??1024),path,'Empty length range');
    if(own(r,'format'))check(['date','uri'].includes(r.format),path,'Unsupported format');
    if(own(r,'pattern'))check((r.pattern===HTTP&&r.format==='uri')||(r.pattern===TIME&&!own(r,'format')),path,'Unsupported pattern or format combination');
    const length=r.format==='date'?10:r.pattern===TIME?5:null;
    if(length!==null)check((r.minLength??0)<=length&&(r.maxLength??1024)>=length,path,'Format cannot satisfy length bounds');
    if(r.format==='uri')check((r.maxLength??1024)>=8,path,'URL cannot satisfy length bound');
  }else if(NUMERIC.includes(type)){
    for(const key of ['minimum','maximum','multipleOf'])if(own(r,key))check(finite(r[key]),path,'Invalid numeric bound');
    check(!own(r,'minimum')||!own(r,'maximum')||r.minimum<=r.maximum,path,'Reversed bounds');
    if(own(r,'multipleOf'))check(r.multipleOf>0,path,'Invalid step');
    numericDomain(r,path);
  }else if(type==='array'){
    record(r.items,['type','enum'],['type','enum'],path+'.items');
    check(SCALARS.includes(r.items.type)&&r.uniqueItems===true,path,'Expected unique scalar choices');
    choices(r.items.enum,{type:r.items.type,maxLength:4096},path+'.items.enum');
    for(const key of ['minItems','maxItems'])if(own(r,key))check(boundedInt(r[key],32),path,'Invalid array bound');
    check((r.minItems??0)<=Math.min(r.maxItems??32,r.items.enum.length),path,'Empty array size range');
  }
  if(own(r,'const'))scalar(r,r.const,path,'E_SCHEMA',true);
  if(own(r,'enum'))choices(r.enum,r,path+'.enum');
  if(own(r,'default'))value(r,r.default,path+'.default');
}
function widgetOf(r){
  return r.type==='array'?'multi-checkbox':r.enum?'select':r.format==='date'?'date':r.format==='uri'?'url':
    r.pattern===TIME?'time':r.type==='boolean'?'checkbox':NUMERIC.includes(r.type)?'number':'text';
}
function uiCheck(ui,properties,keys){
  if(ui===undefined)return;
  record(ui,['version','order','fields'],['version'],'paramsUi');check(ui.version===1,'paramsUi','Unsupported UI version');
  if(own(ui,'order')){
    array(ui.order,16,'paramsUi.order');check(ui.order.length===keys.length&&new Set(ui.order).size===keys.length&&
      ui.order.every(k=>keys.includes(k)),'paramsUi.order','Expected full field permutation');
  }
  if(!own(ui,'fields'))return;
  record(ui.fields,keys,[],'paramsUi.fields');
  for(const [key,config] of Object.entries(ui.fields)){
    const r=properties[key],path='paramsUi.fields.'+key,inferred=widgetOf(r);
    record(config,['widget','placeholder','unit','optionLabels'],[],path);
    const compatible={text:['text','textarea'],number:['number','slider'],checkbox:['checkbox','switch'],select:['select','radio']}[inferred]??[inferred];
    const widget=own(config,'widget')?config.widget:inferred;
    check(compatible.includes(widget),path,'Incompatible widget');
    if(own(config,'placeholder')){check(['text','textarea','number','select','url'].includes(widget),path,'Unexpected placeholder');text(config.placeholder,0,160,path);}
    if(own(config,'unit')){check(['number','slider'].includes(widget),path,'Unexpected unit');text(config.unit,0,16,path);}
    if(own(config,'optionLabels')){
      const options=r.type==='array'?r.items.enum:r.enum;
      array(config.optionLabels,32,path);check(options&&config.optionLabels.length===options.length,path,'Invalid option label mapping');
      for(const label of config.optionLabels)text(label,1,80,path);
    }
    if(widget==='slider'){
      check(own(r,'minimum')&&own(r,'maximum')&&r.minimum<r.maximum&&own(r,'default'),path,'Slider needs ordered bounds and default');
      const step=r.multipleOf??(r.type==='integer'?1:undefined);
      check(step!==undefined&&(r.type!=='integer'||Number.isSafeInteger(step)&&Number.isSafeInteger(r.minimum)&&Number.isSafeInteger(r.maximum)),path,'Invalid slider step or integer bounds');
      check([r.minimum,r.maximum,r.default].every(x=>onGrid(x,step)),path,'Slider is off zero-based grid');
    }
  }
}
export function checkParamsSchemaV2(schema,ui){
  record(schema,['type','properties','required','additionalProperties'],['type','properties','required','additionalProperties'],'paramsSchema');
  check(schema.type==='object'&&schema.additionalProperties===false&&plain(schema.properties),'paramsSchema','Expected closed object schema');
  const keys=Object.keys(schema.properties);
  check(keys.length<=16&&keys.every(nameOk),'paramsSchema.properties','Invalid parameter names');
  record(schema.properties,keys,keys,'paramsSchema.properties');
  array(schema.required,16,'paramsSchema.required');
  check(new Set(schema.required).size===schema.required.length&&schema.required.every(k=>keys.includes(k)),'paramsSchema.required','Invalid required fields');
  for(const [k,r] of Object.entries(schema.properties))field(r,'paramsSchema.properties.'+k);
  uiCheck(ui,schema.properties,keys);
  budget({paramsSchema:schema,...(ui===undefined?{}:{paramsUi:ui})},'paramsSchema','E_SCHEMA',TASK_PACKAGE_LIMIT);
  return schema;
}
export function validateTaskParamsV2(schema,params,ui){
  checkParamsSchemaV2(schema,ui);
  record(params,Object.keys(schema.properties),[],'params','E_PARAMS');
  const result={};
  for(const [key,r] of Object.entries(schema.properties)){
    const path='params.'+key;
    if(!own(params,key)&&!own(r,'default')){check(!schema.required.includes(key),path,'Missing required parameter','E_PARAMS');continue;}
    const v=own(params,key)?params[key]:r.default;
    value(r,v,path,'E_PARAMS');result[key]=Array.isArray(v)?[...v]:v;
  }
  budget(params,'params','E_PARAMS');budget(result,'params','E_PARAMS');
  return result;
}
