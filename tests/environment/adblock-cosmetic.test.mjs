import test from 'node:test';
import assert from 'node:assert/strict';
import {ADBLOCK_COSMETIC_HOSTS,createAdblockCosmeticController}
  from '../../examples/sidebar-tools/adblock/trusted/cosmetic.js';

class Element {
  constructor(tagName){
    this.tagName=tagName;
    this.children=[];
    this.parentNode=null;
    this.id='';
    this.className='';
    this.textContent='';
    this.style={};
  }
  appendChild(child){
    child.remove();
    this.children.push(child);
    child.parentNode=this;
    return child;
  }
  remove(){
    if(!this.parentNode)return;
    const siblings=this.parentNode.children;
    siblings.splice(siblings.indexOf(this),1);
    this.parentNode=null;
  }
}

function fixture(url='https://javbus.com/'){
  const location=new URL(url);
  const document={location,createElement:tagName=>new Element(tagName),
    head:new Element('head'),documentElement:new Element('html'),body:new Element('body')};
  document.documentElement.appendChild(document.head);
  document.documentElement.appendChild(document.body);
  const controller=createAdblockCosmeticController({document,location});
  const styles=()=>[document.head,document.documentElement]
    .filter(Boolean).flatMap(node=>node.children).filter(node=>node.tagName==='style');
  return {document,location,controller,styles};
}
const approved={enabled:true,host:'javbus.com'};

test('cosmetic host policy is frozen and importable without a page document',()=>{
  assert.deepEqual(ADBLOCK_COSMETIC_HOSTS,['javbus.com','www.javbus.com']);
  assert.equal(Object.isFrozen(ADBLOCK_COSMETIC_HOSTS),true);
  assert.throws(()=>ADBLOCK_COSMETIC_HOSTS.push('evil.example'),TypeError);
});

test('supported HTTP(S) pages get one fixed stylesheet across repeated apply',()=>{
  for(const url of ['http://javbus.com/','https://javbus.com/',
    'https://WWW.JAVBUS.COM.:8443/path']){
    const {location,controller,styles}=fixture(url);
    const state={enabled:true,host:location.hostname.toUpperCase(),selector:'.movie-box'};
    assert.equal(controller.apply(state),true,url);
    const [style]=styles();
    assert.ok(style.id.includes('adblock'));
    assert.equal(style.textContent,'.ad-box { display: none !important; }');
    for(let i=0;i<3;i++)assert.equal(controller.apply(state),true);
    assert.deepEqual(styles(),[style]);
    controller.dispose();
    assert.deepEqual(styles(),[]);
  }
});

test('malformed or disabled state removes an active stylesheet',()=>{
  for(const state of [undefined,null,false,true,1,'true',[],{},
    {enabled:false,host:'javbus.com'},{enabled:'true',host:'javbus.com'},
    {enabled:1,host:'javbus.com'},{enabled:true},{enabled:true,host:{}},
    {enabled:true,host:['javbus.com']},
    {enabled:true,host:'https://javbus.com/'},{enabled:true,host:'javbus.com:443'},
    {enabled:true,host:' javbus.com '},{enabled:true,host:'javbus.com..'}]){
    const {controller,styles}=fixture();
    assert.equal(controller.apply(approved),true);
    assert.equal(controller.apply(state),false);
    assert.deepEqual(styles(),[]);
  }
});

test('host approval cannot cover a sibling host, subdomain, suffix spoof or other protocol',()=>{
  for(const [url,host] of [
    ['https://www.javbus.com/','javbus.com'],
    ['https://javbus.com/','www.javbus.com'],
    ['https://javbus.com.evil.example/','javbus.com'],
    ['https://fakejavbus.com/','javbus.com'],
    ['https://ads.javbus.com/','ads.javbus.com'],
    ['https://evil.example/','evil.example'],
    ['ftp://javbus.com/','javbus.com'],
    ['chrome-extension://javbus.com/','javbus.com'],
    ['file://javbus.com/path','javbus.com'],
    ['blob:https://javbus.com/id','javbus.com'],
    ['about:blank','javbus.com']]){
    const {location,controller,styles}=fixture();
    controller.apply(approved);
    location.href=url;
    assert.equal(controller.apply({enabled:true,host}),false,url);
    assert.deepEqual(styles(),[],url);
  }
});

