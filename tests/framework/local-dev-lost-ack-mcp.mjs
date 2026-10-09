// Acceptance fault at the REAL authenticated socket boundary. This fixture
// drops one response channel; it never fabricates a browser ACK or result.
import net from 'node:net';
import {loadInstall} from '../../native-agent/install.mjs';
import {requestAgent} from '../../native-agent/cli.mjs';
import {LineDecoder,writeLine,requestShape} from '../../native-agent/wire.mjs';
import {LocalDevSession} from '../../native-agent/local-dev/session.mjs';
import {serveMcp} from '../../native-agent/local-dev/mcp.mjs';

let dropped=false;
async function request(method,params,requestId){
  if(method!=='run.start'||dropped)return requestAgent(method,params,requestId);
  dropped=true;
  const installation=loadInstall(),envelope=requestShape({v:1,kind:'request',requestId,method,params});
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection(installation.socketPath),decoder=new LineDecoder();let sent=false,finished=false;
    const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);socket.end();reject(error);};
    const failure=()=>Object.assign(new Error(sent?'Acceptance closed the original response socket after dispatch':'Native socket was not ready'),{code:sent?'E_EFFECT_UNKNOWN':'E_NATIVE_NOT_READY',...(sent?{outcome:'OUTCOME_UNKNOWN'}:{})});
    const timer=setTimeout(()=>finish(failure()),4000);
    socket.on('connect',()=>writeLine(socket,{v:1,kind:'auth',credential:installation.clientCredential}));
    socket.on('data',chunk=>{
      try{for(const message of decoder.push(chunk))if(!sent&&message.kind==='authenticated'&&message.browserReady){
        writeLine(socket,envelope);sent=true;
        process.stderr.write('FAULT_NATIVE_DISPATCH '+requestId+'\n');
        // FIN follows the actual request bytes. Native Host intentionally keeps
        // this request pending for the original Host ACK after the caller exits.
        finish(failure());
      }}catch(error){finish(error);}
    });
    socket.on('error',()=>finish(failure()));socket.on('close',()=>finish(failure()));
  });
}
const session=new LocalDevSession({allowedPaths:[process.argv[2]],request});
serveMcp({session});
