export function render(ui,{label,step}) {
  const card=document.createElement('section');card.className='od-card';
  const image=document.createElement('img');image.src=ui.getAsset('assets/mark.png');image.alt='OpenDesk';image.width=24;image.height=24;
  const action=document.createElement('button');action.type='button';action.className='od-button od-button--primary';action.dataset.action='count';action.textContent=label;
  const output=document.createElement('output');output.dataset.count='0';output.textContent='0';
  const close=document.createElement('button');close.type='button';close.className='od-button';close.dataset.action='close';close.textContent='Close';
  let count=0;ui.on(action,'click',()=>{count+=step;output.dataset.count=String(count);output.textContent=String(count);});
  ui.on(close,'click',()=>ui.destroy());
  card.append(image,action,output,close);ui.content.append(card);
}
