// One in-flight read per tab. Background tabs stop polling; focus wakes them.
export function createLiveReader({read,render,status,visible=()=>true,delay=1000,
  schedule=setTimeout,cancel=clearTimeout,clock=Date.now,initial=null}){
  let current=initial,last=initial===null?null:clock(),enabled=true,closed=false,
    generation=0,timer=null,busy=false,queued=false,started=false;
  function announce(state,code){
    status({state,last,code});
  }
  function clear(){
    if(timer!==null){cancel(timer);timer=null;}
  }
  function arm(ms=delay){
    clear();
    if(!closed&&enabled&&visible())timer=schedule(()=>{timer=null;void tick();},ms);
  }
  async function tick(){
    if(closed||!enabled||!visible())return;
    clear();
    if(busy){queued=true;return;}
    busy=true;const epoch=generation;
    try{
      const result=await read();
      if(closed||!enabled||epoch!==generation||!visible())return;
      if(!result?.ok||typeof result.text!=='string'){
        announce('error',result?.code||'E_READ');return;
      }
      if(current!==result.text){
        // Commit the version only after successful rendering.
        render(result.text);
        current=result.text;last=clock();
      }else if(last===null)last=clock();
      announce('live');
    }catch(error){
      if(!closed&&enabled&&epoch===generation&&visible())announce('error',error?.code||'E_READ');
    }finally{
      busy=false;
      const now=queued;queued=false;
      if(!closed&&enabled&&visible())arm(now?0:delay);
    }
  }
  return {
    start(){if(closed||started)return;started=true;announce('checking');void tick();},
    wake(){if(closed||!enabled||!visible())return;void tick();},
    sleep(){generation++;queued=false;clear();if(enabled&&!closed)announce('hidden');},
    setEnabled(value){
      value=Boolean(value);if(closed||enabled===value)return;
      enabled=value;generation++;queued=false;clear();
      announce(enabled?'checking':'paused');
      if(enabled)void tick();
    },
    get enabled(){return enabled;},
    get text(){return current;},
    destroy(){closed=true;generation++;queued=false;clear();}
  };
}
