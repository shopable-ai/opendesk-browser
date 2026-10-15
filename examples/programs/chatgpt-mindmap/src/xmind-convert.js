// Ported from shopable-ai/shopable-station@b76abf4b95e34c1234a33927051ea13165d92715.
// apps/web/src/sites/mindbank/mind/renderers/xmind/convert.ts
// blob 37b38c63d601080999f3e1148949e595c66d9be6; skin.ts blob 2cd1cdf6956f0e2cfb9b447a1965961b076cf51c.
// MindNode: {id,title,content?,depth,children}, utils/mind-tree.ts blob 4a0584460fa593b1d1859f226d5ba918a7335b5f.
// HTML already supplies visible text: do not run Markdown/task-title rewriting.
// SDK is supplied by the caller; this module never loads or evaluates code.
// Only path-based branch identity is retained for folding; XMind notes contain only user content.
function buildNodeKey(path) {
  return path.join("/");
}
function applyBranchStates(item, options, path = []) {
  const attached = item.children?.attached;
  if (!attached?.length) return;
  attached.forEach((child, index) => {
    const nextPath = [...path, index];
    const nodeKey = buildNodeKey(nextPath);
    const nodeState = options.statesByNodeKey?.get(nodeKey);
    const shouldFold = nodeState === "folded" ? true : nodeState === "expanded" ? false : options.defaultFolded;
    if (shouldFold) {
      child.branch = "folded";
    } else {
      delete child.branch;
    }
    applyBranchStates(
      child,
      options,
      nextPath
    );
  });
}
async function mindTreeToXmindBlob(sdk, tree, skinMode, options = { defaultFolded: true }) {
  const JSZip = sdk.JSZip;
  const Workbook = sdk.Workbook;
  const Topic = sdk.Topic;
  const Dumper = sdk.Dumper;
  if (!JSZip || !Workbook || !Topic || !Dumper) {
    throw new Error("XMind SDK \u672A\u52A0\u8F7D");
  }
  const centerTitle = tree.title || "本条回复";
  const workbook = new Workbook();
  const sheet = workbook.createSheet("sheet-mind", centerTitle);
  const topic = new Topic({ sheet });
  const buildTopicRecords = (node) => node.children.map(child => ({
    title: child.title || "",
    note: child.content || "",
    children: buildTopicRecords(child)
  }));
  const appendTopicRecord = (parentId, record) => {
    topic.on(parentId).add({ title: record.title });
    const childId = topic.cid();
    if (!childId) {
      throw new Error("XMind SDK \u672A\u8FD4\u56DE\u65B0\u5EFA topic \u7684 id");
    }
    if (record.note) {
      topic.on(childId).note(record.note);
    }
    record.children.forEach((child) => {
      appendTopicRecord(childId, child);
    });
  };
  const childRecords = buildTopicRecords(tree);
  const rootTopicId = topic.rootTopicId || topic.cid(centerTitle);
  if (!rootTopicId) {
    throw new Error("XMind SDK \u672A\u8FD4\u56DE\u6839 topic id");
  }
  if (tree.content) topic.on(rootTopicId).note(tree.content);
  childRecords.forEach((record) => {
    appendTopicRecord(rootTopicId, record);
  });
  const dumper = new Dumper({ workbook });
  const files = dumper.dumping();
  const zip = new JSZip();
  files.forEach((file) => {
    const { filename } = file;
    let { value } = file;
    if (filename === "content.json") {
      const content = JSON.parse(value);
      // Notes are user-visible. Never inject internal node keys into them.
      applyBranchStates(content["0"].rootTopic, options);
      Object.assign(content["0"], getXmindStyleData(skinMode));
      value = JSON.stringify(content);
    }
    zip.file(filename, value);
  });
  return zip.generateAsync({ type: "blob" });
}
const XMIND_STYLE_STRING = `{ "settings": { "infoItems/infoItem": [{ "type": "label", "mode": "card" }, { "type": "note", "mode": "card" }, { "type": "href", "mode": "card" }, { "type": "task", "mode": "card" }] }, "theme": { "id": "bce9414a70e8e213e4340a7eae", "importantTopic": { "type": "topic", "properties": { "fo:font-weight": "bold", "fo:color": "#312935", "svg:fill": "#FEFF00" } }, "minorTopic": { "type": "topic", "properties": { "fo:font-weight": "bold", "fo:color": "#312935", "svg:fill": "#00EEFF" } }, "expiredTopic": { "type": "topic", "properties": { "fo:font-style": "italic", "fo:text-decoration": " line-through" } }, "centralTopic": { "properties": { "shape-class": "org.xmind.topicShape.ellipserect", "svg:fill": "#1D88E5", "fo:color": "#282828", "line-color": "#30D8C4", "line-class": "org.xmind.branchConnection.roundedfold", "fo:font-weight": "600", "fo:font-family": "Montserrat", "fo:font-style": "normal", "fo:text-transform": "manual", "fo:font-size": "28pt", "line-width": "3pt", "border-line-width": "0" }, "styleId": "9eedda3d-28da-49b5-afae-680b11608673", "type": "topic" }, "boundary": { "properties": { "line-color": "#FFFFFF", "svg:fill": "#666666", "fo:color": "#282828", "fo:font-family": "Montserrat", "fo:font-weight": "500", "line-width": "0", "fo:font-style": "normal", "fo:font-size": "13pt" }, "styleId": "3292781b-3de9-4f68-ac37-36b2a88508f0", "type": "boundary" }, "floatingTopic": { "properties": { "shape-class": "org.xmind.topicShape.ellipserect", "svg:fill": "#FFFFFF", "border-line-color": "#FFFFFF", "border-line-width": "2", "fo:font-family": "Montserrat", "fo:font-weight": "600", "fo:font-size": "14pt", "fo:color": "#282828", "line-class": "org.xmind.branchConnection.bight", "line-color": "#30D8C4", "line-width": "3pt", "fo:font-style": "normal" }, "styleId": "983b690d-fc6d-4a6b-adc8-faec491c2f44", "type": "topic" }, "subTopic": { "properties": { "fo:font-weight": "500", "fo:color": "#FFFFFF", "fo:font-family": "Montserrat", "fo:text-align": "left", "line-class": "org.xmind.branchConnection.bight", "fo:font-size": "14pt", "fo:font-style": "normal" }, "styleId": "436748de-9e65-4db1-a8b8-a39168dce697", "type": "topic" }, "mainTopic": { "properties": { "fo:font-weight": "600", "fo:color": "#FFFFFF", "fo:font-family": "Montserrat", "fo:font-size": "18pt", "shape-class": "org.xmind.topicShape.underline", "svg:fill": "none", "line-class": "org.xmind.branchConnection.bight", "line-width": "3pt", "fo:font-style": "normal", "border-line-width": "3" }, "styleId": "d824cd43-db5a-4b37-9f69-eb41598133a7", "type": "topic" }, "calloutTopic": { "properties": { "svg:fill": "#FFFFFF", "border-line-width": "0", "fo:font-family": "Montserrat", "fo:font-weight": "600", "fo:color": "#282828", "fo:font-style": "normal", "fo:font-size": "14pt" }, "styleId": "4382d9ac-11d1-45a5-ba64-f4d23d011608", "type": "topic" }, "summary": { "properties": { "line-color": "#FFFFFF" }, "styleId": "7129e73481eb7a1897b2c8094a", "type": "summary" }, "summaryTopic": { "properties": { "svg:fill": "#FFFFFF", "border-line-color": "#FFFFFF", "fo:font-family": "Montserrat", "fo:font-weight": "500", "border-line-width": "1pt", "fo:color": "#282828", "fo:font-style": "normal", "fo:font-size": "14pt", "line-class": "org.xmind.branchConnection.bight", "line-width": "3pt" }, "styleId": "d3043995-fe69-4ce8-811a-9dc1b4ebeda3", "type": "topic" }, "relationship": { "properties": { "line-width": "3pt", "line-pattern": "solid", "line-color": "#FFFFFF", "fo:color": "#FFFFFF", "fo:font-family": "Montserrat", "fo:font-weight": "500", "fo:font-size": "13pt", "fo:font-style": "normal" }, "styleId": "f00b7a93-5062-4f1e-a3d3-b13e9e52f697", "type": "relationship" }, "map": { "properties": { "line-tapered": "tapered", "svg:fill": "#282828" }, "styleId": "6659012d15a89de3df86e84e92", "type": "map" } }, "topicPositioning": "fixed", "style": { "id": "a8a952df-d15d-4f4c-baa6-f27830b62f58", "properties": { "multi-line-colors": "#FD6D5A #FEB40B #6DC354 #518CD8 #443295 #994487" } } }`;
function getXmindStyleData(mode) {
  let style = XMIND_STYLE_STRING;
  if (mode === "light") {
    style = style.replace(/#FFFFFF/g, "#000000").replace(/#282828/g, "#ffffff");
  }
  return JSON.parse(style);
}
export {
  getXmindStyleData,
  mindTreeToXmindBlob
};
