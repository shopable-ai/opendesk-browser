import {createPageUI} from '@opendesk/ui';

// Explicit extension preview on the current authorized webpage; no site writes.
export default async function main() {
  const ui=createPageUI({id:'sample.page-toast-demo',css:`
    .demo{display:grid;gap:12px;width:260px;max-width:calc(100vw - 64px)}
    .demo h2,.demo p{margin:0}.demo h2{font-size:16px}.demo p{font-size:12px}
    .demo label{display:grid;gap:4px}.demo input,.demo select{width:100%;box-sizing:border-box}
    .demo footer{display:flex;gap:8px}.demo footer button{flex:1}
  `});
  const element=(tag,text)=>{
    const node=document.createElement(tag);
    if(text)node.textContent=text;
    return node;
  };
  const panel=element('section');panel.className='demo';
  panel.append(element('h2','OpenDesk 扩展 · 网页提示'),
    element('p','由扩展在当前网站运行；切换网站后可重新试运行。'));
  const field=(label,control)=>{
    const row=element('label',label);row.append(control);panel.append(row);return control;
  };
  const select=(label,options)=>{
    const control=element('select');
    for(const [value,text] of options){const option=element('option',text);option.value=value;control.append(option);}
    return field(label,control);
  };
  const position=select('位置',[
    ['top-left','左上'],['top','顶部居中'],['top-right','右上'],
    ['left','左侧居中'],['center','正中'],['right','右侧居中'],
    ['bottom-left','左下'],['bottom','底部居中'],['bottom-right','右下']
  ]);position.value='top';
  const variant=select('类型',[
    ['info','信息'],['success','成功'],['warning','警告'],['error','错误']
  ]);
  const duration=select('显示时长',[[1000,'1 秒'],[2000,'2 秒'],[5000,'5 秒'],[10000,'10 秒']]);
  duration.value='2000';
  const message=field('内容',element('input'));
  message.type='text';message.maxLength=240;message.value='来自 OpenDesk 扩展的网页提示';
  const footer=element('footer'),show=element('button','显示提示'),close=element('button','关闭演示');
  show.type=close.type='button';show.className='od-button';
  footer.append(show,close);panel.append(footer);
  const status=element('p');status.setAttribute('role','status');panel.append(status);
  ui.content.append(panel);
  ui.on(show,'click',()=>{
    try{
      ui.toast({message:message.value,position:position.value,variant:variant.value,duration:Number(duration.value)});
      status.textContent='已通过公共 ui.toast 显示；再次点击会更新同一条。';
    }catch(error){status.textContent=(error.code||'E_UI_TOAST')+'：请检查提示内容。';}
  });
  ui.on(close,'click',()=>ui.close());
  return {ui:'open',source:'OpenDesk extension',site:location.origin};
}
