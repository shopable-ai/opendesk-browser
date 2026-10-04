# F2/K3 controller wiring

Implementation cwd: `/Users/shopme/Documents/workspace/opendesk-browser`.
This is an implementation handoff under the released F1 contract, not F3 acceptance.

`controllerMethods({storage,api,session,clock,assertHost,currentHost})` is a delegate
of `createRunAuthority`. It owns no router, connection, DB or namespace issuer.
The unique authority must provide persisted `host.namespace` and `host.principal`;
payload namespace/principal/grant/host fields are rejected. The host client may
be injected with `createRunHost({client:foundationClient})`.

Broker routes call the same named authority delegate methods:

| Route | Request payload | Response data |
| --- | --- | --- |
| commitControllerScript | `{scriptId,expectedRevision,sourceUtf8,contentHash?}` | committed `{scriptId,revision,parentRevision,contentHash,sourceUtf8}` |
| getControllerScript | `{scriptId,revision?}` | committed revision, or current committed head revision |
| startControllerRun | `{requestId,scriptId,revision,contentHash,paramsWire,target,deadlineAt}` | `{runId,state,runRevision,identity,target,revision,sourceUtf8,paramsWire,deadlineAt}` |
| controllerOperation | `{envelope}` | private ctx `{requestId,value,error?,handoff?}` |
| stopControllerRun | `{runId,requestId,expectedRunRevision?,reason?}` | durable fence `{runId,state,cancelSeq,runRevision}` |
| finishControllerRun | `{runId,requestId,status,valueWire?,error?,workerRetired}` | immutable terminal projection, result and retirement id |
| snapshotControllerRun | `{runId?}` | `{run,results,slotAvailable}` |
| retireControllerTarget | `{runId}` | `{state:'released'|'pending',releaseCount,reason?}` |

`target` is `{mode:'owned',url}` or
`{mode:'borrowed',tabId,frameId,documentId}`, with an explicit integer `frameId>=0`.
Owned creation uses the existing
fixed `ui/target-bootstrap.html?creationId=…` resource with a durable create intent;
its returned exact tab/doc is verified before navigation. Borrowed tabs are never
removed. `identity.tag === 'controller-run'` and contains script binding, never
`templateHash`. Do not send these envelopes through the legacy scraping schema.

Canonical params/results use `platform/page-port/codec.js`. Existing private
ctx/sandbox RPC retains its already implemented control/value encoding; translation
to durable foundation values occurs at the authority boundary, not a new codec.
This is an integration bridge, not completion of the frozen single-codec obligation.
The primary codec owner must expose its fixed self-contained factory for generated
page harnesses, after which the control facade consumes that sole implementation.

Fixed package resources: `scripting/sandbox/sandbox.html`,
`scripting/sandbox/sandbox.js`, `scripting/sandbox/worker-runtime.js`, and new
ISOLATED `scripting/packaged/page-session.js` from
`src/scripting/packaged/page-session.js`. No privileged dynamic evaluator is added.

Lifecycle hooks must call `loseControllerHost(registrationId,{documentGone})`,
`invalidateControllerTarget(details)`, and `recoverControllers()` in addition to
existing scraping/SDK handling. A document disappearance is a monotonic fence;
an admitted navigation is settled by its original operation with native from/to
attestation. A worker connection gap never replays dispatched effects.

SW forwards `{tabId,frameId,documentId}` at native onCommitted, `{tabId,removed:true}`
at onRemoved and `{permissionRemoved:true,origins:removed.origins}` at permission removal.
Only matching HTTP(S) origin patterns fence a controller. Removal is monotonic even
if re-granted before IDB settles. The durable original navigation request alone may
wait across document handoff; other old requests/elements remain fenced. Owned
bootstrap preparation observes native facts and never derives an active tab.

`snapshotControllerRun` authenticates the new registered host and permits namespace
reads of old durable results. It grants no new execution, stop or retirement ownership.
The initial ordinary async body receives `page` and typed `params` in the private
Worker. No TemplateRevision, entitlement, row/seal or commercial subject is involved.

RunHost also owns and exposes `artifactResources = createHostBlobRegistry({clock})`.
The UI uses that existing registry for Blob create/pin/release and the same client
for artifact and attempt routes. It does not create another registered host.

Primary-owner follow-ups at lane freeze: add the fixed `scripting/packaged/page-session`
webpack entry; expose the canonical codec's self-contained factory for generated
harness consumption; teach shared script GC to accept an exactly bound released
controller pin only after its `controller-lease` is terminal, worker-retired and
retirement-released. Existing SDK GC predicates remain separate. The controller
never relabels its lease as `sdk-operation` to bypass that check.
