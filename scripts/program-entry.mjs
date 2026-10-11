// Static entry classification for an already validated local ESM graph.
// It never evaluates user code or resolves external package/HTTPS exports.
import {dirname,relative,resolve,sep} from 'node:path';

const isFunction=node=>['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node?.type);
const nameOf=node=>node?.name??node?.value;

export function inspectDefaultProgramEntry({entry,root,modules}){
  const target=(file,spec)=>relative(root,resolve(root,dirname(file),spec)).split(sep).join('/');
  const issue=(kind,file,node,chain)=>({kind,file,position:node?.loc?.start,chain});
  const good={kind:'function'};
  const external=(file,node,chain)=>issue('external',file,node,chain);
  function exported(file,name,chain=[]){
    const key=file+'#'+name;
    if(chain.includes(key))return issue('cycle',file,null,[...chain,key]);
    const next=[...chain,key],ast=modules.get(file);
    if(!ast)return issue('missing',file,null,next);
    for(const row of ast.body){
      if(name==='default'&&row.type==='ExportDefaultDeclaration'){
        const value=row.declaration;
        if(isFunction(value))return good;
        return value?.type==='Identifier'?binding(file,value.name,next):issue('non-function',file,row,next);
      }
      if(row.type==='ExportNamedDeclaration'){
        if(row.declaration){
          const decl=row.declaration;
          if(decl.id?.name===name||decl.type==='VariableDeclaration'&&decl.declarations.some(d=>d.id?.name===name))
            return binding(file,name,next);
        }
        for(const spec of row.specifiers){
          if(nameOf(spec.exported)!==name)continue;
          const local=nameOf(spec.local);
          if(row.source){
            const source=row.source.value;
            return source.startsWith('.')?exported(target(file,source),local,next):external(file,row,next);
          }
          return binding(file,local,next);
        }
      }
      if(row.type==='ExportAllDeclaration'&&nameOf(row.exported)===name)
        return issue('non-function',file,row,next); // export * as x is a namespace object.
    }
    // ESM export * never re-exports default. Ambiguous named stars are rejected.
    if(name!=='default'){
      const found=[];
      for(const row of ast.body){
        if(row.type!=='ExportAllDeclaration'||row.exported)continue;
        const spec=row.source.value;
        const result=spec.startsWith('.')?exported(target(file,spec),name,next):external(file,row,next);
        if(result.kind!=='missing')found.push(result);
      }
      if(found.length>1)return issue('ambiguous',file,null,next);
      if(found.length)return found[0];
    }
    return issue('missing',file,null,next);
  }
  function binding(file,name,chain){
    const ast=modules.get(file);
    if(!ast)return issue('missing',file,null,chain);
    for(const row of ast.body){
      const decl=row.type==='ExportNamedDeclaration'?row.declaration:row;
      if(decl?.type==='FunctionDeclaration'&&decl.id?.name===name)return good;
      if(decl?.type==='VariableDeclaration'){
        for(const variable of decl.declarations){
          if(variable.id?.name===name)
            return decl.kind==='const'&&isFunction(variable.init)?good:issue('non-function',file,variable,chain);
        }
      }
      if(decl?.type==='ClassDeclaration'&&decl.id?.name===name)return issue('non-function',file,decl,chain);
      if(row.type==='ExportDefaultDeclaration'&&isFunction(row.declaration)&&row.declaration.id?.name===name)
        return good;
      if(row.type==='ImportDeclaration'){
        for(const spec of row.specifiers){
          if(spec.local?.name!==name)continue;
          if(spec.type==='ImportNamespaceSpecifier')return issue('non-function',file,spec,chain);
          const from=row.source.value;
          const imported=spec.type==='ImportDefaultSpecifier'?'default':nameOf(spec.imported);
          return from.startsWith('.')?exported(target(file,from),imported,chain):external(file,row,chain);
        }
      }
    }
    return issue('missing',file,null,chain);
  }
  return exported(entry,'default');
}
