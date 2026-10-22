import json,os,pathlib,subprocess,time,signal,shutil
root=pathlib.Path('artifacts/bookmark-agent-r211-lifecycle');cfg=json.loads((root/'runtime.json').read_text());pid=cfg['pid'];parent=30890
out={'at':time.time(),'instance':cfg['instance'],'ownedBrowserPid':pid,'launcherPid':parent,'otherProcessesSignalled':False,'globalNativeConfigEdited':False}
def cmd(pid):
 return subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True).stdout.strip()
parent_cmd=cmd(parent);browser_cmd=cmd(pid)
if 'chrome-testing-keychain/scripts/launch.py' not in parent_cmd or str(root)+'/launch.json' not in parent_cmd:raise RuntimeError('Owned launcher validation failed')
if cfg['profile'] not in browser_cmd or cfg['executable'] not in browser_cmd:raise RuntimeError('Owned Chrome validation failed')
stopped=False
try:
 os.kill(parent,signal.SIGSTOP);stopped=True;out['launcherSuspendedForOfficialCleanup']=True
 r=subprocess.run(['/Users/shopme/.nvm/versions/node/v24.16.0/bin/node',str(root/'close-owned-browser.mjs')],capture_output=True,text=True,timeout=20)
 out['browserCloseExit']=r.returncode
 for _ in range(80):
  state=subprocess.run(['ps','-p',str(pid),'-o','stat='],capture_output=True,text=True).stdout.strip()
  if not state or state.startswith('Z'):break
  time.sleep(.1)
 else:raise RuntimeError('Own Chrome did not exit; preserve profile')
 out['chromeTerminalBeforeCleanup']=True;out['profilePresentForOfficialCleanup']=pathlib.Path(cfg['profile']).is_dir()
 env=os.environ.copy();env['OPENDESK_NATIVE_INSTANCE']=cfg['instance'];env['CODEX_HOME']=cfg['codexHome'];env['PATH']=cfg['codexBinDir']+os.pathsep+env['PATH']
 result=subprocess.run(['/Users/shopme/.local/bin/opendesk','browser','cleanup'],capture_output=True,text=True,env=env,timeout=45)
 out['officialCleanupExit']=result.returncode
 try:out['officialCleanup']=json.loads(result.stdout)
 except:out['officialCleanupParseError']=True
 (root/'native-cleanup-final.json').write_text(result.stdout or '{}\n')
 if result.returncode:out['cleanupError']=result.stderr[:300]
finally:
 if stopped:os.kill(parent,signal.SIGCONT);out['launcherResumed']=True
 (root/'resource-cleanup.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))
