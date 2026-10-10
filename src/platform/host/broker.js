import {createStorage} from '../storage/index.js';
import {createSessionTyped} from '../storage/session.js';
import {createDownloadService} from '../downloads/index.js';
import {createRunAuthority} from './authority.js';
import {createSdkBroker} from './sdk-broker.js';
import {createPageScriptPreview} from '../../scripting/user-scripts/preview.js';
import {createDependencyManager} from '../../scripting/user-scripts/dependency-manager.js';
import {createInstalledPagePrograms} from '../../scripting/user-scripts/installed-programs.js';
import {createTabsService} from '../chrome/tabs.js';
import {SDK_FILES} from '../../framework/sdk/registry.js';
import {PROTOCOL, FoundationError, invariant, newId, canonical} from '../protocol.js';
import {httpUrl, isToolSender, resolveToolSender} from '../../environment.js';
import {bytesToBase64} from '../page-port/codec.js';
import {BUDGETS} from '../protocol.js';
import {INCLUDE_DORMANT_TEMPLATE_RUNTIME} from '../template-runtime-contract.js';

const templateOperations = new Set(['claimRun','snapshotRun','prepareCommand','dispatchCommand','stopRun','abandonUnknown','finishRun',
  'createTarget','reconcileTargetCreation','bindTarget','retireTarget','ackPageFrame','ackSourceFrame','openSourceContext',
  'startSourceSelection','cancelSourceSelection','releaseSourceContext','previewSource','saveTemplate','listTemplates',
  'getTemplateRevision','renameTemplate','beginPage','stagePageBatch','sealPage','readRecords','openReaderPin','releaseReaderPin',
  'prepareExport','retryExport','abandonExport','getEntitlementSnapshot','entitlementStatus','installEntitlement','revokeEntitlement','deleteRun']);

// Explicit code-owned route names; payload fields can never select a method.
// Preserve late method lookup and its receiver, as in the original wrappers.
export function createMethodRoutes(service, names) {
  return Object.fromEntries(names.map(name => [name, (payload, sender) => service[name](payload, sender)]));
}

export function createSdkRequestHandler({sdk,authority}) {
  return async (payload,sender) => {
    try { return await sdk.request(payload,sender); }
    catch (error) {
      if (error?.code === 'E_EFFECT_UNKNOWN') {
        try {
          // Only the existing authority interprets persisted SDK identities.
          // This lookup never admits a request or repeats its effect.
          const reference = await authority.lookupSdkInvocation(payload,sender);
          if (reference) error.invocation = reference.invocation;
        } catch { /* Preserve the original failure if reference lookup is unavailable. */ }
      }
      throw error;
    }
  };
}

// Shared by the formal tool route and its deterministic component regressions.
export function createSdkInstaller({authority,api}) {
  return async (p,s) => {
    const grant = await authority.grantSdk(p,s);
    const driver = createTabsService({api,authorize:() => authority.authorizeSdkInjection(p,s,grant.grantIncarnation)});
    const target = {tabId:p.tabId,documentIds:[p.documentId]};
    try {
      await driver.injectFixed({target,file:SDK_FILES.relay,world:'ISOLATED'});
      await driver.injectFixed({target,file:SDK_FILES.main,world:'MAIN'});
      return {...grant,installed:true,files:[SDK_FILES.relay,SDK_FILES.main]};
    } catch (error) {
      // A newer approval may have replaced this grant while native injection
      // was pending. Retire only the failed installation's incarnation.
      await authority.revokeSdkGrants({tabId:p.tabId,frameId:p.frameId,documentId:p.documentId,
        grantIncarnation:grant.grantIncarnation,reason:'installation-failed'});
      throw error;
    }
  };
}

async function disconnectPersistedHost({api, authority, consumer, downloads}, registrationId, documentId) {
  const contexts = await api.runtime.getContexts({documentIds:[documentId]});
  const documentGone = contexts.length === 0;
  await authority.loseHost(registrationId,{documentGone});
  if (documentGone) {
    await consumer?.invalidateHost(registrationId);
    await consumer?.reconcileRetirements();
    await downloads?.reconcileHostResources();
  }
  return documentGone;
}

async function observePersistedHost({api}, documentId) {
  try { return (await api.runtime.getContexts({documentIds:[documentId]})).length ? 'live' : 'missing'; }
  catch { return 'unknown'; }
}

async function recoverPersistedHosts({api, storage, session, authority, consumer}) {
  if (typeof api.runtime.getContexts !== 'function') return [];
  const hosts = await storage.transaction(['commandJournal'], 'readonly', async tx => (await tx.all('commandJournal'))
    .filter(row => row?.tag === 'host' && row.active && row.browserSessionIncarnation === session));
  const results = [];
  for (const host of hosts) {
    const state = await observePersistedHost({api}, host.hostDocumentId);
    if (state === 'missing') {
      try {
        const gone = await disconnectPersistedHost({api, authority, consumer}, host.registrationId, host.hostDocumentId);
        results.push({registrationId:host.registrationId,state:gone ? 'retired' : 'live'});
      } catch { results.push({registrationId:host.registrationId,state:'unknown'}); }
    } else results.push({registrationId:host.registrationId,state});
  }
  return results;
}