test('host case and a single trailing dot normalize on the approved host',()=>{
  const {controller,styles}=fixture();
  assert.equal(controller.apply({enabled:true,host:'JAVBUS.COM.'}),true);
  assert.equal(styles().length,1);
  controller.dispose();
});

test('disable restores the page without deleting or altering ads or movie content',()=>{
  const {document,controller,styles}=fixture();
  const top=document.body.appendChild(new Element('div'));
  top.className='ad-box all-top';
  const banner=top.appendChild(new Element('div'));
  banner.id='tb';
  banner.className='ad-item';
  banner.textContent='sponsor';
  banner.style.display='inline-block';
  const movie=document.body.appendChild(new Element('div'));
  movie.className='movie-box';
  movie.textContent='movie';
  const originalChildren=[...document.body.children];
  controller.apply(approved);
  const bottom=document.body.appendChild(new Element('div'));
  bottom.className='ad-box';
  bottom.textContent='later sponsor';
  assert.equal(styles().length,1);
  assert.equal(controller.apply({enabled:false,host:'javbus.com'}),false);
  assert.deepEqual(styles(),[]);
  assert.deepEqual(document.body.children,[...originalChildren,bottom]);
  assert.deepEqual(top.children,[banner]);
  assert.equal(banner.textContent,'sponsor');
  assert.deepEqual(banner.style,{display:'inline-block'});
  assert.equal(movie.textContent,'movie');
  assert.equal(bottom.textContent,'later sponsor');
  assert.deepEqual(top.style,{});
  assert.deepEqual(movie.style,{});
  assert.deepEqual(bottom.style,{});
  assert.equal(controller.apply(approved),true);
  controller.dispose();
  controller.dispose();
  assert.deepEqual(styles(),[]);
  assert.deepEqual(document.body.children,[...originalChildren,bottom]);
  assert.equal(controller.apply(approved),false);
});

test('colliding IDs and replacement page nodes remain untouched',()=>{
  const {document,controller,styles}=fixture();
  const foreign=document.head.appendChild(new Element('style'));
  foreign.id='opendesk-adblock-cosmetic';
  foreign.textContent='.page { color: red; }';
  controller.apply(approved);
  const owned=styles().find(node=>node!==foreign);
  assert.ok(owned);
  controller.apply(approved);
  assert.deepEqual(styles(),[foreign,owned]);
  owned.remove();
  const replacement=document.body.appendChild(new Element('div'));
  replacement.id=owned.id;
  controller.apply({enabled:false,host:'javbus.com'});
  controller.dispose();
  controller.dispose();
  assert.deepEqual(document.head.children,[foreign]);
  assert.deepEqual(document.body.children,[replacement]);
  assert.equal(foreign.textContent,'.page { color: red; }');
});

test('document-start fallback uses the root or waits for an insertion target',()=>{
  const {document,controller,styles}=fixture();
  document.head.remove();
  document.head=null;
  assert.equal(controller.apply(approved),true);
  assert.equal(styles()[0].parentNode,document.documentElement);
  controller.dispose();
  const waitingDocument={createElement:tagName=>new Element(tagName)};
  const waiting=createAdblockCosmeticController({document:waitingDocument,
    location:new URL('https://javbus.com/')});
  assert.equal(waiting.apply(approved),false);
  waitingDocument.documentElement=new Element('html');
  assert.equal(waiting.apply(approved),true);
  waiting.dispose();
  assert.deepEqual(waitingDocument.documentElement.children,[]);
});
