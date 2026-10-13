// Minimal static trusted-document model. UI markup remains authoritative in
// src/ui/tool.html; this fixture only models its stable controls and events.
export class TimeNode{
  constructor(tag='div',id=''){
    this.tag=tag;this.id=id;this.children=[];this.listeners=new Map();
    this.hidden=false;this.disabled=false;this.textContent='';this.type='';
  }
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  addEventListener(name,callback){
    this.listeners.set(name,[...(this.listeners.get(name)||[]),callback]);
  }
  emit(name,isTrusted=true){
    for(const callback of this.listeners.get(name)||[])void callback({isTrusted});
  }
  querySelectorAll(selector){
    return this.children.flatMap(child=>[
      ...(selector==='button'&&child.tag==='button'?[child]:[]),
      ...child.querySelectorAll(selector)
    ]);
  }
  setAttribute(key,value){this[key]=value;}
  focus(){this.focused=true;}
  scrollIntoView(){}
}
export const TIME_CONTROL_IDS=[
  'time-review-grant-idle','time-review-revoke-idle',
  'time-review-site-current-open','time-review-site-current-approve','time-review-site-current-cancel',
  'time-review-site-all-open','time-review-site-all-approve','time-review-site-all-cancel',
  'time-review-site-all-revoke','time-review-trusted-start',
  'time-review-clear-open','time-review-clear-approve','time-review-clear-cancel',
  'time-review-minute-enable','time-review-minute-disable',
  'time-review-minute-delete-approve','time-review-minute-delete-cancel'
];
export function findTimeNode(root,id){
  if(root.id===id)return root;
  for(const child of root.children){
    const match=findTimeNode(child,id);if(match)return match;
  }
  return null;
}
export function makeTimeReviewDOM(){
  const root=new TimeNode(),section=new TimeNode('section','time-review-permission-settings');
  section.hidden=true;root.append(section);
  const create=(id,tag='button',parent=section)=>{
    const node=new TimeNode(tag,id);
    parent.append(node);return node;
  };
  const currentReview=create('time-review-site-confirm','section');currentReview.hidden=true;
  create('time-review-site-confirm-text','p',currentReview);
  const allReview=create('time-review-site-all-confirm','section');allReview.hidden=true;
  const clearReview=create('time-review-inline-clear-review','section');clearReview.hidden=true;
  const minuteReview=create('time-review-minute-delete-review','section');minuteReview.hidden=true;
  create('time-review-site-grants-status','p');
  create('time-review-site-grants-list','div');
  const inReview=id=>id.includes('site-current-approve')||id.includes('site-current-cancel')?currentReview:
    id.includes('site-all-approve')||id.includes('site-all-cancel')?allReview:
    id.includes('clear-approve')||id.includes('clear-cancel')?clearReview:
    id.includes('minute-delete-')?minuteReview:section;
  for(const id of TIME_CONTROL_IDS)create(id,'button',inReview(id));
  const doc={createElement:tag=>new TimeNode(tag),getElementById:id=>findTimeNode(root,id)};
  return {root,doc,find:id=>findTimeNode(root,id)};
}
