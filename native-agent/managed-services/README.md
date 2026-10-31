# Managed services Native subprotocol

This is a fixed internal transport on the existing Native Messaging Port and
private Unix socket. It is not a Browser SDK method or a sandbox API. Current
Browser, Node, the fixed Cookie consumer and the OpenDesk Go broker routing are
implemented in source. Go race checks cover the registry, exact epoch/owner,
request mapping and retirement. A cross-process test now runs the real Go Host
and Node provider/backend through Native frames and the original authenticated
private socket. Chrome Port, permission and installation authority remain
synthetic in that test; it is not live Native authorization. No installed Host,
extension, credential or watcher changes.

## Why this platform addition is needed

The existing CLI method allowlist and project-source provider cannot register a
management service, carry typed service actions or retire its grants. A tool
cannot safely discover ports or receive a process secret through its sandbox.
The missing capability is proven by the existing `protocol.js` and Go
`internal/browserbridge/wire.go` allowlists. Registration and typed transport are
generic; Cookie/account/provider decisions stay in the Cookie Editor project.
No new Chrome permission, arbitrary fetch, command runner, installer or Host.

## Independent business ownership

The business backend is the standalone Node project at
`../../examples/sidebar-tools/cookie-editor/ai-account-usage/`. Its ordinary
`serve` entry and terminal management must remain usable without the OpenDesk
desktop program. Account/provider rules, credentials, cached resources, account
bindings, synchronization policy and management UI stay in that project and the
Cookie Editor consumer. They must not be moved into or imported by the Go runtime.

The separate `/Users/shopme/Documents/workspace/opendesk` repository is the
OpenDesk desktop automation runtime. Its existing `internal/browserbridge`
module owns a generic Native Messaging/private-socket transport. Calling it the
"Native Go repository" does not mean it owns the business backend or that users
need to install Go. Native provider registration is an explicit optional connector
(`serve --native`), not a prerequisite for ordinary backend operation. Before
continuing integration, verify this separation and remove any actual mandatory
business dependency on the desktop program. Add only the smallest necessary
generic bridge behavior; do not introduce a second privileged Host or bypass the
existing authorization boundary.

## Wire v1

Both peers advertise **numeric** `managedServicesVersion: 1`: Go `hello`, Browser
`welcome`, and the original socket's `authenticated` reply. Missing/other versions
leave legacy Native features usable and services unsupported. Node registration
starts only through an explicit call to `provider.start()`.

All envelopes use `v: 1` and `protocol: "opendesk.managed-services.v1"`.

| Direction | `kind` | Additional fields |
| --- | --- | --- |
| Node → Go | `services.register` | `descriptor` |
| Go → Node | `services.registered` | `serviceId`, `serviceInstanceId`, `providerEpoch` |
| Go → Browser | `services.state` | `services`: registered descriptors, maximum 8 |
| Browser → Go | `services.request` | UUID `requestId`, `serviceId`, `providerEpoch`, `owner`, `action`, `payload` |
| Go → Node | `services.invoke` | broker `requestId`, `serviceId`, `serviceInstanceId`, `providerEpoch`, `owner`, `action`, `payload` |
| Node → Go | `services.result` | broker `requestId`, `serviceId`, `providerEpoch`, exactly one `result` / `error` |
| Go → Browser | `services.response` | original UUID `requestId`, `serviceId`, `providerEpoch`, exactly one `result` / `error` |

Descriptors contain exactly `serviceId`, `serviceInstanceId`, `productName`,
`origin`, `capabilities`; registered descriptors add `providerEpoch`. This local
version accepts exact HTTP origins on a single `.localhost` label and a nonzero
port. The service instance originates from the Node process; Go must allocate the
provider epoch. Company HTTPS/SSO/DNS validation is outside this implementation.

`owner` is exactly `{extensionId, toolId, packageHash, installEpoch}`. Installation
epochs are strings from the original Installer. The fixed SW must derive and
recheck this owner using the original sender/install authority; it must never
accept a sandbox's claim as that proof. Go must accept service requests only from
the authenticated Chrome stream, require the paired extension ID, and route them
only to the exact registered provider instance/epoch.

