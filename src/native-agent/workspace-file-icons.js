// Static, local outline icons for the trusted Native Workspace explorer.
// No icon fonts, remote requests, HTML injection or user-controlled SVG paths.
const NS='http://www.w3.org/2000/svg';
const PAGE=['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z','M14 2v6h6'];
const ICONS=Object.freeze({
  folder:['M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4.6a2 2 0 0 1 1.6.8L12.8 8H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z'],
  'folder-open':['M2 10V6a2 2 0 0 1 2-2h4.6a2 2 0 0 1 1.6.8L12.8 8H20a2 2 0 0 1 2 2v1','M3 13h18l-2.5 7H5.5Z'],
  file:PAGE,
  text:[...PAGE,'M8 12h8','M8 16h8','M8 19h5'],
  markdown:[...PAGE,'M8 17v-5l2.5 3 2.5-3v5','M15 13v4'],
  code:[...PAGE,'m10 12-2 2 2 2','m14 12 2 2-2 2'],
  json:[...PAGE,'M10 12H9c-1 0-1 1-1 2s0 2-1 2h3','M14 12h1c1 0 1 1 1 2s0 2 1 2h-3'],
  style:[...PAGE,'M8 12h8','M8 16h5','M15 16v3'],
  markup:[...PAGE,'m10 12-2 2 2 2','m14 12 2 2-2 2'],
});
const create=(doc,name)=>doc.createElementNS?doc.createElementNS(NS,name):doc.createElement(name);

export function workspaceFileIconVariant(kind,name='',expanded=false){
  if(kind==='directory')return expanded?'folder-open':'folder';
  if(kind!=='file')return 'file';
  const suffix=typeof name==='string'?name.slice(name.lastIndexOf('.')+1).toLowerCase():'';
  if(suffix==='md'||suffix==='markdown')return 'markdown';
  if(['js','jsx','ts','tsx','mjs'].includes(suffix))return 'code';
  if(suffix==='json')return 'json';
  if(suffix==='css')return 'style';
  if(['html','htm'].includes(suffix))return 'markup';
  if(suffix==='txt')return 'text';
  return 'file';
}

function vector(doc,className,paths){
  const svg=create(doc,'svg');
  for(const [key,value] of Object.entries({
    class:className,viewBox:'0 0 24 24',width:'18',height:'18',
    fill:'none',stroke:'currentColor','stroke-width':'1.8',
    'stroke-linecap':'round','stroke-linejoin':'round',
    'aria-hidden':'true',focusable:'false'
  }))svg.setAttribute(key,value);
  for(const d of paths){const path=create(doc,'path');path.setAttribute('d',d);svg.append(path);}
  return svg;
}

export function createWorkspaceFileIcon(doc,kind,name,expanded=false){
  const variant=workspaceFileIconVariant(kind,name,expanded);
  const svg=vector(doc,'file-icon',ICONS[variant]);
  svg.setAttribute('data-variant',variant);
  return svg;
}

export function createWorkspaceTreeChevron(doc,expanded){
  const svg=vector(doc,'tree-caret',['m9 18 6-6-6-6']);
  svg.setAttribute('data-expanded',String(!!expanded));
  return svg;
}
