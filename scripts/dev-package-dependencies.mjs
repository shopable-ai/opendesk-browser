// Resolve the existing lock's runtime graph without loading any dependency.
// A direct import can already be provided by a declared tool's transitive tree.
function lockedTree(lock,dependencies,{strict=false}={}){
  const packages=lock.packages||{},names=new Set(),visited=new Set();
  function resolve(name,parent=''){
    let location=parent;
    for(;;){
      const key=(location?location+'/':'')+'node_modules/'+name;
      if(packages[key])return key;
      if(!location)return null;
      location=location.slice(0,Math.max(0,location.lastIndexOf('/')));
    }
  }
  function visit(name,parent,optional=false){
    const key=resolve(name,parent);
    if(!key){if(strict&&!optional)throw new Error('E_PACKAGE_LOCK_MISSING: '+name);return;}
    if(visited.has(key))return;
    visited.add(key);names.add(name);
    const pkg=packages[key];
    for(const child of Object.keys({...pkg.dependencies,...pkg.optionalDependencies}))visit(child,key,child in (pkg.optionalDependencies||{}));
    for(const child of Object.keys(pkg.peerDependencies||{}))visit(child,key,pkg.peerDependenciesMeta?.[child]?.optional===true);
  }
  for(const name of Object.keys(dependencies||{}))visit(name,'');
  return {names,keys:[...visited].sort()};
}
export function lockedRuntimeDependencies(lock,dependencies){
  return lockedTree(lock,dependencies).names;
}
export function createCliShrinkwrap(lock,pkg){
  if(lock.lockfileVersion!==3)throw new Error('E_PACKAGE_LOCK_FORMAT: expected existing npm v3 lock');
  const {keys}=lockedTree(lock,pkg.dependencies,{strict:true});
  for(const [name,version] of Object.entries(pkg.dependencies||{}))
    if(lock.packages['node_modules/'+name]?.version!==version)throw new Error('E_PACKAGE_LOCK_VERSION: '+name);
  const packages={'':{name:pkg.name,version:pkg.version,dependencies:pkg.dependencies,bin:pkg.bin,engines:pkg.engines}};
  for(const key of keys){
    const {dev,devOptional,...entry}=lock.packages[key];
    if(entry.link||!entry.version||!entry.integrity||!entry.resolved?.startsWith('https://'))
      throw new Error('E_PACKAGE_LOCK_ENTRY: '+key);
    packages[key]=entry;
  }
  return {name:pkg.name,version:pkg.version,lockfileVersion:3,requires:true,packages};
}