Go must map every Browser UUID to a fresh **`req_<positive safe integer>`** on the
provider stream, increasing monotonically within that provider epoch. Node keeps
only the largest sequence and rejects old sequences without calling business
code. Duplicate results are `OUTCOME_UNKNOWN`: the watermark does not prove that
the original call was never dispatched. IDs are not reused after a result,
timeout or admission-limit rejection.
The pending mapping and original UUID belong to Go. Never forward a Browser UUID
as a provider ID or roll the counter back while retaining the same epoch.

Actions are `connect`, `accounts`, `bind`, `unbind`, `policy`, `accept`,
`operation`, `open`, `disconnect`. Only `accounts`, `policy`, `operation` are
classified as reads. Bodies/results are objects; exact business payloads belong
to the provider. Four in-flight requests and the existing 60 KiB wire limit apply.
Errors expose a code and `NOT_DISPATCHED`, `FAILED_CONFIRMED` or `OUTCOME_UNKNOWN`.
There is no automatic replay or automatic reconnect. Reconcile a lost business
write through its original `operationId` with a separate read.

## Go integration and remaining installed verification

The existing `internal/browserbridge/managed_services.go` and
`host_services_unix.go` own strict decoding, the registry and pending map,
registration through the original private socket, numeric version negotiation
and envelope routing. The old CLI/dev/files/AI allowlists and protocols remain
unchanged. Registration conflicts fail closed;
provider/socket/Chrome retirement removes the descriptor and pending map, with
unknown results for dispatched writes. Origin and instance are immutable for an
epoch. The private socket and installation credential authenticate possession;
they do not prove a process signature or peer UID/PID.

The implemented Cookie consumer enforces fixed sender/install/Document/gesture
checks, explicit connection and account association confirmation, original
operation receipts, and internal-only opening. These protections have source and
targeted test evidence, but still need verification through the completed live
bridge. The one-use management URL is consumed only by the fixed SW after checking
the registered origin and exact allowed path; it must never be returned to the
sandbox. Cookie payload transfer is out of scope.

On 2026-10-31 the user clarified that work uses each repository's existing primary
branch. Browser is on `main` (`origin/HEAD` points to `origin/main`); OpenDesk is on
`master` (`origin/HEAD` points to `origin/master`). The different branch name is
not an authorization blocker and does not require a rename. Recheck these facts
and overlapping writes before editing. This continuation changed only the generic managed-service bridge and its
related tests in OpenDesk; it preserves the pre-existing socket-lifecycle change in `host_unix.go` and the other
parallel bridge/install/socket-recovery work.

## Targeted development checks (2026-10-31)

In the OpenDesk repository, the new Go tests are private protocol/Host seams, not
public Runtime API tests. `TestManagedHostProcessFixture` runs only when an
explicit disposable root is supplied. Compile it to a private output before the
Browser business integration test (substitute your existing Go toolchain path):

```sh
# /Users/shopme/Documents/workspace/opendesk
mkdir -p .runtime/tests/browserbridge/managed-services
go test -c ./internal/browserbridge -o .runtime/tests/browserbridge/managed-services/browserbridge.test
# /Users/shopme/Documents/workspace/opendesk-browser
OPENDESK_MANAGED_HOST_TEST_BINARY=/Users/shopme/Documents/workspace/opendesk/.runtime/tests/browserbridge/managed-services/browserbridge.test node --test examples/sidebar-tools/cookie-editor/tests/ai-account-usage/native-host-process.test.mjs
```

The Node test uses synthetic accounts/installation and temporary state, with no
upstream query or Cookie payload. It covers connect → existing resource → bind →
desired policy still unaccepted → explicit accept → one-use account/device
management session → unbind/disconnect. Connector retirement leaves the standalone
admin usable. Without the explicit binary path this process test reports SKIP,
never an implied pass. The provider also has a regression proving a write followed
by an unclassified 4xx confirmation error remains `OUTCOME_UNKNOWN`; only an
explicit handler outcome can establish a confirmed write failure.

Installed `serve --native`, matching fixed SW/tool deployment and the real
enterprise-page click chain remain `NOT_TESTED`. The currently observed
`dist/development` has no live serve owner; existing OpenDesk Host processes are
older installed artifacts. This development slice does not replace or restart
them. Company HTTPS/SSO, Cookie transport and continuous collection remain deferred.
