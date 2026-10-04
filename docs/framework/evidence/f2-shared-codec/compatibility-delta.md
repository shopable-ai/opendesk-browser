The source codec is consolidated; package/F1 hashes are not frozen.

The sole recursive value encoder and decoder now live inside the self-contained
createValueCodec factory in platform/page-port/codec.js. Control/value.js imports
that factory. The userScripts generator embeds its complete source and explicitly
instantiates the control profile with PageError, depth 12 and 65536 bytes. It does
not serialize encoder/decoder functions that capture their module/factory closure.
Generated code has no import, eval or Function/AsyncFunction constructor. The fixed
opaque Worker runtime remains the only product AsyncFunction construction domain;
its existing import of control/value.js now consumes the same factory.

Approved wire compatibility:

| Property | Foundation profile | Control profile |
| --- | --- | --- |
| Tags/payload | type/value | t/v |
| Negative zero | number, value 0, negativeZero true | negative-zero |
| Object order | Sorted keys for canonical digests | Original insertion order |
| Default bytes | 262144, UTF-8 of wire JSON | 65536, UTF-8 of wire JSON |
| Value depth | Inclusive 12; existing maxDepth option | Inclusive fixed 12 |
| Encode refusal | FoundationError E_VALUE_SERIALIZATION, stage encode | PageError E_VALUE_SERIALIZATION |
| Decode refusal | E_VALUE_SERIALIZATION, stage decode | E_RESULT_FORMAT for malformed wire; E_VALUE_SERIALIZATION for byte budget |
| Wire fields | Strict original field shapes | Original additional data field compatibility |

Undefined, null, missing keys, array holes normalized to explicit undefined,
business PageBrigeCode/error fields, finite numbers and inert own __proto__/
constructor data retain their approved behavior. Inert prototype-name data is
defined with own properties; it cannot change the decoded prototype. This preserves
the original k2-codec assertions despite the frozen protocol's shorthand prohibition
on dangerous prototype keys. Service/schema authorization restrictions are separate
and were not changed by this sidecar.

Control now shares foundation's refusal of Symbol keys, malformed UTF-16 strings
or keys, and array accessors. Both decoders inspect own descriptors before reading
wire fields, so getters are rejected without invocation. Both profiles refuse
functions, DOM/nonplain business objects, BigInt, Symbols, cycles and budget excess.
Base64/UTF-8 and outcome public APIs remain in the foundation module; their original
assertions pass. No new value-recursion implementation exists in either adapter.

Foreign-realm correction: Main's preserved original 9 FAIL came from a fixture
returning a raw VM object. Original decoders were structural across realms; the
initial consolidated inspectWire accidentally required the local Object.prototype.
That extra decode restriction was removed. Plain-object encoding restrictions stay
in place. New regressions cover both the raw foreign wire and the native Chrome
JSON-hop representation, without changing Main's depth 4–12 assertions or fixture.

Freeze/F1 difference: the factory's returned API is frozen and its serialization
intrinsics are captured at creation, before user execution. Existing frozenCopy
behavior is retained. The frozen F1 control fixture used structuredClone for results;
the frozen F1 page fixture independently embedded its own recursive encode/decode.
This new factory/profile/import graph therefore has new source hashes and does not
inherit those fixtures' package or native qualification. Captured primitive patches,
literal values, semantic refusals and depth/UTF-8 boundaries pass source tests.

Unit proof executes the actual fixed control Worker runtime over private Node
MessagePorts, a standalone factory in a fresh VM realm, and actual generated
userScripts code in VM realms. This is not a real opaque Chrome Worker or native
chrome.userScripts.execute qualification. No browser was launched, per Main's global
launcher instruction. Main must run fresh full unit globs, same-source production/
development packages and native opaque Worker/userScripts retests. Package hashes
remain unfrozen; F3=false and original603=false.
