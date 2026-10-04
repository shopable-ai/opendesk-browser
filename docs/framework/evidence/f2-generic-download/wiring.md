# T05 generic controller artifact handoff

cwd: `/Users/shopme/Documents/workspace/opendesk-browser`.
This bounded F2 implementation is not native extension or F3 acceptance.

The same `createDownloadService` owns these methods. No new authority, database,
router, native driver, listener set or result log is introduced.

| Method | Request | Service response |
| --- | --- | --- |
| prepareArtifact | `{requestId,runId,resultId,filename,format:'typed-json'}` | `{exportJobId,artifactId,artifact,job}` |
| prepareArtifact | `{requestId,runId,resultId,filename,format:'data',data:{mime,blocks}}` | Same response; blocks are canonical Base64 strings |
| readArtifact | `{artifactId}` | `{artifact,bytes:Uint8Array}` after descriptor, chunk and SHA checks |
| prepareAttempt | `{requestId,artifactId,blobUrl}` | Existing `DownloadAttempt` directly |
| dispatchDownload | `{attemptId}` | Existing short durable dispatch ACK |
| reconcileDownload | `{attemptId}` | Existing `{attempt,receipt,job}` |
| recordResourceRelease | `{attemptId}` | Existing attempt with release acknowledgment |
| abandonExport | `{exportJobId,explicitUserAction:true}` | Existing abandonment path |

`prepareArtifact` reads `runs[runId]` with `tag:'controller-run'`, then
`results[run.resultId]` with `tag:'controller-result'`. The supplied result ID must
equal the run's result ID. State must be completed with `outcome.ok === true` and
an own `outcome.valueWire`. The canonical foundation codec validates that wire.
Namespace, principal, result ID and revision are checked against the persisted
run/result and the authority-issued current host. Completed immutable history
belongs to the stable native tool namespace/principal: a newly registered host
in a new browser session can prepare a new artifact from it without acquiring or
replaying the old run. DLGEN01/DLGEN02 impose no completed-result session-only
restriction; see dlgen-contract-inspection.json. No payload host/grant/namespace
or template fields are admitted. Active run ownership stays with the authority.
Every new export intent captures the current registration/document/session;
readArtifact, prepareAttempt, public reconcile, dispatch and release retain that
intent's strict current-host and session fences. Old-session artifacts/attempts
cannot be adopted by the new host.

Typed JSON bytes are UTF-8 `JSON.stringify({protocol:'opendesk.value.v1',runId,
resultId,valueWire}) + '\n'`. Explicit undefined, null, false, zero, negative zero
and nested undefined retain their typed representation. There is no collection
empty-policy or template-column check on this branch.

Data requires 1..64 explicit canonical Base64 blocks, each <=128 KiB and total
<=8 MiB. MIME is restricted to `application/json`,
`text/plain;charset=utf-8`, or `application/octet-stream`. Filenames are safe
basenames <=128 characters. Generic descriptors include both `bytes` and
`byteCount` for the existing shared storage accounting. They contain no
templateHash, sealWatermark or fictitious columns. The shared DownloadAttempt
schema's rowCount is zero because this branch has no template row projection;
it is not an empty-result admission decision.

Artifacts, chunks, export jobs, reader pins and request deduplication commit
atomically to the existing stores. A generic job starts `preparing` with one
artifact and no attempts. Prepare does not create an object URL or call Chrome.
The host calls readArtifact, creates the Blob through createHostBlobRegistry,
then prepares and dispatches its attempt. Dispatch/reconcile/callback/listeners,
state aggregation, terminal handling and URL release use the existing paths.
An explicit retry uses prepareAttempt with a new request ID and a fresh URL only
after the previous attempt is releasable; previous attempts stay in the same
job for late receipt audit. Explicit abandon also fences all retry history so
shared repository deletion does not strand old unknown attempts.

Main-owned integration requirements (no edits made here):

- Expose prepareArtifact and prepareAttempt plus readArtifact and
  recordResourceRelease through the existing broker/client transport.
- Convert service Uint8Array bytes to JSON-safe Base64 blocks at the Chrome
  message boundary; decode in the host before calling the existing registry.
  Reuse platform/page-port/codec Base64 helpers and the same 128 KiB/64 limits.
- The unique registration issuer must persist stable namespace and principal.
  Main completed this contract during the slice. The public registration probe
  confirms both fields; final component tests assert their presence and use
  public register/commit/start/finish/retire with no host-field or run seeding.
- Keep the same browser session/current document's actual sender and existing
  runtime id/key. No payload identity or second client registration.

Public reconcile accepts the actual broker sender as its second argument and
checks the generic job's owning registration before search and in the final
transaction. Internal native callbacks/recovery remain able to reconcile after
host revocation; they do not acquire host preparation or dispatch authority.

Tests use the public authority and repository's register/commit/start/finish/retire
to produce the durable result, a rollback/commit transaction oracle, and Chrome
callback/onCreated/onChanged/search oracles. They do not emulate a disk hash
receipt as verified. SHA is independently checked with Node crypto. Red API
absence, the first fixture failure and the cross-session regression remain in
the evidence directory. Cross-session tests register through the actual public
authority, keep the old durable run/result unchanged and exercise the shared
callback/search/release path under a new current intent. Existing
template download tests and assertions were not edited.

Download scope is frozen for Main to run the fresh whole-package check/build.
This slice does not rebuild the pending integration package. Native runner
must use the next stable original dist package and verify actual Chrome download
complete plus the physical file SHA-256. Receipts remain diskHashVerified:false;
no F3 approval is asserted by this slice.
