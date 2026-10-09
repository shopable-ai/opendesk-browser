import subprocess,tempfile,pathlib,tarfile,io,json,datetime,os
root=pathlib.Path.cwd();e=root/'docs/framework/evidence/sidebar-tools-r1-mac-01a11fa4/continuation-current-20261010/final-current-main';e.mkdir(exist_ok=True);sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();snapshot=pathlib.Path(tempfile.mkdtemp(prefix='opendesk-sidebar-e3ed-01a11fa4-'));data=subprocess.check_output(['git','archive',sha]);tarfile.open(fileobj=io.BytesIO(data)).extractall(snapshot,filter='data');record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':sha,'snapshot':str(snapshot),'status':'IN_PROGRESS','sharedDist':'preserved','steps':[]};(e/'start.json').write_text(json.dumps(record,indent=2)+'\n');
steps=[('npm-ci',['npm','ci','--ignore-scripts']),('check',['npm','run','check']),('build',['npm','run','build']),('build-dev',['npm','run','build:dev']),('verify',['npm','run','verify']),('tool-pack',['npm','run','build:sidebar-tool','--','examples/sidebar-tools/quick-notes'])]
for name,args in steps:
 with (e/(name+'.log')).open('w') as output:r=subprocess.run(args,cwd=snapshot,stdout=output,stderr=subprocess.STDOUT)
 record['steps'].append({'name':name,'exitCode':r.returncode,'log':name+'.log'});(e/'engineering.json').write_text(json.dumps(record,indent=2)+'\n');print(name,r.returncode,flush=True)
 if r.returncode:record['status']='FAILED';break
else:record['status']='CI_PASS'
record['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();(e/'engineering.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({'snapshot':str(snapshot),'sourceCommit':sha,'status':record['status']}),flush=True)
