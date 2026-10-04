function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
  
async function* generateSequence() {
    console.log(`[${new Date().toLocaleTimeString()}] Start`);
    
    yield 1;
    
    // 使用 await 等待异步 setTimeout
    await wait(1000);
    console.log(`[${new Date().toLocaleTimeString()}] Waited 1 second`);
    yield 2;
    
    await wait(1000);
    console.log(`[${new Date().toLocaleTimeString()}] Waited another second`);
    yield 3;
  
    console.log(`[${new Date().toLocaleTimeString()}] End`);
  }
  
  // 迭代器
  const iterator = generateSequence();
  
  async function iterateOverSequence(iterator) {
    for await (const value of iterator) {
      console.log(`[${new Date().toLocaleTimeString()}] Received:`, value);
    }
  }
  
  // 调用迭代函数
  iterateOverSequence(iterator);
  
  // 输出示例：
  // [12:00:00 PM] Start
  // [12:00:00 PM] Received: 1
  // [12:00:01 PM] Waited 1 second
  // [12:00:01 PM] Received: 2
  // [12:00:02 PM] Waited another second
  // [12:00:02 PM] Received: 3
  // [12:00:02 PM] End
  

  function* generateSequence() {
    yield 1;
    yield 2;
    return 3; // 结束生成器并返回 3
    yield 4; // 这行代码永远不会执行
  }
  
  // 迭代器
  const iterator = generateSequence();
  
  console.log(iterator.next()); // { value: 1, done: false }
  console.log(iterator.next()); // { value: 2, done: false }
  console.log(iterator.next()); // { value: 3, done: true }
  console.log(iterator.next()); // { value: undefined, done: true }
  console.log(iterator.next()); // { value: undefined, done: true }
  
  