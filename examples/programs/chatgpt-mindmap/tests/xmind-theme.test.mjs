import test from 'node:test';
import assert from 'node:assert/strict';
import {buildXmindNodeKey,parseXmindNodeKey,normalizeXmindTopicTitle,resolveXmindBranchLineColor,getXmindStyleData} from '../src/mindbank-xmind-theme.js';
test('Mindbank XMind paths, per-branch color and central theme are reused',()=>{
 assert.equal(buildXmindNodeKey([2,1,0]),'2/1/0');
 assert.deepEqual(parseXmindNodeKey('2/1/0'),[2,1,0]);
 assert.equal(parseXmindNodeKey('x/y'),null);
 assert.equal(normalizeXmindTopicTitle('  a\u200eb  '),'ab');
 assert.match(resolveXmindBranchLineColor('0/1'),/^hsl\(/);
 assert.notEqual(resolveXmindBranchLineColor('0'),resolveXmindBranchLineColor('1'));
 assert.equal(resolveXmindBranchLineColor(''),null);
 const skin=getXmindStyleData('dark');
 assert.equal(skin.theme.centralTopic.properties['svg:fill'],'#1D88E5');
 assert.equal(skin.theme.centralTopic.properties['line-color'],'#30D8C4');
});
