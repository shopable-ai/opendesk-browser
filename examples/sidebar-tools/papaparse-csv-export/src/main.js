// Build-time catalog pin; isolated v2 tool, not Page or website MAIN.
(()=>{
  'use strict';
  const root=globalThis.OpenDeskTool?.root;
  const download=globalThis.OpenDeskSDK?.browser?.downloads?.text;
  const Papa=globalThis.Papa;
  if(!root||typeof download!=='function'||typeof Papa?.unparse!=='function'||typeof Papa?.parse!=='function')
    throw Error('E_TOOL_CONTEXT: approved Papa/Browser SDK unavailable');
  const table=root.querySelector('#csv-table'),button=root.querySelector('#csv-export'),status=root.querySelector('#csv-status');
  if(!table||!button||!status)throw Error('E_TOOL_UI: CSV list or action missing');
  button.addEventListener('click',async event=>{
    // Iframe click is not Chrome authorization. Side Panel separately confirms.
    if(!event.isTrusted||button.disabled)return;
    button.disabled=true;
    globalThis.OpenDeskTool.setState?.({dirty:false,busy:true});
    try{
      const nodes=Array.from(table.querySelectorAll('tbody tr'));
      if(!nodes.length||nodes.length>500)throw Error('E_CSV_LIST_LIMIT');
      const data=nodes.map(node=>{
        if(node.cells.length!==3)throw Error('E_CSV_SCHEMA');
        return {name:node.cells[0].textContent,price:node.cells[1].textContent,
          sku:node.cells[2].textContent};
      });
      const csv=Papa.unparse(data,{columns:['name','price','sku'],newline:'\r\n',escapeFormulae:true});
      const checked=Papa.parse(csv,{header:true,skipEmptyLines:true,dynamicTyping:false});
      if(checked.errors.length||checked.data.length!==data.length)throw Error('E_CSV_ROUNDTRIP');
      const reply=await download({filename:'products.csv',text:'\uFEFF'+csv});
      if(reply?.started!==true)throw Error('E_OUTCOME_UNKNOWN');
      status.textContent='Chrome 已收到 CSV 下载请求；是否落盘成功，请查看 Chrome 下载记录。';
    }catch(error){
      status.textContent='导出未确认：'+String(error?.code||error?.message||error).slice(0,120)+'；请核查授权或下载记录，勿盲目重试。';
    }finally{
      button.disabled=false;
      globalThis.OpenDeskTool.setState?.({dirty:false,busy:false});
    }
  });
})();
