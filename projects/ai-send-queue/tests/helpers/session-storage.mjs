export function memoryStorage(){
  const entries=new Map();
  return {getItem:key=>entries.get(key)??null,
    setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key),
    entries};
}