export async function recoverHostTab({api, storage, session, authority, consumer, downloads}, tabId) {
  if (!Number.isSafeInteger(tabId) || typeof api.runtime.getContexts !== 'function') return [];
  const hosts = await storage.transaction(['commandJournal'], 'readonly', async tx => (await tx.all('commandJournal'))
    .filter(row => row?.tag === 'host' && row.active && row.hostTabId === tabId && row.browserSessionIncarnation === session));
  const results = [];
  for (const host of hosts) {
    const state = await observePersistedHost({api}, host.hostDocumentId);
    if (state === 'live') {
      results.push({registrationId:host.registrationId,state:'live'});
      continue;
    }
    if (state === 'unknown') {
      results.push({registrationId:host.registrationId,state:'unknown'});
      continue;
    }
    const documentGone = await disconnectPersistedHost({api, authority, consumer, downloads}, host.registrationId, host.hostDocumentId);
    results.push({registrationId:host.registrationId,state:documentGone ? 'retired' : 'live'});
  }
  return results;
}

export async function createFoundationBroker({api = chrome, ports = new Map(), clock = {now:()=>Date.now()}, indexedDB = globalThis.indexedDB,
  templateConsumer} = {}) {
  // The fixed SW package must never opt back into the legacy Template consumer
  // after its storage methods were eliminated at build time.
  if (!INCLUDE_DORMANT_TEMPLATE_RUNTIME && templateConsumer !== undefined)
    throw new FoundationError('E_MODULE_NOT_INSTALLED', 'Template consumer is not packaged in Background');
  let {browserSessionIncarnation:session} = await api.storage.session.get('browserSessionIncarnation');
  if (!session) { session = newId(); await api.storage.session.set({browserSessionIncarnation:session}); }
  const storage = await createStorage({clock,indexedDB,sessionTyped:createSessionTyped({api})});
  invariant(templateConsumer === undefined || typeof templateConsumer?.attach === 'function' &&
    typeof templateConsumer.createEntitlement === 'function' && typeof templateConsumer.validatePlan === 'function',
  'E_SCHEMA','An explicit trusted consumer descriptor is required');
  const unavailable = () => {throw new FoundationError('E_MODULE_NOT_INSTALLED','The template consumer has not been registered');};
  const entitlement = templateConsumer?.createEntitlement({storage,clock});
  const validatePlan = templateConsumer?.validatePlan ?? unavailable;
  const emitToHost = async (registrationId,event) => {
    const host = await storage.transaction(['commandJournal'], 'readonly', tx => tx.get('commandJournal',`host:${registrationId}`));
    if (!host?.active || host.browserSessionIncarnation !== session) return;
    const port = ports.get(host.hostDocumentId);
    if (!port || port.registrationId !== registrationId) return;
    try { port.postMessage({protocol:PROTOCOL,registrationId,event}); } catch { /* The durable facts remain queryable. */ }
  };
  const authority = createRunAuthority({storage,api,session,entitlement,validatePlan,clock});
  const downloads = createDownloadService({storage,api,clock,assertHost:authority.assertHost});
  const sdk = createSdkBroker({authority,storage,api,clock});
  const pageDependencies = createDependencyManager({api,storage,assertHost:authority.assertHost,clock});
  const pageScriptPreview = createPageScriptPreview({api,storage,assertHost:authority.assertHost,dependencies:pageDependencies,admission:authority.pagePreviewAdmission});
  const installedPages=createInstalledPagePrograms({api,storage,assertHost:authority.assertHost,
    dependencies:pageDependencies,preview:pageScriptPreview,admission:authority.pagePreviewAdmission,session,clock});
  const requestSdk = createSdkRequestHandler({sdk,authority});
  await authority.recover();
  downloads.attach();
  await downloads.reconcilePending();
  const background = operation => Promise.resolve(operation).catch(error => console.error(`[foundation ${error.code || 'E_EFFECT_UNKNOWN'}] ${error.message}`));
  const consumer=templateConsumer?.attach({storage,api,session,authority,downloads,entitlement,emitToHost,background});
  await recoverPersistedHosts({api, storage, session, authority, consumer});
  await consumer?.reconcileRetirements();
  await installedPages.recoverExecutions();
  await installedPages.reconcile();
  const authenticate = (request,sender) => authority.assertHost(sender, request.registrationId);
  const routes = {
    ...createMethodRoutes(authority,['commitControllerScript','getControllerScript','listControllerScripts','startControllerRun','controllerOperation','stopControllerRun','finishControllerRun','snapshotControllerRun','retireControllerTarget','tombstoneControllerScript','garbageCollectControllerScript','importTaskPackage','listTaskCatalog','getTaskCandidate','verifyTaskCandidate','makeTaskAvailable','installTask','setInstalledTaskEnabled','uninstallTask','resolveInstalledTask','grantSdk','inspectSdkGrant','revokeSdkGrant','registerHost']),
    ...createMethodRoutes(pageDependencies,['importPageCandidate','getPageCandidate']),
    ...createMethodRoutes(installedPages,['listPagePrograms','verifyPageCandidate','makePageAvailable','installPageProgram','setInstalledPageEnabled']),
    ...createMethodRoutes(downloads,['prepareArtifact','prepareAttempt','retirePreparedArtifact','prepareAttempts','dispatchDownload','reconcileDownload','recordResourceRelease']),
    previewPageScript:(p,s)=>pageScriptPreview.preview(p,s),
    retirePagePreview:(p,s)=>pageScriptPreview.retire(p,s),
    inspectPageDependencies:(p,s)=>pageDependencies.inspect(p,s),
    preparePageDependencies:(p,s)=>pageDependencies.prepare(p,s),
    approvePageDependencies:(p,s)=>pageDependencies.approve(p,s),
    installSdk:createSdkInstaller({authority,api}),
    async readArtifact(p,s) {
      const {artifact,bytes} = await downloads.readArtifact(p,s);
      const blocks = [];
      for (let offset = 0; offset < bytes.length; offset += BUDGETS.maxRawFrameBytes)
        blocks.push(bytesToBase64(bytes.slice(offset,offset + BUDGETS.maxRawFrameBytes)));
      if (!blocks.length) blocks.push(bytesToBase64(new Uint8Array()));
      return {artifact,blocks};
    },
    async getGestureTicket() {
      const {foundationGestureTicketId} = await api.storage.session.get('foundationGestureTicketId');
      return {gestureTicketId:foundationGestureTicketId ?? null};
    },
    ...consumer?.routes
  };
  async function handle(message,sender) {
    invariant(message?.protocol === PROTOCOL,'E_VERSION','Unknown foundation protocol');
    // Tagged values preserve undefined across Chrome's JSON hop. Validate these
    // envelopes before legacy canonical JSON, whose domain intentionally excludes it.
    if (message.type === 'SDK_HELLO') return sdk.hello(message.payload,sender);
    if (message.type === 'SDK_REQUEST') return requestSdk(message.payload,sender);
    canonical(message.payload ?? {}, {maxDepth:['startControllerRun','controllerOperation','finishControllerRun'].includes(message.type) ? 48 : 12});
    if (message.type === 'BOOTSTRAP_READY') return consumer ? consumer.bootstrapReady(message.payload,sender) : unavailable();
    if (message.type === 'TARGET_READY') return consumer ? consumer.agentReady(message.payload,sender) : unavailable();
    if (['AGENT_READY','PAGE_DATA','PAGE_END','PAGE_EFFECT','PAGE_ERROR','SOURCE_RESULT','SOURCE_PREVIEW_DATA','SOURCE_PREVIEW_END','SOURCE_ERROR'].includes(message.type)) return consumer ? consumer.handleAgentMessage(message,sender) : unavailable();
    sender = await resolveToolSender(api, sender);
    invariant(isToolSender(api,sender),'E_OWNER','Only actual packaged tool documents may invoke foundation services');
    if (!consumer && templateOperations.has(message.type)) unavailable();
    const route = Object.hasOwn(routes, message.type) ? routes[message.type] : undefined;
    invariant(route,'E_CAPABILITY','Unknown or unavailable foundation operation');
    if (message.type !== 'registerHost') await authenticate(message,sender);
    const p = message.payload ?? {};
    if (p.identity) await storage.transaction(['runs','commandJournal'], 'readonly',tx=>authority.admitIdentity(tx,p.identity,sender,
      {ignoreRevision:['ackPageFrame'].includes(message.type),allowSettled:['ackPageFrame'].includes(message.type)}));
    return route(p,sender);
  }
  async function issueGestureTicket(tab) {
    invariant(tab && !tab.incognito && Number.isInteger(tab.id),'E_PERMISSION','Action source tab unavailable');
    const source = httpUrl(tab.url);
    const gestureTicketId = newId();
    await storage.transaction(['commandJournal'],'readwrite',tx=>tx.put('commandJournal',{tag:'gesture-ticket',gestureTicketId,
      sourceTabId:tab.id,sourceUrl:source.href,origin:source.origin,gestureAt:new Date(clock.now()).toISOString(),
      browserSessionIncarnation:session,consumed:false},`gesture:${gestureTicketId}`));
    await api.storage.session.set({foundationGestureTicketId:gestureTicketId});
    return gestureTicketId;
  }
  async function disconnectHost(registrationId,documentId) {
      await disconnectPersistedHost({api, authority, consumer, downloads}, registrationId, documentId);
  }
  const recoverHostTabForBroker = tabId => recoverHostTab({api, storage, session, authority, consumer, downloads}, tabId);
  return {handle,issueGestureTicket,disconnectHost,recoverHostTab:recoverHostTabForBroker,
    handleInstalledPageBoot:installedPages.handleBoot,reconcileInstalledPages:installedPages.reconcile,
    revokeInstalledPagePermissions:installedPages.revokePermissions,
    cleanupPagePreviewWorlds:pageScriptPreview.cleanupWorlds,authority,storage,pagePort:consumer?.pagePort,targets:consumer?.targets,downloads,entitlement,session,emitToHost,sdk};
}
