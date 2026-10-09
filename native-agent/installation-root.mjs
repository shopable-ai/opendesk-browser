import os from 'node:os';
import path from 'node:path';
import {WireError} from './wire.mjs';

const instancePattern=/^[a-z][a-z0-9-]{0,31}$/;
export function installationRoot({home=os.homedir(),instance=process.env.OPENDESK_NATIVE_INSTANCE}={}) {
  if(instance===undefined)return path.join(home,'.opendesk-browser','native-agent-r1');
  if(!instancePattern.test(instance))throw new WireError('E_INSTALL_INSTANCE','Native instance must be a short lowercase identifier');
  return path.join(home,'.opendesk-browser','native-agent-instances',instance);
}
// Chrome launches an installed snapshot. Its location, not its environment,
// selects the configuration and credential used by the Native Host.
export function assertInstalledRoot(root,{home=os.homedir()}={}) {
  const defaultRoot=path.join(home,'.opendesk-browser','native-agent-r1');
  if(root===defaultRoot)return;
  const parent=path.join(home,'.opendesk-browser','native-agent-instances');
  if(path.dirname(root)!==parent||!instancePattern.test(path.basename(root)))throw new WireError('E_INSTALL_INVALID');
}
