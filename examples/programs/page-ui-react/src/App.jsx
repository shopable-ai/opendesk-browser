import {useState} from 'react';

export default function App(){
  const [count,setCount]=useState(0);
  return <button type="button" onClick={()=>setCount(n=>n+1)}>已点击 {count} 次</button>;
}
