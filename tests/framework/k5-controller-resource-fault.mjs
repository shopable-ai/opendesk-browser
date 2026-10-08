import assert from 'node:assert/strict';

// Block only the registered SDK URL in this owned target's native network
// inspector. No product callback, sender or reply is replaced.
export async function armScriptResourceFailure(client,url) {
  assert.equal(new URL(url).protocol,'chrome-extension:');
  assert.equal(new URL(url).pathname,'/framework/sdk-main.js');
  const method='Network.setBlockedURLs',params={urls:[url]},reply=await client.send(method,params);
  return {snapshot:()=>({url,method,params,reply}),
    async dispose(){if(client.isOpen)await client.send(method,{urls:[]});}};
}
