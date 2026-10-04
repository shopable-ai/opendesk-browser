
// Create an alias for CryptoJS.MD5
// Create an alias for CryptoJS.MD5
let pipelines = [];
function addPipeline(codeInput) {
    let md5 = CryptoJS.MD5;
    try {
        let pipelineFunc;
        
        // If the input is a function, add it directly
        if (typeof codeInput === 'function') {
            pipelineFunc = codeInput;
        } else if (typeof codeInput === 'string') {
            // Extract the function name from the input code
            const functionNameMatch = codeInput.match(/function\s+(\w+)\s*\(/);
            if (!functionNameMatch) {
                throw new Error("无法提取函数名，请确保输入是完整的函数");
            }
            
            const originalFunctionName = functionNameMatch[1];
            
            // Generate a unique function name using the md5 alias
            const uniqueFunctionName = `${originalFunctionName}_${md5(codeInput).toString()}`;
            
            // Modify the code to be assigned as a let variable
            const modifiedCode = `
                let ${uniqueFunctionName} = ${codeInput.trim().replace(/function\s+\w+\s*\(/, 'function(')};
                ${uniqueFunctionName};
            `;
            
            // Execute the modified code and capture the result
            pipelineFunc = eval(modifiedCode);
        } else {
            throw new Error("输入无效，请输入函数或有效的函数代码字符串");
        }
        
        // Add the function to the pipelines array
        if (!pipelines.includes(pipelineFunc))  pipelines.push(pipelineFunc);
        console.log("Pipeline 已添加:", pipelineFunc);
    } catch (error) {
        console.error("添加 Pipeline 时出错:", error);
        alert("处理函数无效，请检查代码格式");
    }
}

// 运行所有 Pipeline 处理数据
async function runPipelines(data) {
    let processedData = data;

    for (const pipelineFunc of pipelines) {
        try {
            // 执行 Pipeline 函数处理数据
            processedData = await pipelineFunc(processedData);
	console.log('processedData:', processedData , typeof processedData)
        } catch (error) {
            console.error("Pipeline Error: ", error);
        }
    }

    return processedData;
}
// 示例：用户输入完整的函数代码，单参数
const userCodeInput = `function cleanData(data) {
    console.log('data:', data , typeof data)
    return data.trim();
}`;
addPipeline(userCodeInput);

// 示例：用户输入另一段完整的函数代码，单参数
const anotherUserCodeInput = `function transformData(data) {
    console.log('data:', data , typeof data)
    return data.toUpperCase() + '!!!';
}`;
addPipeline(anotherUserCodeInput);

// 模拟抓取数据并执行 Pipeline
async function onDataFetched(data) {
    const processedData = await runPipelines(data);
    console.log("最终处理结果:", processedData);
}

// 运行示例
onDataFetched("   Hello World   ");  // 输出: "HELLO WORLD!!!"