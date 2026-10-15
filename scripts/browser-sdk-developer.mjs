// Developer-only projection. All approval, capabilities and native routing come
// from the existing generator/Registry. This file never enters the MV3 bundle.
const safeName=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9]*$/.test(value)&&
  !['constructor','prototype','__proto__'].includes(value);
const safeField=value=>typeof value==='string'&&value.length>0&&value.length<=128&&
  !['constructor','prototype','__proto__'].includes(value);

export function schemaToTypescript(schema,depth=0){
  if(depth>14)throw Error('Browser developer schema depth exceeded');
  if(schema===true)return 'unknown';
  if(!schema||typeof schema!=='object'||Array.isArray(schema))
    throw Error('Invalid Browser developer schema');
  if(Object.hasOwn(schema,'const'))return JSON.stringify(schema.const);
  if(Array.isArray(schema.enum))return schema.enum.map(x=>JSON.stringify(x)).join(' | ')||'never';
  for(const union of ['anyOf','oneOf','allOf']){
    if(Array.isArray(schema[union]))return schema[union].map(x=>schemaToTypescript(x,depth+1))
      .join(union==='allOf'?' & ':' | ');
  }
  switch(schema.type){
    case 'string':return 'string';
    case 'integer':case 'number':return 'number';
    case 'boolean':return 'boolean';
    case 'null':return 'null';
    case 'array':return 'Array<'+schemaToTypescript(schema.items??true,depth+1)+'>';
    case 'object':{
      const required=new Set(schema.required??[]);
      const parts=Object.entries(schema.properties??{}).sort(([a],[b])=>a.localeCompare(b,'en'))
        .map(([key,rule])=>{
          if(!safeField(key))throw Error('Unsafe public Browser type field: '+key);
          const property=/^[A-Za-z][A-Za-z0-9]*$/.test(key)?key:JSON.stringify(key);
          return 'readonly '+property+(required.has(key)?'':'?')+': '+
            schemaToTypescript(rule,depth+1)+';';
        });
      if(schema.additionalProperties!==false)parts.push('readonly [key: string]: unknown;');
      return '{ '+parts.join(' ')+' }';
    }
    case undefined:
      if(Object.keys(schema).length===0)return 'unknown';
      throw Error('Unsupported Browser developer schema');
    default:throw Error('Unsupported Browser developer schema '+schema.type);
  }
}

export function renderBrowserDeveloperArtifacts(catalog,registry,approvedOperations){
  const published=catalog.bindings.filter(x=>x.visibility==='APPROVED_TOOL_REGISTERED');
  const approved=new Map(approvedOperations.map(row=>[row.id,row]));
  const tree=Object.create(null),tick=String.fromCharCode(96);
  const md=['# OpenDesk Browser SDK — generated API reference','',
    '> Generated from the existing approved matrix, compiled Binding catalog and live SDK Registry.',
    '> A method name in this document never grants permission to an installed tool.',''];
  for(const row of published){
    const authority=approved.get(row.operation),contract=registry[row.operation];
    if(!authority||!contract?.inputSchema||!contract?.outputSchema)
      throw Error('Approved Browser operation lacks a runtime type: '+row.operation);
    const path=row.operation.slice('browser.'.length).split('.');
    if(!path.every(safeName))throw Error('Unsafe Browser method path');
    let current=tree;
    for(const name of path.slice(0,-1)){
      if(Object.hasOwn(current,name)&&current[name].leaf)
        throw Error('Browser namespace collides with a method');
      if(!Object.hasOwn(current,name))current[name]={children:Object.create(null)};
      current=current[name].children;
    }
    const leaf=path.at(-1);
    if(Object.hasOwn(current,leaf))throw Error('Duplicate public Browser method');
    const args=row.operation==='browser.clipboard.writeText'?'text: string':
      'input'+((contract.inputSchema.required??[]).length?'':'?')+': '+
      schemaToTypescript(contract.inputSchema);
    const result=schemaToTypescript(contract.outputSchema);
    current[leaf]={leaf:true,args,result};
    const q=name=>tick+name+tick;
    md.push('## OpenDeskSDK.browser.'+path.join('.'),'','- Signature: '+
      q('('+args+') => Promise<'+result+'>'),'- Mode: '+authority.mappingKind+
      '; native: '+(row.nativeApis.length?row.nativeApis.map(q).join(', '):'existing trusted service'),
      '- Capabilities: '+(row.toolCapabilities.length?row.toolCapabilities.map(q).join(', '):'none')+
      '; Chrome permissions: '+(row.chromePermissions.length?row.chromePermissions.map(q).join(', '):'none'),
      '- Scope: '+row.siteScope+'; user gesture: '+(row.userGesture?'required':'not required'),
      '- Route: installed-tool bridge → original authorized Host → approved Driver/Chrome','');
  }
  const lines=['// GENERATED for developer use; never import into the MV3 runtime.',
    '// Authority: docs/api/browser-sdk-interface-matrix.json + browser-contract.js',
    'export interface OpenDeskBrowserSdk {','  readonly apiVersion: string;'];
  const emit=(children,depth)=>{
    const indent='  '.repeat(depth);
    for(const name of Object.keys(children).sort()){
      const item=children[name];
      if(item.leaf)lines.push(indent+'readonly '+name+': ('+item.args+') => Promise<'+item.result+'>;');
      else{
        lines.push(indent+'readonly '+name+': {');
        emit(item.children,depth+1);
        lines.push(indent+'};');
      }
    }
  };
  emit(tree,1);
  lines.push('}','export interface OpenDeskDeveloperSdk {',
    '  readonly browser: OpenDeskBrowserSdk;','}',
    '// Available only inside an installed Sidebar tool; not the Page SDK.',
    'declare global {','  const OpenDeskSDK: OpenDeskDeveloperSdk;','}','');
  return {types:lines.join('\n'),documentation:md.join('\n')+'\n',publicCount:published.length};
}
