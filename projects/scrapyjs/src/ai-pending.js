const key='ai-pending-request';
export function createAiPending(request){
  async function read(){
    const reply=await request('storage.get',{key,withEtag:true});
    if(!reply||!Object.hasOwn(reply,'etag')||(reply.etag!==null&&typeof reply.etag!=='string'))throw Error('未决 AI 身份读取失败；禁止发送。');
    const value=reply.value;
    if(value!=null&&(value.schemaVersion!==1||typeof value.requestId!=='string'||!value.requestId.trim()||
      value.pageObservation!==undefined&&value.pageObservation!==true||
      value.dispatchState!==undefined&&(value.pageObservation!==true||!['preparing','may-have-sent'].includes(value.dispatchState))||
      Object.keys(value).some(k=>!['schemaVersion','requestId','pageObservation','dispatchState'].includes(k))))throw Error('未决 AI 身份无效；禁止发送。');
    return {value:value??null,etag:reply.etag};
  }
  async function write(value,etag){
    const reply=await request('storage.set',{key,value,ifMatch:etag});
    if(reply?.saved!==true)throw Error('未决 AI 身份写入结果未知；禁止发送或解除围栏。');
  }
  return {read,
    async claim(requestId,{pageObservation=false}={}){
      const current=await read();
      if(current.value)throw Error('已有未决 AI 请求：'+current.value.requestId);
      await write({schemaVersion:1,requestId,...pageObservation?{pageObservation:true,dispatchState:'preparing'}:{}},current.etag);
    },
    async markDispatched(requestId){
      const current=await read();
      if(current.value?.requestId!==requestId)throw Error('未决 AI 身份已变化；禁止发送。');
      if(current.value.pageObservation!==true||current.value.dispatchState!=='preparing')throw Error('原请求已进入发送状态；禁止重复发送。');
      await write({...current.value,dispatchState:'may-have-sent'},current.etag);
    },
    async clearUnsent(requestId){
      const current=await read();
      if(current.value?.requestId!==requestId)throw Error('未决 AI 身份已变化；未清除。');
      if(current.value.pageObservation!==true||current.value.dispatchState!=='preparing')throw Error('原请求可能已经发送；未清除。');
      await write(null,current.etag);
    },
    async clear(requestId){
      const current=await read();
      if(!current.value)return;
      if(current.value.requestId!==requestId)throw Error('未决 AI 身份已变化；未清除。');
      await write(null,current.etag);
    }
  };
}
