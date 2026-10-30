// First-party, narrowly scoped video playback-rate capability.
// Never expose arbitrary page JS, tab IDs, URLs, or DOM data to the sandbox.
export const VIDEO_SPEED_ID='video-speed-controller';
export const VIDEO_SPEED_CAPABILITY='page.videoSpeed';
export const VIDEO_SPEED_OPERATIONS=Object.freeze(['videoSpeed.status','videoSpeed.set']);
export const VIDEO_SPEED_MIN=0.25;
export const VIDEO_SPEED_MAX=4;
export function validVideoSpeed(value) {
  return typeof value==='number'&&Number.isFinite(value)&&
    value>=VIDEO_SPEED_MIN&&value<=VIDEO_SPEED_MAX&&
    Math.round(value*100)/100===value;
}
