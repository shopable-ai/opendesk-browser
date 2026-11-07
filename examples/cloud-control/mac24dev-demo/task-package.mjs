import {readFile} from 'node:fs/promises';
import {verifyTaskPackage} from '../../../src/platform/tasks/contract.js';

export const defaultTaskPackage = new URL('../../tasks/form-fill.v1.opendesk-task.json',import.meta.url);
const pins = [
  ['1.0.0','57598844f11f75d7566c5adeab283a3aaed0614d151590a6f34124e7abf3632a',
    '1f72cf17aa04e8a8597ef43e554ae5507f9da58b73e46d731373cd318f6dcf63'],
  ['1.0.1','8a39edc5ba519869ac5c74132b46830727d3ef8a8c2e4695bb2a0a995e1523c7',
    '9e74a9e089dda18fadc495e9c90b6851ad686eb20b40159d36547d5326c56153'],
  ['1.0.2','121561a42069c201658511e3dc8227e962c671d5149d3c50731f4fea5e99b05c',
    '9e74a9e089dda18fadc495e9c90b6851ad686eb20b40159d36547d5326c56153'],
];

// Only these reviewed, immutable candidates can become business bindings.
export async function readFixedDemoTaskPackage(file=defaultTaskPackage){
  const pkg=await verifyTaskPackage(JSON.parse(await readFile(file,'utf8')));
  const m=pkg.manifest;
  if(m.taskId!=='sample.form-fill'||!pins.some(([version,manifestHash,sourceHash])=>
    m.version===version&&pkg.manifestHash===manifestHash&&m.program.sourceHash===sourceHash))
    throw Error('FIXED_DEMO_PACKAGE_REQUIRED');
  return pkg;
}

export function taskPin(pkg){
  return {taskId:pkg.manifest.taskId,version:pkg.manifest.version,
    manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash};
}
