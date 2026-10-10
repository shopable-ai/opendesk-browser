// Build-time specialization of literal validate(name, value) calls. The runtime
// validator is unchanged; every selected root retains its complete $ref closure.
// Dynamic names and shadowed bindings keep the full generic validation path.
import {parse} from 'acorn';
import {compactSchemaSource} from './compact-schema.mjs';
import {resolve,dirname,relative,sep} from 'node:path';

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) { for (const item of value) walk(item,visit); }
    else if (value && typeof value === 'object') walk(value,visit);
  }
}
function bindingNames(pattern, names) {
  if (!pattern) return;
  if (pattern.type === 'Identifier') names.add(pattern.name);
  else if (pattern.type === 'RestElement') bindingNames(pattern.argument,names);
  else if (pattern.type === 'AssignmentPattern') bindingNames(pattern.left,names);
  else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(item=>bindingNames(item,names));
  else if (pattern.type === 'ObjectPattern') pattern.properties.forEach(item=>
    bindingNames(item.type === 'RestElement' ? item.argument : item.value,names));
}
const modulePath = (from,to) => {
  const path=relative(dirname(from),to).split(sep).join('/');
  return path.startsWith('.') ? path : './'+path;
};

export function createSchemaSpecializer(schema,{root=process.cwd()}={}) {
  const names=Object.keys(schema.$defs || {});
  if (!names.length) throw Error('Named schema definitions required');
  const index=new Map(names.map((name,i)=>[name,i]));
  const scopeName=name=>'opendeskSchemaScope'+index.get(name);
  const protocol=resolve(root,'src/platform/protocol.js');
  const schemaPath=resolve(root,'src/platform/schema.js');
  function closure(name) {
    const seen=new Set();
    function include(key) {
      if(seen.has(key)) return;
      if(!index.has(key)) throw Error('Unknown schema dependency: '+key);
      seen.add(key);
      function references(value) {
        if(!value||typeof value!=='object')return;
        if(Object.hasOwn(value,'$ref')) {
          const ref=value.$ref;
          if(typeof ref!=='string'||!ref.startsWith('#/$defs/'))
            throw Error('Only reviewed local $defs references can be specialized: '+ref);
          let target=schema;
          const tokens=ref.slice(2).split('/').map(token=>{
            if(/~(?:[^01]|$)/.test(token)) throw Error('Invalid schema pointer: '+ref);
            return token.replace(/~1/g,'/').replace(/~0/g,'~');
          });
          for(const token of tokens) {
            if(!target||typeof target!=='object'||!Object.hasOwn(target,token))
              throw Error('Unresolved schema pointer: '+ref);
            target=target[token];
          }
          include(tokens[1]);
        }
        Object.values(value).forEach(references);
      }
      references(schema.$defs[key]);
    }
    include(name);
    return names.filter(key=>seen.has(key));
  }
  const closures=new Map(names.map(name=>[name,closure(name)]));

  function namedExports() {
    // Share identical fixed sub-objects. Constants, not calls, allow Rollup to
    // discard unreachable rules without decoding/initializing the whole schema.
    const counts=new Map(), shared=new Map(), declarations=[];
    function count(value) {
      if(!value||typeof value!=='object')return;
      const key=JSON.stringify(value);counts.set(key,(counts.get(key)||0)+1);
      Object.values(value).forEach(count);
    }
    names.forEach(name=>count(schema.$defs[name]));
    function render(value) {
      if(!value||typeof value!=='object')return JSON.stringify(value);
      const key=JSON.stringify(value),repeated=key.length>=40&&counts.get(key)>1;
      if(repeated&&shared.has(key))return shared.get(key);
      const text=Array.isArray(value)?'['+value.map(render).join(',')+']':
        '{'+Object.entries(value).map(([name,item])=>
          (name==='__proto__'?'["__proto__"]':JSON.stringify(name))+':'+render(item)).join(',')+'}';
      if(!repeated)return text;
      const name='opendeskSchemaPart'+shared.size;shared.set(key,name);
      declarations.push('const '+name+'='+text+';');return name;
    }
    const definitions=names.map((name,i)=>'const opendeskSchemaDef'+i+'='+render(schema.$defs[name])+';');
    const scopes=names.map(name=>'export const '+scopeName(name)+'={$defs:{'+closures.get(name).map(key=>
      (key==='__proto__'?'["__proto__"]':JSON.stringify(key))+':opendeskSchemaDef'+index.get(key)).join(',')+'}};');
    return [...declarations,...definitions,...scopes].join('\n')+'\n';
  }

  function transform(source,id) {
    if(id===schemaPath)return null; // The WXT schema transform appends namedExports.
    const isProtocol=id===protocol;
    // Cheap prefilter: never parse unrelated code, vendor code or virtual entries.
    if(!id.startsWith(resolve(root,'src')+sep)||!source.includes('validate')||
      (!isProtocol&&!source.includes('protocol.js')))return null;
    const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
    const aliases=new Set();
    for(const node of ast.body)if(node.type==='ImportDeclaration'&&
      resolve(dirname(id),node.source.value)===protocol)
      for(const spec of node.specifiers)if(spec.type==='ImportSpecifier'&&spec.imported.name==='validate')aliases.add(spec.local.name);
    if(isProtocol)aliases.add('validate');
    if(!aliases.size)return null;
    const shadowed=new Set(),identifiers=new Set();
    walk(ast,node=>{
      if(node.type==='Identifier')identifiers.add(node.name);
      if(node.type==='VariableDeclarator')bindingNames(node.id,shadowed);
      if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type)) {
        if(!(isProtocol&&node.type==='FunctionDeclaration'&&node.id?.name==='validate'))bindingNames(node.id,shadowed);
        node.params.forEach(param=>bindingNames(param,shadowed));
      }
      if(['ClassDeclaration','ClassExpression'].includes(node.type))bindingNames(node.id,shadowed);
      if(node.type==='CatchClause')bindingNames(node.param,shadowed);
    });
    for(const name of shadowed)aliases.delete(name);
    let prefix='__opendeskScoped';
    while([...identifiers].some(name=>name.startsWith(prefix)))prefix+='_';
    const projections=isProtocol?ast.body.map(node=>node.declaration).filter(node=>
      node?.type==='FunctionDeclaration'&&['projectRun','projectCommand'].includes(node.id?.name)&&
      !node.params.some(param=>{const bindings=new Set();bindingNames(param,bindings);return bindings.has('schema');})):[];
    const imported=new Set(),edits=[];
    const scoped=name=>{imported.add(name);return prefix+'Rule'+index.get(name);};
    const helper=isProtocol?'validateSchema':prefix+'Validate';
    let calls=0;
    walk(ast,node=>{
      if(node.type==='CallExpression'&&!node.optional&&node.callee.type==='Identifier'&&
        aliases.has(node.callee.name)&&node.arguments.length===2&&node.arguments[0].type==='Literal'&&
        typeof node.arguments[0].value==='string'&&index.has(node.arguments[0].value)) {
        const name=node.arguments[0].value;
        edits.push({start:node.callee.start,end:node.callee.end,text:helper});
        edits.push({start:node.arguments[0].start,end:node.arguments[0].start,text:scoped(name)+','});
        calls++;
      }
      if(isProtocol&&projections.some(fn=>node.start>=fn.start&&node.end<=fn.end)&&node.type==='MemberExpression'&&!node.computed&&node.object.type==='MemberExpression'&&
        !node.object.computed&&node.object.object.type==='Identifier'&&node.object.object.name==='schema'&&
        node.object.property.name==='$defs'&&index.has(node.property.name))
        edits.push({start:node.object.object.start,end:node.object.object.end,text:scoped(node.property.name)});
    });
    if(!edits.length)return null;
    // Rewriting references is forbidden if schema's local binding ever changes.
    // The source module is intentionally tiny and guarded by its import shape.
    if(isProtocol&&!ast.body.some(node=>node.type==='ImportDeclaration'&&node.source.value==='./schema.js'&&
      node.specifiers.some(spec=>spec.type==='ImportDefaultSpecifier'&&spec.local.name==='schema')))
      throw Error('Protocol schema binding changed; re-review specialization');
    for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
    const imports=[];
    if(calls&&!isProtocol)imports.push('import {validateSchema as '+helper+'} from '+JSON.stringify(modulePath(id,protocol))+';');
    imports.push('import {'+[...imported].map(name=>scopeName(name)+' as '+prefix+'Rule'+index.get(name)).join(',')+
      '} from '+JSON.stringify(modulePath(id,schemaPath))+';');
    return {code:imports.join('\n')+'\n'+source,map:null};
  }
  function schemaModuleSource(source,{background=false}={}) {
    const marker='export default ';
    const start=source.indexOf(marker);
    if(start<0||JSON.stringify(JSON.parse(source.slice(start+marker.length).trim().replace(/;$/,'')))!==JSON.stringify(schema))
      throw Error('Schema changed after build configuration loaded; restart the build');
    let code=compactSchemaSource(source,{adaptive:background,fixedDeflate:background});
    const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});
    const exported=ast.body.find(node=>node.type==='ExportDefaultDeclaration');
    const initializer=exported?.declaration;
    if(initializer?.type==='CallExpression'&&initializer.callee.type==='Identifier'&&
      ['unpackSchema','unpackFixedSchema'].includes(initializer.callee.name)) {
      // Only a known generated constant-data decoder is pure. The validator,
      // its guards, user functions and arbitrary modules are never annotated.
      code=code.slice(0,initializer.start)+'/* @__PURE__ */ '+code.slice(initializer.start);
    }else if(initializer?.type!=='ObjectExpression')
      throw Error('Unexpected generated schema initializer; re-review the pure boundary');
    return code+(background?namedExports():'');
  }
  return {namedExports,transform,schemaModuleSource,closure:name=>[...closures.get(name)],names:[...names]};
}
