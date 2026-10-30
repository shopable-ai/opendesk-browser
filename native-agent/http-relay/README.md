# Local HTTP relay (Node 24)

Owner/scope: this directory owns the generic local Node executor and tests only.
Browser pairing UI, WebCrypto/IndexedDB channel, original Authority decisions,
Task capability `network.localRelay`, and App integration belong to the parent.
No dependencies, browser fallback, proxy, redirects, retries, or public network access.

```sh
node native-agent/http-relay/cli.mjs start --origin chrome-extension://ACTUAL_EXTENSION_ID
node native-agent/http-relay/cli.mjs status
node native-agent/http-relay/cli.mjs invite
node native-agent/http-relay/cli.mjs revoke
node native-agent/http-relay/cli.mjs stop
node --test native-agent/http-relay/tests/relay.test.mjs
```

Replace the origin with the actual 32-character `[a-p]` extension ID. Node **24.x**
is required. Start stays in the foreground. All commands accept `--state-dir PATH`;
default is `~/.opendesk-browser/http-relay`. State directories are 0700; files 0600.
An atomic, flushed state replacement precedes dispatch. A lock prevents another
writer; stale locks recover only after the recorded PID is absent. No CLI command
signals another process. A port collision fails with `EADDRINUSE`; it never takes
ownership of that listener. A changed configured origin fails closed.

## Transport and canonical encoding

Only `127.0.0.1:43122` is bound. Browser RPCs are JSON `POST /rpc`, exactly
`Content-Type: application/json`, a Content-Length, no transfer encoding, and the
exact configured Origin. Missing/`null`/sandbox/other origins fail. CORS preflight
permits only that origin, POST, and Content-Type. Every complete JSON request and
response is at most **8192 UTF-8 bytes**; there is no chunked RPC protocol.
`POST /hello` requires exactly `{v:1}` and the same JSON size/content-type/Origin
checks as `/rpc`. Legacy `GET /hello` also requires the exact extension Origin. CLI `/control` is separate,
rejects Origin headers, and authenticates with a private local control key.

`canonical(value)` recursively sorts object keys lexicographically, preserves
array order, and uses ordinary JSON string/number encoding without whitespace.
`hash(value)` is lowercase hex SHA-256 of canonical UTF-8 JSON. MAC is lowercase
hex HMAC-SHA256 of canonical unsigned JSON (remove only `mac`). Keys are raw bytes.
Random values are 32 cryptographic bytes encoded base64url without padding.

## Invitation and pairing

`invite` creates a 60-second invitation containing
`{invitationId,secret,generation,expiresAt}`, printed locally as base64url JSON.
The service receives it through a 0600 local file and deletes that file after
loading. **The invitation secret is never transmitted over HTTP**, including the
CLI control protocol. Invitations are memory-only, single-use, and lost on restart.
A valid client proof consumes the invitation; an invalid proof does not pair.

Pair requests are `{v:1,method,body}`; successful replies are
`{v:1,ok:true,body}`. Methods, in order:

1. `pair.challenge`: body `{invitationId,generation,clientId,clientNonce}`.
   Reply body is the seven-field transcript plus `serverProof`:
   `{invitationId,generation,clientId,clientNonce,sessionId,serverNonce,origin}`.
   Verify every client field and the exact origin. `serverProof` is
   HMAC(invitation secret bytes, canonical `{label:"server",transcript}`).
2. `pair.prove`: body `{sessionId,proof}` where proof uses the same invitation
   secret and label `"client"`. Reply body `{sessionId,proof}` with label `"ready"`
   and the derived long key. No durable pairing exists yet.
3. `pair.confirm`: body `{sessionId,proof}` using the long key and label
   `"confirm"`. This persists pairing. Reply body `{sessionId,generation,proof}`
   uses the long key and label `"paired"`.

Derive the long key with HKDF-SHA256: input key material is the base64url-decoded
invitation secret, salt is **raw SHA-256 bytes** of canonical transcript, info is
UTF-8 `opendesk-http-relay-v1`, output length 32 bytes. Persist the long key and
identity before confirmation so a lost confirmation can be checked with signed
status. Pairing grants a channel only, never browser/network permission.

## Authenticated RPC and restart discovery

Request: `{v:1,clientId,generation,sessionId,seq,id,method,body,mac}`.
Reply: `{v:1,clientId,generation,sessionId,seq,id,requestHash,ok,body,mac}`.
`requestHash` hashes the unsigned request. Verify the MAC **and every binding**;
unsigned errors never authenticate state. `seq` is a positive safe integer,
strictly greater than the last accepted sequence, persisted before dispatch.
Share sequence reservation/serialization across trusted UI and service worker.
Identity/operation IDs accept `/^[A-Za-z0-9._:-]{1,256}$/`; nonces remain strict
43-character base64url. No unknown envelope/operation/authority keys are accepted.

`POST /hello` with exact JSON body `{v:1}` returns unsigned `{v:1,generation,sessionId,lastSeq}`. It is only
a hint. Use POST from Chrome: its JSON request carries Origin, whereas Chrome
may omit Origin on GET; missing Origin is still rejected. Strict legacy GET
returns the same metadata. Each successful boot increments persisted generation, rotates sessionId,
retains the long key/clientId, and resets that boot's sequence to zero. After
pairing, hello returns the pairing transcript's sessionId; after restart, it
returns the new boot sessionId saved in the retained pairing. `lastSeq` is the
last accepted sequence (zero before the first authenticated call in that boot).

Authenticate discovery by signing ordinary `status {}` with the advertised
generation/session and `seq:lastSeq+1`, using the saved long key. Verify its signed
response before persisting the discovered state. Reject lower generations and
changed sessions within one generation. Within the same boot, retain the shared
sequence reservation to account for uncertain/in-flight calls. No unverified hello
can authorize a target operation. All RPC methods require the current generation
and session. There is **no resume RPC** and no automatic target replay.

