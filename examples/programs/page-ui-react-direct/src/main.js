import {createElement, useCallback, useReducer} from 'react';
// React official JavaScript component; OpenDesk generates mount and Stop.
function reducer(count,action){return action==='increment'?count+1:count;}
export default function App(){
  const [count,dispatch]=useReducer(reducer,0);
  const increment=useCallback(()=>dispatch('increment'),[]);
  return createElement('button',{
    type:'button',onClick:increment,
    style:{padding:'8px 14px',borderRadius:'8px',cursor:'pointer'}
  },'已点击 '+count+' 次');
}
