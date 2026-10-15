// OpenDesk AdBlock R1.2 original conservative offline domain snapshot (2026-10-15).
// Reviewed first-party source; no live subscription or downloaded executable rules.
// Domain names are data, not executable instructions. See README.zh-CN.md.
export const ADBLOCK_RULE_VERSION='2026-10-15.1';
export const ADBLOCK_AD_DOMAINS=Object.freeze([
  '2mdn.net','3lift.com','adbutler.com','adform.net','adgrx.com','adition.com',
  'adnxs.com','adroll.com','adsrvr.org','adtechus.com','advertising.com',
  'amazon-adsystem.com','appnexus.com','bidswitch.net','casalemedia.com',
  'contextweb.com','criteo.com','criteo.net','doubleclick.net','flashtalking.com',
  'googleadservices.com','googlesyndication.com','googletagservices.com',
  'gumgum.com','indexexchange.com','innovid.com','iponweb.net','lijit.com',
  'media.net','nativo.net','onetag.com','openx.net','outbrain.com',
  'pubmatic.com','revcontent.com','rubiconproject.com','serving-sys.com',
  'smartadserver.com','sovrn.com','spotxchange.com','taboola.com','teads.tv',
  'thetradedesk.com','triplelift.com','yieldmo.com','zedo.com','zemanta.com'
]);
export const ADBLOCK_TRACKER_DOMAINS=Object.freeze([
  'agkn.com','adsymptotic.com','bluekai.com','bounceexchange.com',
  'crwdcntrl.net','demdex.net','everesttech.net','exelator.com','eyeota.net',
  'imrworldwide.com','krxd.net','mathtag.com','moatads.com','mookie1.com',
  'omtrdc.net','quantserve.com','rfihub.com','rlcdn.com','scorecardresearch.com',
  'tapad.com'
]);
export const ADBLOCK_REQUEST_DOMAINS=Object.freeze([
  ...new Set([...ADBLOCK_AD_DOMAINS,...ADBLOCK_TRACKER_DOMAINS])
].sort());
