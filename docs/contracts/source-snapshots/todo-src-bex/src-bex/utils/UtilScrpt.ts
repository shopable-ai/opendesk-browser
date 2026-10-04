

// const { service, route, mitt, sysMitt } = useCool(); // util中无法运行

export function wrapAsync(code) {
	// 检查代码中是否已经有 'async' 关键字
	const hasAsync = /async\s+function/.test(code);
	const hasTry = code.includes('globalThis.Console && Console.error("error in wrapAsync:", e )');
	// 如果代码包含 'await' 但不包含 'async'
	let tryCode = hasTry ? code : `
		try{
			${code}
		}catch(e){
			console.log('script run error:' ,e)

			globalThis.Console && Console.open()
			globalThis.Console && Console.show()
			globalThis.Console && Console.error("error in wrapAsync:", e )
			globalThis.Console && Console.hide( 10000 );
		}` ;

	// 如果代码包含 'await' 但不包含 'async'
	if (!hasAsync && /await/.test(code)) {
		// 将代码包装在一个立即执行的异步函数表达式中
		let newColde = `
			(async function() {
				${tryCode}
			})()
		` ;
		return newColde;
	}

	// 如果代码已经是 async 或者不需要修改，则原样返回
	return tryCode;
}



export function formatJSON(input: string) {
	let obj;
	try {
		// 使用 eval 转换为对象，这是不安全的!
		obj = eval('(' + input + ')');
		// 使用 JSON.stringify 格式化
		return JSON.stringify(obj);
	} catch (e) {
		console.error("Failed to convert input to JSON.");
		return input;
	}
}
// onRun , doRun , doRunSend

