"""Offline review of existing raw results. Does not execute products or browsers."""
from pathlib import Path
import json,hashlib,subprocess,datetime
E=Path(__file__).parent; N=E/'native-verified'; ROOT=E.parents[3]
def read(p): return json.loads(p.read_text())
def sha(b): return hashlib.sha256(b).hexdigest()
def save(name,x): (E/name).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def page(x,id): return next(p['observation'] for p in x['pages'] if p['target']['targetId']==id)
def control(x,id): return next(c for c in x['controls'] if c['id']==id)
def ui(name): return read(N/(name+'.json'))['observed']
PANEL='84DF12DC48041BF416F46EC02A6FD1FC'; STANDARD='61A8A48D3BE32E9BB21BCCDCEB9E9FE1'
ids={'page':'sample.sidebar-page-demo/0.1.0/r31-production/4d8693b967e4e5e8-521d9e32240f','controller':'sample.sidebar-controller-demo/1.0.0/r31-production/d7210dd03e38dd9d-e2797c9b7aa5','ui':'sample.page-ui-basic/0.1.0/r31-production/4205470a617ba9d7-243d6ea88111'}
programs={}
for name,p in ids.items():
 d=ROOT/'artifacts/programs'/p
 programs[name]={'directory':str(d),'files':[{'path':f.name,'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(d.iterdir()) if f.is_file()], 'sourceHash':sha((d/'program.js').read_bytes()),'draft':str(d/'program.opendesk-draft.json'),'level':'LOCAL_DEMO; not formal publish/install acceptance'}
s=read(N/'session.json');actual=read(N/'actual-loaded-source.json'); assert actual['matches'] and actual['loadedSha256']==next(f['sha256'] for f in s['package']['files'] if f['path']=='sw.js')
build=read(E/'build-final-output.json');assert build['report']['packageHash']==s['package']['packageHash']
mismatches=[r['path'] for r in build['sourceInputs'] if not (ROOT/r['path']).exists() or sha((ROOT/r['path']).read_bytes())!=r['sha256']]
assert not mismatches,mismatches
assert all(sha((Path(s['extension'])/r['path']).read_bytes())==r['sha256'] for r in s['package']['files'])
checks=[]
def check(id,evidence,result,level='NATIVE_SCOPED_PASS'):
 checks.append({'behavior':id,'status':'PASS','level':level,'evidence':evidence,'result':result})
controllers=[]
for label,count in [('controller-first-pass',1),('controller-repeat-pass',2)]:
 x=read(N/(label+'.json'));db=x['native']['stores']['opendesk-browser']
 runs=[r for r in db['runs'] if r.get('hostInstanceId')=='7792cda4-9994-47f2-b714-f063de41c3d2' and r['state']=='completed'];run=max(runs,key=lambda r:r['createdAt'])
 results=[r for r in db['results'] if r['runId']==run['runId']];assert len(results)==1
 result=results[0];value=dict((k,v['value']) for k,v in result['outcome']['valueWire']['value'])
 assert value=={'counter':f'提交次数：{count}','keyword':'OpenDesk','result':'结果：OpenDesk','status':'CONTROLLER_DEMO_OK'}
 assert result['revision']['revision']==1 and result['revision']['sourceHash']==programs['controller']['sourceHash'] and result['resultId']==run['resultId']
 assert run['workerRetired'] is True and run['retirementState']=='released'
 controllers.append({'evidence':label+'.json','runId':run['runId'],'resultId':result['resultId'],'resultRevision':result['revision'],'runRevision':run['runRevision'],'value':value,'workerRetired':True,'retirementState':'released','target':run['target']})
check('Controller two real searches, one commit each',['native-verified/controller-first-pass.json','native-verified/controller-repeat-pass.json'],controllers)
receipts=[]
for label in ['page-first','page-repeat']:
 r=read(N/(label+'-native-receipt.json'));assert r['receipt']['result']['ok'] and r['receipt']['result']['value']['status']=='PAGE_DEMO_OK'
 x=read(N/(label+'-pass.json'));std=page(x,STANDARD);proof=[c for c in std['controls'] if c['id']=='opendesk-multifile-page-proof'];assert len(proof)==1
 # Driver observation explicitly enumerates document.querySelectorAll('[id]'),
 # including duplicate IDs; this is a derived count, not a native receipt field.
 receipts.append({'evidence':label+'-native-receipt.json','receipt':r['receipt'],'derivedProofCount':len(proof),'countSource':'all [id] controls in matching pass.json','inputSourceHash':programs['page']['sourceHash'],'receiptSourceHash':'NOT_CAPTURED in native receipt itself'})
assert receipts[0]['receipt']['documentId']==receipts[1]['receipt']['documentId']
assert receipts[0]['receipt']['result']['nonce']!=receipts[1]['receipt']['result']['nonce']
check('Page exact receipt and one proof on repeat',['native-verified/page-first-native-receipt.json','native-verified/page-first-pass.json','native-verified/page-repeat-native-receipt.json','native-verified/page-repeat-pass.json'],receipts)
for label in ['page-old-url','page-cross-document','page-during-navigation']:
 x=read(N/(label+'-rejected.json'));status=control(page(x,PANEL),'page-preview-status')['text'];assert status.startswith('E_DOCUMENT_STALE')
 frozen=read(N/(label+'-debugger.json'));assert frozen['closed'] and not frozen['holding']
 check(label,[f'native-verified/{label}-debugger.json',f'native-verified/{label}-rejected.json'],{'status':status,'interpretation':'during-navigation: old document executed; refuse accepting success after navigation, no replay' if label=='page-during-navigation' else 'reject frozen stale target before execution'})
out=read(N/'page-out-of-scope-native-receipt.json');assert out['receipt']['result']['value']=={'status':'SKIPPED_OUT_OF_SCOPE'}
for label in ['before','after']:
 x=read(N/('page-out-of-scope-'+label+'.json'));assert x['observed']['proofCount']==0 and x['observed']['hosts']==[]
check('Page non-target produces no demo proof/hosts',['native-verified/page-out-of-scope-native-receipt.json','native-verified/page-out-of-scope-before.json','native-verified/page-out-of-scope-after.json'],'SKIPPED_OUT_OF_SCOPE; no demo proof/hosts, not a universal no-side-effect audit')
for name,file in [('main','src/main.js'),('title','src/title.js'),('view','src/view.js')]:
 x=read(N/('ui-source-'+name+'.json'))['observed'];assert x['readonly'] and x['selected']==file
 assert sha(x['source'].encode())==sha((ROOT/'examples/programs/page-ui-basic'/file).read_bytes())
 assert sha(x['executionSource'].encode())==programs['ui']['sourceHash']
check('UI three readonly snapshots retain full executable',['native-verified/ui-source-main.json','native-verified/ui-source-title.json','native-verified/ui-source-view.json'],{'executionSourceHash':programs['ui']['sourceHash']})
for program,names,directory in [('page',['fixture','main','proof'],'sidebar-page-demo'),('controller',['main','params','search'],'sidebar-controller-demo')]:
 for name in names:
  x=read(E/'native-final'/(program+'-source-'+name+'.json'))['observed'];file='src/'+name+'.js'
  assert x['readonly'] and x['selected']==file and sha(x['source'].encode())==sha((ROOT/'examples/programs'/directory/file).read_bytes())
  assert sha(x['executionSource'].encode())==programs[program]['sourceHash']
 check(program+' three source snapshots presentation reuse',['native-final/'+program+'-source-'+name+'.json' for name in names],{'executionSourceHash':programs[program]['sourceHash'],'scope':'readonly display content only; old cached SW execution not accepted'},'SOURCE_PRESENTATION_REUSE')
for label in ['page-first-pass','page-repeat-pass']:
 inputs=page(read(N/(label+'.json')),PANEL).get('inputs',[])
 clicks=[i for i in inputs if i.get('id')=='page-preview-run' and i.get('type')=='click' and i.get('isTrusted')]
 assert clicks and sha(clicks[-1]['executionSourceUtf8'].encode())==programs['page']['sourceHash']
resources=read(N/'ui-resources.json');assert resources['hostCount']==2
panel=next(h for h in resources['observation']['hosts'] if h['id'].endswith('.panel'))
assert panel['panelCSS']['width']=='360px' and panel['images'][0]['complete'] and panel['images'][0]['naturalWidth']==4 and panel['images'][0]['naturalHeight']==4
png=panel['images'][0]['resourceSha256'];assert png=='5352d8f9267f19825076496fbb14bedad3385180480e6b4540919573c6308d2d'
config=read(ROOT/'examples/programs/page-ui-basic/assets/config.json');assert panel['title']==config['title'] and panel['hint']==config['hint']
check('UI DOM/JSON/computed CSS/PNG',['native-verified/ui-open-native-receipt.json','native-verified/ui-resources.json'],{'coreHosts':2,'computedWidth':'360px','PNG':{'complete':True,'width':4,'height':4,'sha256':png},'JSONTitle':panel['title'],'JSONHint':panel['hint'],'UI_OPEN':'initialization only'})
for label,want in [('ui-valid','OpenDesk UI'),('ui-enter','Enter path'),('ui-burst-result','Burst once')]:
 x=ui(label);p=x['panels'][-1];assert p['status']=='success' and not p['disabled']
 assert json.loads(p['result'])=={'pageTitle':'R3 点击时读取当前标题','input':want}
 check(label,['native-verified/'+label+'.json'],{'output':json.loads(p['result']),'events':'trusted original input; Enter uses existing program run.click() internally','business':'local DOM/title/managed 120ms callback only'})
burst=read(N/'ui-burst-native-attempts.json')['attempts'];assert len(burst)==3 and not burst[0]['before']['disabled'] and all(r['before']['disabled'] for r in burst[1:])
assert len(ui('ui-burst-result')['mutations'])-len(ui('ui-enter')['mutations'])==2
check('busy repeated clicks',['native-verified/ui-burst-native-attempts.json','native-verified/ui-burst-result.json'],{'nativeAttempts':3,'observedBusyToSuccessCycles':1,'independentHandlerCounter':'NOT_CAPTURED','singleScheduledTimer':'COMPONENT_PASS in page-ui-basic.test.mjs'})
prior=ui('ui-burst-result')['panels'][-1]['result']
for label in ['ui-empty','ui-whitespace']:
 p=ui(label)['panels'][-1];assert p['status']=='error' and p['focused'] and p['result']==prior
 check(label,['native-verified/'+label+'.json'],'error + focus; previous result retained, no new success; no timer scheduled is component evidence')
core=lambda x:[h for h in x['hosts'] if h in ['sample.page-ui-basic.panel','sample.page-ui-basic.launcher']]
for label,n in [('ui-closed-after-deadline',1),('ui-reopened',2),('ui-exited-after-deadline',0),('ui-replaced-correct-panel-after-deadline',2)]:
 x=ui(label);assert len(core(x))==n
 for p in x['panels'][:-1] if n==2 else x['panels']:assert not p['connected']
 check(label,['native-verified/'+label+'.json'],{'coreHostCount':n,'nativeScope':'detached old pending panel did not receive late result; not all listener/timer resource counts','timerAndListenerRelease':'COMPONENT_PASS for managed panel'})
assert read(N/'ui-after-navigation.json')['observed']['hosts']==[]
check('UI navigation',['native-verified/ui-navigation-reload.json','native-verified/ui-after-navigation.json'],'new document has no UI; native host observation plus component pagehide managed cleanup, BFCache not covered')
frozen=read(N/'ui-real-sender-and-receipt.json');real=next(e['observed'] for e in frozen['events'] if e.get('kind')=='real-sender');native=next(e['observed'] for e in frozen['events'] if e.get('kind')=='native-execute-reply')
assert sha(real['message']['payload']['sourceUtf8'].encode())==programs['ui']['sourceHash'] and native['result']['value']['status']=='UI_OPEN'
assert real['message']['payload']['target']['documentId']==native['documentId'] and real['sender']['id']==s['extensionId']
cs=read(N/'controller-real-sender-active.json')['events'];assert len(cs)==1 and sha(cs[0]['message']['payload']['source']['sourceUtf8'].encode())==programs['controller']['sourceHash']
assert all(not read(N/'handoff-visible.json')['native']['stores']['opendesk-browser'][k] for k in ['scriptHeads','scriptRevisions'])
check('actual sender and UI completed receipt',['native-verified/ui-real-sender-and-receipt.json','native-verified/controller-real-sender-active.json'],{'UI':{'sender':real['sender'],'target':real['message']['payload']['target'],'nativeReceipt':native},'Controller':{'sender':cs[0]['sender'],'supplementRunStatus':'E_TIMEOUT; overlay/precondition failure, no successful controller-result promotion','successfulRunBinding':'first/repeat actual RunHost registration and result identities above'}})
final={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidate':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'baseMainInitially':'0fd383ec69a136ed81b0ff46fd007537384684b6','mergedMain':'996df38fd63f49630f2c8cad4c552b5f82462124','package':s['package'],'actualLoadedSW':actual,'programs':programs,'buildSourceInputs':build['sourceInputs'],'sourceDriftAfterBuild':mismatches,'additionalInputs':[{'path':str(f.relative_to(ROOT)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in [ROOT/'examples/tasks/demo-form.html',ROOT/'tests/environment/page-ui-basic.test.mjs',ROOT/'tests/environment/page-script-preview.test.mjs',ROOT/'tests/framework/program-native-acceptance.mjs']],'SIDEPANEL':next(c for c in read(N/'handoff-visible.json')['native']['contexts'] if c['contextType']=='SIDE_PANEL'),'actualSenderUI':real['sender'],'actualUITarget':real['message']['payload']['target'],'actualUIReceipt':native,'ControllerResults':controllers,'save':'NOT_INVOLVED; zero scriptHeads/scriptRevisions, no Save/native ack','uiV8Script':'NOT_CAPTURED; three Debugger observers found no original script metadata; no extra package PASS inferred','closure':'only enumerated local Demo behaviors; no F3/ZIP/603+19/B05/overall closure'}
save('source-binding-final.json',final)
save('logic-review-final.json',{'status':'PASS_SCOPED','method':'offline raw evidence review, not new product execution','checks':checks,'notProven':['native independent callback count','native total timer/listener release counters','UI original V8 script bytes','all DOM/storage no-write on non-target page','BFCache/offline/layout/20 toggles','formal publish/install/F3/ZIP'],'proofCountDerivation':'program-native-acceptance.mjs enumerates all [id], including duplicates; two snapshots have one proof each','historicalCacheMismatch':'native-final matches=false remains unaccepted; native-verified does not retroactively change it'})
print(json.dumps({'status':'PASS_SCOPED','sourceDrift':mismatches,'checks':len(checks),'candidate':final['candidate'],'packageHash':s['package']['packageHash']},ensure_ascii=False))
