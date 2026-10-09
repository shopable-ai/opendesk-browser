import path from 'node:path';
import os from 'node:os';
import {HOST_NAME,WireError} from './wire.mjs';

// User-level hosts live in the selected user-data directory. Chrome 146+
// gives Chrome for Testing a separate default directory from Google Chrome.
// A dedicated acceptance profile is explicit; never infer another live profile.
export function manifestLocation(browser='chrome',userDataDir=null,{platform=process.platform,home=os.homedir()}={}) {
  if(!['chrome','cft'].includes(browser))throw new WireError('E_BROWSER','Expected chrome or cft');
  if(!['darwin','linux'].includes(platform))throw new WireError('E_PLATFORM','Native Agent supports macOS and Linux');
  if(userDataDir!==null&&(typeof userDataDir!=='string'||!path.isAbsolute(userDataDir)||path.normalize(userDataDir)!==userDataDir))
    throw new WireError('E_PROFILE_PATH','User data directory must be an explicit normalized absolute path');
  const profile=userDataDir||(platform==='darwin'
    ?path.join(home,'Library/Application Support/Google',browser==='cft'?'ChromeForTesting':'Chrome')
    :path.join(home,'.config',browser==='cft'?'google-chrome-for-testing':'google-chrome'));
  return path.join(profile,'NativeMessagingHosts',HOST_NAME+'.json');
}
