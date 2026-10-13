// One Service Worker owns native socket. Notifications never carry work.
export function createCloudConnection({service,api,Socket=globalThis.WebSocket,clock={now:()=>Date.now()},random=Math.random}){
  let socket,timer,heartbeat,generation=0,attempt=0,lastPong=0,connecting=false,ticking;
  const alarm='opendesk.cloud.recover.v1';
  function stop(){generation++;clearTimeout(timer);clearInterval(heartbeat);socket?.close();socket=null;connecting=false;ticking=null;service.connection('offline');}
  function retry(epoch){if(epoch!==generation)return;generation++;clearInterval(heartbeat);socket=null;connecting=false;ticking=null;service.connection('backoff');timer=setTimeout(()=>start(),Math.min(60000,1000*2**Math.min(attempt++,6))*(0.8+random()*0.4));}
  async function tick(epoch,ws){
    const current=()=>epoch===generation&&socket===ws;
    if(!current())return;if(ticking?.epoch===epoch)return ticking.promise;
    const entry={epoch,promise:null};entry.promise=service.reconcile({isCurrent:current}).then(()=>{if(current())service.setReconciled(true);}).finally(()=>{if(ticking===entry)ticking=null;});ticking=entry;return entry.promise;
  }
  async function start(){
    if(socket||connecting)return;connecting=true;clearTimeout(timer);const epoch=++generation;
    try{
      await service.retryRevocation?.();if(epoch!==generation)return;
      let c=await service.read();if(epoch!==generation)return;if(!c?.enabled){connecting=false;return;}
      service.connection('connecting');const fresh=service.captureAuthentication?.()??(()=>true),currentAuth=()=>epoch===generation&&fresh();
      const auth=await service.post(c,'auth',{}, {isCurrent:currentAuth});if(!currentAuth()){if(epoch===generation)retry(epoch);return;}
      if(auth.providerId!==c.providerId||auth.expiresAt<=clock.now())throw Error('Provider connection identity differs');
      if(c.pairingId&&(auth.pairingId!==c.pairingId||auth.pairingGeneration!==c.pairingGeneration))throw Error('Provider pairing identity differs');
      if(service.adoptPairing)c=await service.adoptPairing(c,auth,{isCurrent:currentAuth});if(!currentAuth()){if(epoch===generation)retry(epoch);return;}
      const ws=socket=new Socket(c.url.replace(/^http/,'ws')+'/v1/events');
      let authenticated=false;
      const stale=()=>epoch!==generation||socket!==ws;
      const authTimeout=setTimeout(()=>{if(!stale())ws.close();},5000);
      ws.onopen=()=>{if(!stale())ws.send(JSON.stringify({type:'authenticate',ticket:auth.ticket}));};
      ws.onmessage=async event=>{if(stale())return;try{const m=JSON.parse(event.data);
        if(m.type==='authenticated'&&!authenticated&&m.providerId===c.providerId&&(!c.pairingId||m.executorId===c.executorId&&m.pairingId===c.pairingId&&m.pairingGeneration===c.pairingGeneration)){
          authenticated=true;
          clearTimeout(authTimeout);attempt=0;lastPong=clock.now();connecting=false;service.connection('authenticated');
          await service.post(c,'capabilities',{grantId:c.grantId,tasks:c.tasks.map(t=>({taskId:t.taskId,manifestHash:t.manifestHash,sourceHash:t.contentHash}))});if(stale())return;
          await tick(epoch,ws);if(stale())return;
          heartbeat=setInterval(()=>{if(stale())return;if(clock.now()-lastPong>45000){ws.close();return;}ws.send(JSON.stringify({type:'ping'}));tick(epoch,ws).catch(()=>ws.close());},20000);
        }else if(authenticated&&m.type==='pong')lastPong=clock.now();else if(authenticated&&m.type==='notify')tick(epoch,ws).catch(()=>ws.close());
      }catch{ws.close();}};
      ws.onerror=()=>{if(!stale())ws.close();};ws.onclose=()=>{clearTimeout(authTimeout);if(!stale())retry(epoch);};
    }catch{retry(epoch);}
  }
  service.attachConnection({start:()=>{void start();},stop});
  api.alarms?.onAlarm.addListener(a=>{if(a.name===alarm)void start();});
  api.alarms?.create(alarm,{periodInMinutes:0.5});void start();
  return {start,stop};
}
