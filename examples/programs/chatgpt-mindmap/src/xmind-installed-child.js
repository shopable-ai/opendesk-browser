import {serveXmindFrame} from './xmind-frame-child.js';

// Entry for an approved, self-contained xmind-runtime resource. The resource
// is deliberately not declared or built while vendor redistribution is blocked.
const canvas=document.createElement('div');
canvas.style.cssText='width:100vw;height:100vh;overflow:hidden';
document.body.style.cssText='margin:0;overflow:hidden';
document.body.appendChild(canvas);
serveXmindFrame({port:OpenDeskFrame.port,identity:OpenDeskFrame.data.identity,window,canvas});
