const channel = new MessageChannel();
channel.port1.onmessage = () => parent.postMessage({kind: 'attacker-bound'}, '*');
channel.port1.start();
parent.frames[0].postMessage({kind: 'bind-host'}, '*', [channel.port2]);
parent.frames[0].postMessage({kind: 'result', value: 'FORGED', runId: 'forged'}, '*');
setTimeout(() => { channel.port1.close(); channel.port2.close(); parent.postMessage({kind: 'attack-sent'}, '*'); }, 100);
