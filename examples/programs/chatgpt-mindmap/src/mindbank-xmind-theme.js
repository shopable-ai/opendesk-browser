// Direct port of shopable-station Mindbank XMind authored theme and source algorithms.
// Original: xmind-renderer-seams.ts (0dc7d948c004c0542ce5e27ff6022847727ccbba), xmind/skin.ts (2cd1cdf6956f0e2cfb9b447a1965961b076cf51c).
// TypeScript signatures removed, behavior preserved. No vendor XMind runtime copied.
const BRANCH_HUE_PALETTE = [8, 28, 48, 88, 128, 168, 208, 248, 288, 328]
const BRANCH_DEPTH_LIGHTNESS = [78, 64, 52, 42, 34, 28]
const MIN_BRANCH_LIGHTNESS = 22
const BASE_BRANCH_SATURATION = 84

export function normalizeXmindTopicTitle(title) {
  return (title || "").replace(/\u200e/g, "").trim()
}

export function buildXmindNodeKey(path) {
  return path.join("/")
}

export function parseXmindNodeKey(nodeKey) {
  const raw = (nodeKey || "").trim()
  if (!raw) {
    return null
  }

  const segments = raw.split("/")
  if (!segments.length) {
    return null
  }

  const path = segments.map((segment) => Number(segment))
  if (path.some((value) => !Number.isInteger(value) || value < 0)) {
    return null
  }

  return path
}

