function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  function* generateSequence() {
    console.log(`[${new Date().toLocaleTimeString()}] Start`);
    
    yield 1;
    
    // 使用 yield 等待异步 setTimeout
    yield wait(1000).then(() => {
      console.log(`[${new Date().toLocaleTimeString()}] Waited 1 second`);
      return 2;
    });
    
    yield wait(1000).then(() => {
      console.log(`[${new Date().toLocaleTimeString()}] Waited another second`);
      return 3;
    });
  
    console.log(`[${new Date().toLocaleTimeString()}] End`);
  }
  
  // 迭代器
  const iterator = generateSequence();
  
  async function iterateOverSequence(iterator) {
    for (const value of iterator) {
      // 检查 value 是否为 Promise
      if (value instanceof Promise) {
        console.log(`[${new Date().toLocaleTimeString()}] Yielded a promise, waiting...`);
        const result = await value;
        console.log(`[${new Date().toLocaleTimeString()}] Received:`, result);
      } else {
        console.log(`[${new Date().toLocaleTimeString()}] Received:`, value);
      }
    }
  }
  
  // 调用迭代函数
  iterateOverSequence(iterator);
  
  // 输出示例：
  // [12:00:00 PM] Start
  // [12:00:00 PM] Received: 1
  // [12:00:00 PM] Yielded a promise, waiting...
  // [12:00:01 PM] Waited 1 second
  // [12:00:01 PM] Received: 2
  // [12:00:01 PM] Yielded a promise, waiting...
  // [12:00:02 PM] Waited another second
  // [12:00:02 PM] Received: 3
  // [12:00:02 PM] End
  