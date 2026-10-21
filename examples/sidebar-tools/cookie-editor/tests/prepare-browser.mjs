// App CI prepares the existing source-bound preview before its browser gate.
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const project=fileURLToPath(new URL('../preview/react/',import.meta.url));
export function prepareCookieEditorBrowser({run=execFileSync}={}){
  const options={cwd:project,stdio:'inherit',timeout:10*60*1000};
  run('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],options);
  run('npm',['run','build'],options);
  run('npm',['run','check'],options);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  prepareCookieEditorBrowser();
