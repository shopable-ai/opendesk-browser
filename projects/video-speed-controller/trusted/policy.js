// First-party, narrowly scoped video playback-rate capability.
// Never expose arbitrary page JS, tab IDs, URLs, or DOM data to the sandbox.
export const VIDEO_SPEED_ID='video-speed-controller';
export const VIDEO_SPEED_CAPABILITY='page.videoSpeed';
export const VIDEO_SPEED_OPERATIONS=Object.freeze(['videoSpeed.status','videoSpeed.set','videoSpeed.shortcuts.enable','videoSpeed.shortcuts.disable']);
export const VIDEO_SPEED_MIN=0.25;
export const VIDEO_SPEED_MAX=4;
export const VIDEO_SPEED_GLOBAL_PROTOCOL='opendesk.video-speed.global.v1';
export const VIDEO_SPEED_GLOBAL_STORE='opendesk.video-speed.global.v1';
export const VIDEO_SPEED_GLOBAL_OPERATIONS=Object.freeze(['videoSpeed.global.status','videoSpeed.global.configure']);
export function globalVideoSpeedState(raw,epoch,packageHash){
  if(raw===undefined)return {enabled:true,speed:1,revision:''};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
     typeof raw.enabled!=='boolean'||!validVideoSpeed(raw.speed)||
     typeof raw.revision!=='string'||typeof raw.epoch!=='string'||typeof raw.packageHash!=='string')
    throw Object.assign(new Error('全局倍速设置损坏，已停止自动应用'),{code:'E_STORAGE_CORRUPT'});
  return {enabled:raw.enabled&&raw.epoch===epoch&&raw.packageHash===packageHash,
    speed:raw.speed,revision:raw.revision};
}
export function validVideoSpeed(value) {
  return typeof value==='number'&&Number.isFinite(value)&&
    value>=VIDEO_SPEED_MIN&&value<=VIDEO_SPEED_MAX&&
    Math.round(value*100)/100===value;
}
