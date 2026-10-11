import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {createCloudService} from '../cloud-control/service.js';
import {createCloudConnection} from '../cloud-control/connection.js';
// Fixed packaged classic resource, loaded before the unique Authority exists.
export default defineUnlistedScript(()=>{
  globalThis.__opendeskCloudFactory=createCloudService;
  globalThis.__opendeskCloudConnection=createCloudConnection;
});