export function resolveXmindBranchLineColor(nodeKey) {
  const path = parseXmindNodeKey(nodeKey)
  if (!path || !path.length) {
    return null
  }

  const topLevelBranchIndex = path[0] ?? 0
  const depth = path.length
  const paletteIndex = Math.abs(topLevelBranchIndex) % BRANCH_HUE_PALETTE.length
  const paletteLoop = Math.floor(Math.abs(topLevelBranchIndex) / BRANCH_HUE_PALETTE.length)
  const baseHue = BRANCH_HUE_PALETTE[paletteIndex] ?? BRANCH_HUE_PALETTE[0]
  const hue = (baseHue + paletteLoop * 7) % 360
  const depthIndex = Math.max(0, depth - 1)
  const baseLightness =
    BRANCH_DEPTH_LIGHTNESS[Math.min(depthIndex, BRANCH_DEPTH_LIGHTNESS.length - 1)] ??
    BRANCH_DEPTH_LIGHTNESS[BRANCH_DEPTH_LIGHTNESS.length - 1]
  const extraDepth = Math.max(0, depthIndex - (BRANCH_DEPTH_LIGHTNESS.length - 1))
  const lightness = Math.max(MIN_BRANCH_LIGHTNESS, baseLightness - extraDepth * 3)
  const saturation = Math.max(62, BASE_BRANCH_SATURATION - Math.max(0, depth - 3) * 4)

  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

export const XMIND_STYLE_STRING = `{ "settings": { "infoItems/infoItem": [{ "type": "label", "mode": "card" }, { "type": "note", "mode": "card" }, { "type": "href", "mode": "card" }, { "type": "task", "mode": "card" }] }, "theme": { "id": "bce9414a70e8e213e4340a7eae", "importantTopic": { "type": "topic", "properties": { "fo:font-weight": "bold", "fo:color": "#312935", "svg:fill": "#FEFF00" } }, "minorTopic": { "type": "topic", "properties": { "fo:font-weight": "bold", "fo:color": "#312935", "svg:fill": "#00EEFF" } }, "expiredTopic": { "type": "topic", "properties": { "fo:font-style": "italic", "fo:text-decoration": " line-through" } }, "centralTopic": { "properties": { "shape-class": "org.xmind.topicShape.ellipserect", "svg:fill": "#1D88E5", "fo:color": "#282828", "line-color": "#30D8C4", "line-class": "org.xmind.branchConnection.roundedfold", "fo:font-weight": "600", "fo:font-family": "Montserrat", "fo:font-style": "normal", "fo:text-transform": "manual", "fo:font-size": "28pt", "line-width": "3pt", "border-line-width": "0" }, "styleId": "9eedda3d-28da-49b5-afae-680b11608673", "type": "topic" }, "boundary": { "properties": { "line-color": "#FFFFFF", "svg:fill": "#666666", "fo:color": "#282828", "fo:font-family": "Montserrat", "fo:font-weight": "500", "line-width": "0", "fo:font-style": "normal", "fo:font-size": "13pt" }, "styleId": "3292781b-3de9-4f68-ac37-36b2a88508f0", "type": "boundary" }, "floatingTopic": { "properties": { "shape-class": "org.xmind.topicShape.ellipserect", "svg:fill": "#FFFFFF", "border-line-color": "#FFFFFF", "border-line-width": "2", "fo:font-family": "Montserrat", "fo:font-weight": "600", "fo:font-size": "14pt", "fo:color": "#282828", "line-class": "org.xmind.branchConnection.bight", "line-color": "#30D8C4", "line-width": "3pt", "fo:font-style": "normal" }, "styleId": "983b690d-fc6d-4a6b-adc8-faec491c2f44", "type": "topic" }, "subTopic": { "properties": { "fo:font-weight": "500", "fo:color": "#FFFFFF", "fo:font-family": "Montserrat", "fo:text-align": "left", "line-class": "org.xmind.branchConnection.bight", "fo:font-size": "14pt", "fo:font-style": "normal" }, "styleId": "436748de-9e65-4db1-a8b8-a39168dce697", "type": "topic" }, "mainTopic": { "properties": { "fo:font-weight": "600", "fo:color": "#FFFFFF", "fo:font-family": "Montserrat", "fo:font-size": "18pt", "shape-class": "org.xmind.topicShape.underline", "svg:fill": "none", "line-class": "org.xmind.branchConnection.bight", "line-width": "3pt", "fo:font-style": "normal", "border-line-width": "3" }, "styleId": "d824cd43-db5a-4b37-9f69-eb41598133a7", "type": "topic" }, "calloutTopic": { "properties": { "svg:fill": "#FFFFFF", "border-line-width": "0", "fo:font-family": "Montserrat", "fo:font-weight": "600", "fo:color": "#282828", "fo:font-style": "normal", "fo:font-size": "14pt" }, "styleId": "4382d9ac-11d1-45a5-ba64-f4d23d011608", "type": "topic" }, "summary": { "properties": { "line-color": "#FFFFFF" }, "styleId": "7129e73481eb7a1897b2c8094a", "type": "summary" }, "summaryTopic": { "properties": { "svg:fill": "#FFFFFF", "border-line-color": "#FFFFFF", "fo:font-family": "Montserrat", "fo:font-weight": "500", "border-line-width": "1pt", "fo:color": "#282828", "fo:font-style": "normal", "fo:font-size": "14pt", "line-class": "org.xmind.branchConnection.bight", "line-width": "3pt" }, "styleId": "d3043995-fe69-4ce8-811a-9dc1b4ebeda3", "type": "topic" }, "relationship": { "properties": { "line-width": "3pt", "line-pattern": "solid", "line-color": "#FFFFFF", "fo:color": "#FFFFFF", "fo:font-family": "Montserrat", "fo:font-weight": "500", "fo:font-size": "13pt", "fo:font-style": "normal" }, "styleId": "f00b7a93-5062-4f1e-a3d3-b13e9e52f697", "type": "relationship" }, "map": { "properties": { "line-tapered": "tapered", "svg:fill": "#282828" }, "styleId": "6659012d15a89de3df86e84e92", "type": "map" } }, "topicPositioning": "fixed", "style": { "id": "a8a952df-d15d-4f4c-baa6-f27830b62f58", "properties": { "multi-line-colors": "#FD6D5A #FEB40B #6DC354 #518CD8 #443295 #994487" } } }`;
export function getXmindStyleData(mode='dark'){
 let style=XMIND_STYLE_STRING;
 if(mode==='light')style=style.replace(/#FFFFFF/g,'#000000').replace(/#282828/g,'#ffffff');
 return JSON.parse(style);
}
