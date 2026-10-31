import {createManagedServiceProvider} from '../../../../native-agent/managed-services/provider.mjs';
import {createUsageNativeAdapter} from './native-service-adapter.mjs';

// Opt-in local process registration. This function neither connects a device
// nor reads upstream credentials. An old Host fails before the handler runs.
export async function startUsageNativeConnection({server,store,providerFactory=createManagedServiceProvider}={}){
  const handler=createUsageNativeAdapter({server,store});
  let provider;
  try{
    provider=providerFactory({descriptor:{serviceId:'ai-account-usage',
      serviceInstanceId:server.serviceBinding.serviceInstanceId,productName:'AI Account Usage',
      origin:new URL(server.url).origin,
      capabilities:['usage:manual-binding','policy:metadata-state','management:resource-open']},
      handler,onDisconnect:()=>handler.disconnectAll()});
    await provider.start();
    return provider;
  }catch(error){provider?.close();await handler.disconnectAll();throw error;}
}
