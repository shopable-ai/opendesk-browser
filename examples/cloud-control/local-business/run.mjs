// Launch the business fixture against an existing, explicitly authorized Provider.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {openLocalBusiness} from './server.mjs';
const configFile=process.argv[2];
if(!configFile)throw Error('Usage: node examples/cloud-control/local-business/run.mjs /absolute/private-config.json');
const config=JSON.parse(await readFile(resolve(configFile),'utf8'));
const require=createRequire(new URL('../../../scripts/cloud-control/package.json',import.meta.url));
const {Pool}=require('pg');
const databaseUrl=process.env.CLOUD_CONTROL_DATABASE_URL;
if(!databaseUrl)throw Error('CLOUD_CONTROL_DATABASE_URL required');
const pool=new Pool({connectionString:databaseUrl,max:4,connectionTimeoutMillis:5000});
pool.on('error',()=>console.error('Business database unavailable; requests fail closed'));
let app;
try{app=await openLocalBusiness({...config,pool,providerCa:await readFile(resolve(config.providerCaFile))});}
catch(error){await pool.end();throw error;}
console.log(JSON.stringify({portalUrl:app.portalUrl,recordsUrl:app.recordsUrl,businessId:app.businessId,environment:'local-test-only'}));
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{if(stopping)return;stopping=true;void app.close().then(()=>pool.end()).then(()=>process.exit(0));});
