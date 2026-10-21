import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import '../../examples/sidebar-tools/bookmark-manager/src/model.js';
import '../../examples/sidebar-tools/bookmark-manager/src/service.js';

const prefix='examples/sidebar-tools/bookmark-manager/';
const appPath=prefix+'src/react/App.jsx';
const cssPath=prefix+'src/react/style.css';
const files=[prefix+'src/model.js',prefix+'src/service.js',appPath,cssPath];
const read=p=>readFile(p,'utf8');

test('R3.2 formal JSX is the unique UI source and all four compiled modules remain pinned',async()=>{
 for(const path of files)await access(path);
 assert.equal(existsSync(prefix+'preview/react/src/App.jsx'),false);
 assert.equal(existsSync(prefix+'preview/react/src/style.css'),false);
 const [host,entry,formal,app,build,provenance]=await Promise.all([
  read('src/ui/react/main.tsx'),read(prefix+'preview/react/src/main.jsx'),
  read(prefix+'preview/react/src/formal.jsx'),read(appPath),
  read(prefix+'preview/react/build-preview.mjs'),read('scripts/bundle-provenance.mjs')]);
 assert.match(host,/bookmark-manager\/src\/react\/App\.jsx/);
 assert.match(host,/bookmark-manager\/src\/react\/style\.css\?raw/);
 assert.equal((host.match(/createRoot\(/g)||[]).length,1);
 for(const wrapper of [entry,formal]){
  assert.match(wrapper,/from '\.\.\/\.\.\/\.\.\/src\/react\/App\.jsx'/);
  assert.match(wrapper,/import '\.\.\/\.\.\/\.\.\/src\/react\/style\.css'/);
  assert.doesNotMatch(wrapper,/from '\.\/App\.jsx'/);
 }
 assert.match(build,/join\(toolDir,'src\/react\/App\.jsx'\)/);
 assert.match(build,/join\(toolDir,'src\/react\/style\.css'\)/);
 assert.match(build,/fsWatch\(join\(toolDir,'src'\),\{recursive:true\},schedule\)/);
 assert.match(app,/export default function App\(\{runtime=null,mode='preview'/);
 assert.match(app,/const interactionEpoch=useRef\(0\)/,
  'The selection epoch must exist to guard AI writes from hijacking navigation');
 assert.match(app,/function request\(action\)\{interactionEpoch\.current\+\+;fillEpoch\.current\+\+;/,
  'Changing tools preserves the interaction and stale-page epochs');
 assert.match(app,/if\(busyRef\.current&&!\['select','detail'\]\.includes\(action\.type\)\)return/,
  'While writing, read-only selection/detail remain available but conflicting operations are blocked');
 assert.match(app,/if\(uncertain&&\['create','edit','delete','currentPage'\]\.includes\(action\.type\)\)/,
  'An unknown write blocks subsequent mutations and page capture');
 assert.match(app,/id="bm-edit-name" autoFocus disabled=\{busy\}/);
 assert.match(app,/id="bm-edit-url" type="url" required disabled=\{busy\}/);
 for(const path of files){
  const b=await readFile(path);
  const sha=createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
  assert.ok(provenance.includes("'"+path+"':'"+sha+"'"),'blob must be reviewed: '+path);
 }
 assert.match(host,/import .*bookmark-manager\/src\/model\.js/);
 assert.match(host,/import .*bookmark-manager\/src\/service\.js/);
});

test('R1.8 offline fixture chrome is hashed separately from the production React CSS',async()=>{
 const [preview,builder,formal]=await Promise.all([
  read(prefix+'preview/react/src/main.jsx'),
  read(prefix+'preview/react/build-preview.mjs'),
  read(prefix+'preview/react/src/formal.jsx')
 ]);
 assert.doesNotMatch(preview,/^import '\.\/preview-shell\.css';/m,
  'fixture-only chrome must never enter the formal-comparable React CSS');
 assert.doesNotMatch(formal,/preview-shell\.css/);
 for(const entry of [preview,formal]){
  assert.match(entry,/import '\.\.\/\.\.\/\.\.\/src\/react\/style\.css';/);
  assert.match(entry,/import '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/src\/ui\/react\/components\/conversation-dock\.css';/);
 }
 assert.match(builder,/read\(join\(here,'src\/preview-shell\.css'\)\)/);
 assert.match(builder,/data-preview-shell="offline-only"/);
 assert.match(builder,/previewShell:sha\(previewShell\)/,
  'fixture stylesheet must remain in the hashed preview manifest');
});

function makeSdk(){
 const nodes=[{id:'0',title:'root'},{id:'1',parentId:'0',title:'书签栏',index:0}];
 for(let i=1;i<=130;i++)nodes.push({id:'f'+i,parentId:'1',title:'目录 '+i,index:i});
 for(let i=1;i<=2160;i++)nodes.push({id:'b'+i,parentId:'f'+(i%130+1),index:i,
  title:'收藏 '+i,url:'https://example.test/'+i});
 const methods=['getTree','get','search','create','update','move','remove',
  'prepareRemoveTree','removeTree','observe.start','observe.read','observe.stop'];
 let authorized=true,reads=0,writes=0,gap=false,stops=0;
 const books={
  async getTree({limit=100,cursor}={}){
   reads++;const start=cursor?Number(cursor.slice(1)):0,end=Math.min(start+limit,nodes.length);
   return {nodes:nodes.slice(start,end).map(n=>({...n})),
    snapshotRef:'snapshot-0123456789',nextCursor:end<nodes.length?'c'+end:null};
  },
  async create(data){writes++;const node={...data,id:'fresh-'+writes,index:0};
   nodes.push(node);return {...node};},
  async update({id,changes}){writes++;const n=nodes.find(x=>x.id===id);Object.assign(n,changes);return {...n};},
  async move({id,destination}){writes++;const n=nodes.find(x=>x.id===id);
   n.parentId=destination.parentId;return {...n};},
  async remove({id}){writes++;nodes.splice(nodes.findIndex(x=>x.id===id),1);return {removed:true};},
  async get(){throw Error('unused')},async search(){return []},
  async prepareRemoveTree(){throw Error('no destructive fixture')},
  async removeTree(){throw Error('no destructive fixture')},
  observe:{
   async start(){return {sessionRef:'observer-session-123456',cursor:'initial',
    expiresAt:Date.now()+30000};},
   async read(){return {events:[],nextCursor:'next',expiresAt:Date.now()+30000,
    gapCount:gap?1:0,droppedCount:0};},
   async stop(){stops++;return {stopped:true};}
  }
 };
 const sdk={bookmarks:books,capabilities:{
  async list(){return methods.map(name=>({operation:'browser.bookmarks.'+name,
   requiredCapabilities:['browser.bookmarks.full'],
   status:{callableNow:authorized,reasonCode:authorized?null:'E_BOOKMARK_PERMISSION'}}));},
  async getStatus(){return {callableNow:authorized,
   reasonCode:authorized?null:'E_BOOKMARK_PERMISSION'};}
 }};
 return {sdk,authorize:x=>{authorized=x;},setGap:x=>{gap=x;},
  stats:()=>({reads,writes,stops})};
}

test('R3.2 production Service: paginated 2,292 nodes, CRUD readback, observer gap and revoke',async()=>{
 const fake=makeSdk();
 const service=globalThis.BookmarkR2Service.create(fake.sdk);
 const tree=await service.load();
 assert.equal(tree.byId.size,2292);
 assert.equal([...tree.byId.values()].filter(globalThis.BookmarkR2Model.isFolder).length,132);
 assert.equal(fake.stats().reads,23);
 const created=await service.createBookmark({title:'示例',url:'https://example.test/new',parentId:'f1'});
 const first=(await service.load()).byId.get(created.id);
 assert.equal(first.url,'https://example.test/new');
 await service.update({expected:first,title:'已编辑',url:'https://example.test/updated'});
 const updated=(await service.load()).byId.get(created.id);
 assert.equal(updated.title,'已编辑');
 await service.move({expected:updated,parentId:'f2'});
 const moved=(await service.load()).byId.get(created.id);
 assert.equal(moved.parentId,'f2');
 await service.remove({expected:moved,confirmed:true,expectedDescendantSignatures:[]});
 assert.equal((await service.load()).byId.has(created.id),false);
 assert.equal(fake.stats().writes,4);
 const session=await service.watchStart();
 assert.deepEqual((await service.watchRead(session)).events,[]);
 fake.setGap(true);
 await assert.rejects(service.watchRead(session),e=>e.code==='E_BOOKMARK_EVENT_GAP');
 await service.watchStop(session);
 assert.equal(fake.stats().stops,1);
 const before=fake.stats().reads;
 fake.authorize(false);
 await assert.rejects(service.load(),e=>e.code==='E_BOOKMARK_PERMISSION');
 assert.equal(fake.stats().reads,before);
});

// R3.5: source-bound geometry and shared semantic primitives; native acceptance is separate.
test('R3.5 shared OpenDesk buttons, 44px virtual stride and inherited dark color scheme',async()=>{
 const [app,css,shared]=await Promise.all([read(appPath),read(cssPath),read('src/ui/react/components/ui/button.tsx')]);
 assert.match(app,/import \{Button as OpenDeskButton,IconButton as OpenDeskIconButton\}/);
 assert.match(app,/const TREE_ROW_HEIGHT=44;/);
 assert.match(app,/const rowHeight=TREE_ROW_HEIGHT,virtual=rows\.length>120/);
 assert.match(app,/scroller\.scrollTop=Math\.max\(0,index\*TREE_ROW_HEIGHT\)/);
 assert.doesNotMatch(app,/index\s*\*\s*42/);
 assert.match(app,/<OpenDeskIconButton label="新建书签"/);
 assert.match(css,/\.bm-tree-row\{height:44px;/);
 assert.match(css,/@media\(pointer:coarse\)/);
 assert.doesNotMatch(css,/color-scheme:light/);
 assert.doesNotMatch(css,/\.bm-inspector-heading|\.bm-inspector-tail|\.bm-quiet-action/);
 assert.match(shared,/aria-label=\{label\}/);
});