Successful methods have `ok:true`; authenticated validation failures have
`ok:false,body:{code}`. Transport/auth/replay failures are unsigned HTTP 400
`{v:1,ok:false,error}`. Authenticated method replies use HTTP 200.

## Immutable operation and methods

`register.body` is exactly:

```js
{
  operationId, runId, requestId, taskId, revision, sourceHash,
  url, method, headers, userAgent, deadlineAt, leaseMs,
  authority: {
    mode, installation, namespace, principal, grantIncarnation,
    resultId, browserSessionIncarnation, appBindingHash
  }
}
```

`revision` is a nonnegative safe integer. `sourceHash` is the Task source's
lowercase 64-character SHA-256. Authority strings are nonempty and are never
truncated. `mode` is `"installedTask"` or `"draftRun"`. Installed mode requires
`installation:{version,manifestHash,installationId,generation}` from existing
`task-install-authorization-v1`, with semver **string** version (e.g. `"0.6.0"`),
lowercase SHA-256 manifestHash, nonempty installationId, and nonnegative safe
integer generation. `appBindingHash` is lowercase SHA-256 of the original run
Task delegation, or `null` for a direct Task. Drafts require `appBindingHash:null`. Draft mode requires
`installation:null` and an explicit browser dev Run authorization callback.
Installed mode requires original browser Authority and `network.localRelay`.
The relay records these bindings; it cannot validate or manufacture browser grants.
There is no `approved` flag. The browser must authorize the same full registered
operation before sending execute; channel pairing alone cannot replace that check.

- `register`: stores the complete operation immutably; returns
  `{operationId,status:"registered"}`. No HTTP target effect.
- `execute {operationId}`: persists intent, dispatches that one registered
  operation, then returns **immediately** `{operationId,status:"running"}`.
  It cannot change URL, headers, authority, or source. Never execute twice.
- `status {operationId}`: returns `{operationId,status,result?}`. Poll for terminal
  status. If the record belongs to a different generation (including after restart
  or revoke/re-pair), returns only `{operationId,status:"unknown"}` with no result.
  Prior completed history remains private internally and is never delivered through
  a new generation. `status {}` returns `{generation,paired,pid,nodeVersion}`.
- `cancel {operationId}`: destroys the active stream; returns
  `{operationId,status}`. Also cancels an unexecuted registration.
- `renew {operationId,leaseMs}`: extends a still-live lease within the original
  deadline, returns `{operationId,leaseUntil}`. If already terminal, returns
  `{operationId,status}`; an expired running lease is never revived.
- `revoke {}`: cancels operations, removes the key, increments generation, and
  returns `{generation,status:"revoked"}` signed under the just-revoked channel's
  request binding as its final acknowledgement. No further old-generation call
  is accepted; outstanding calls cannot deliver results from the revoked channel.

`deadlineAt` is absolute epoch milliseconds, initially no more than 15 seconds
away. All operations in one run share the first registered run budget and Task/
authority identity; later registration cannot extend it. `leaseMs` is 100–2000 ms.
Renew periodically (e.g. every 500 ms for a 2000 ms lease). Stop, timeout, lease
expiry and revoke destroy the Node request/socket; individual RPC disconnects do
not cancel an operation. Restart marks registered/running operations `unknown`;
they are queryable but never executable again. At most 8 running operations,
128 retained operations and 64 run identities are accepted per state directory;
capacity exhaustion fails closed rather than evicting replay evidence.

Only GET and exact origin `http://127.0.0.1:43121` are allowed, with no userinfo,
fragment, redirects, retries or fallback. Paths/queries are permitted (URL <=512
bytes). Ordinary headers such as `X-Client-Tag` are accepted. Headers are ASCII,
case-insensitively unique, <=512 characters per value and <=1024 canonical bytes
combined. Credential, host, hop-by-hop, body-framing, proxy/forwarding, Origin,
Referer, Sec-*, User-Agent, Accept-Encoding and X-OpenDesk-* headers are reserved
and rejected. `userAgent` is ASCII, <=512 characters; empty selects exactly
`OpenDesk-NativeHTTP/1.0`. Node adds `x-opendesk-run-id` and
`x-opendesk-request-id` from immutable IDs. User headers cannot override these.

## Results

Terminal status is `completed`, `cancelled`, `timeout`, `lease_expired`, `revoked`,
`unknown`, `network_error`, `early_close`, or `response_too_large`.
`completed.result` is:

```js
{ status, statusText, headers, body,
  executor: { pid, nodeVersion, sourceHash,
    localAddress, localPort, remoteAddress, remotePort } }
```

500 and redirect codes are ordinary HTTP results; redirects are not followed.
The body is a UTF-8 string, <=3072 received bytes. Returned headers are limited to
content-type, content-length, location and cache-control (<=768 canonical bytes);
credentials/cookies are omitted. Complete result JSON is <=6000 bytes so escaped
body strings also fit the signed 8192-byte envelope. Oversize streams are destroyed
and fail rather than silently truncating. Partial/aborted responses are not success.

`executor.sourceHash` identifies actual loaded executor code: SHA-256 of
`UTF8("service.mjs\0") || serviceBytes || UTF8("protocol.mjs\0") || protocolBytes`,
where each `\0` denotes one NUL byte. It is **not** the caller's Task sourceHash,
which remains in the immutable operation. Executor PID, Node version and socket
addresses come from the executing Node process and real target socket.

Tests are local Node/HTTP evidence only; browser installation/Authority/UI/native
product acceptance remains parent-owned and is not claimed by this directory.
