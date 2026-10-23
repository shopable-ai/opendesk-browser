// Standalone Stay Focus application artifact. This deliberately never runs
// WXT, preparePublic(), build.mjs or compiles any Browser extension entry.
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {buildStayFocusReact} from './build-stay-focus-react.mjs';
import {createSidebarToolPackage,encodeSidebarToolPackage}
  from './build-sidebar-tool.mjs';

const root=fileURLToPath(new URL('../examples/sidebar-tools/stay-focus/',import.meta.url));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function buildStandaloneStayFocus({preview=false,log=true}={}){
  await buildStayFocusReact({log:false});
  const pkg=await createSidebarToolPackage(root);
  const isV3=pkg.backgroundPolicy?.kind==='site-budget.v3'&&
    pkg.capabilities.includes('browser.siteBudget')&&
    !pkg.capabilities.includes('focus.control');
  // Migration must be verified with the real Installer transaction and
  // Chrome resource readback before a separate build becomes a published
  // upgrade. A version bump or manifest-only v3 toggle is not proof.
  const installerMigrationVerified=false; // No verified Installer transfer yet.
  if((!isV3||!installerMigrationVerified)&&!preview)
    throw new Error('E_STAY_FOCUS_RELEASE_GATE: v3 旧数据无损迁移和 Installer 事务未完成');
  const bytes=encodeSidebarToolPackage(pkg);
  const dirname=resolve(root,'dist'),name='stay-focus.opendesk-tool.json';
  await mkdir(dirname,{recursive:true});
  const output=resolve(dirname,name),temp=output+'.'+randomUUID()+'.new';
  await writeFile(temp,bytes,{flag:'wx'});
  await rename(temp,output);
  const reread=await readFile(output);
  if(sha256(reread)!==sha256(bytes))
    throw Error('E_STAY_FOCUS_PACKAGE_HASH: 独立应用包回读失败');
  const result={
    format:'opendesk.independent-app-receipt.v1',toolId:pkg.id,
    version:pkg.version,bytes:bytes.length,sha256:sha256(bytes),
    package:name,releaseReady:isV3&&installerMigrationVerified,
    browserBuildTouched:false
  };
  const receipt=resolve(dirname,'standalone-release-receipt.json');
  const receiptTemp=receipt+'.'+randomUUID()+'.new';
  await writeFile(receiptTemp,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  await rename(receiptTemp,receipt);
  if(log)console.log(JSON.stringify(result));
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  await buildStandaloneStayFocus({preview:process.argv.includes('--preview')});
