// Available only when the installed-program loader injected the fixed API
// into this program's isolated world. Preview and ordinary pages get no client.
export function createPageTaskClient(){
  const client=globalThis.__opendeskPageTasksV1;
  return client&&Object.isFrozen(client)&&['request','read','restore'].every(key=>typeof client[key]==='function')?client:null;
}
