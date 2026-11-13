// Read-only, nonprompting preflight. Creates no event taps or input events.
// A successful permission check is NOT admission to a Chrome document.
import Foundation
import CoreGraphics
import ApplicationServices

guard CommandLine.arguments.dropFirst().isEmpty else {
    fputs("This probe has no enable, capture, replay or permission-request mode.\n", stderr)
    exit(64)
}

let chromeURL = URL(fileURLWithPath: "/Users/shopme/Applications/Google Chrome.app")
let chrome = Bundle(url: chromeURL)
let report: [String: Any] = [
    "mode": "READ_ONLY_NO_TAP_NO_POST",
    "nativeAdapterEnabled": false,
    "accessibilityTrustedForProbe": AXIsProcessTrusted(),
    "listenAccessForProbe": CGPreflightListenEventAccess(),
    "postAccessForProbe": CGPreflightPostEventAccess(),
    "permissionRequests": 0,
    "chromeBundlePath": chromeURL.path,
    "chromeDiskVersion": chrome?.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "UNKNOWN",
    "chromeBundleId": chrome?.bundleIdentifier ?? "UNKNOWN",
    "runningChromeVersion": "NOT_READ",
    "inputToDocumentBinding": "NOT_IMPLEMENTED",
    "installedPackageAndPageIdentity": "NOT_READ",
    "nativeMenuAndGesture": "NOT_TESTED"
]
let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
print(String(decoding: data, as: UTF8.self))
