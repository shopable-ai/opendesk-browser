export const TIME_REVIEW_ID='time-review';
export const TIME_REVIEW_PROTOCOL='opendesk.time-review.v1';
export const TIME_REVIEW_CAPABILITY='time.review';
export const TIME_REVIEW_ALARM='opendesk.time-review.heartbeat.v1';
export const TIME_REVIEW_SESSION='opendesk.time-review.session.v1';
export const TIME_REVIEW_OPERATIONS=Object.freeze(['time.status','time.start','time.pause','time.revoke','time.settings','time.clear','time.export']);
export async function timeReviewPackageHash(tool){
  const bytes=new TextEncoder().encode(JSON.stringify(['format','id','version','title','description','capabilities','html','css','js'].map(key=>tool[key])));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
