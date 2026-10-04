/**
 * Pipeline for processing and storing items (保持与 Scrapy 中 Pipeline 类相似)
 */
class Pipeline {
  constructor(spider) {
    this.pipelines = [];
    this.spider = spider;
  }

  // 添加处理函数
  addPipeline(codeInput) {
    try {
      let pipelineFunc;

      if (typeof codeInput === 'function') {
        pipelineFunc = codeInput;
      } else if (typeof codeInput === 'string') {
        const functionNameMatch = codeInput.match(/function\s+(\w+)\s*\(/);
        let uniqueFunctionName = functionNameMatch ?
          functionNameMatch[1] :
          `func_${Math.random().toString(36).substr(2, 16)}`;

        const modifiedCode = `
            let ${uniqueFunctionName} = ${codeInput.trim().replace(/function\s+\w*\s*\(/, 'function(')};
            ${uniqueFunctionName};
          `;

        pipelineFunc = eval(modifiedCode);
      } else {
        throw new Error("输入无效，请输入函数或有效的函数代码字符串");
      }

      if (!this.pipelines.includes(pipelineFunc)) this.pipelines.push(pipelineFunc);
      console.log("Pipeline 已添加:", pipelineFunc);
    } catch (error) {
      console.error("添加 Pipeline 时出错:", error);
      if (globalThis.window) alert("输入无效，请输入函数或有效的函数代码字符串");
      throw new Error("输入无效，请输入函数或有效的函数代码字符串");
    }
  }

  // 清空所有 pipelines
  clear() {
    this.pipelines = [];
    console.log("所有 Pipeline 已清空");
  }

  // 删除指定的处理函数
  removePipeline(pipelineFunc) {
    this.pipelines = this.pipelines.filter(func => func !== pipelineFunc);
    console.log("Pipeline 已删除:", pipelineFunc);
  }

  // Process item asynchronously
  async process_item(item, spider, isAccepting = () => true) {
    // console.log("Processing item:", item);
    for (const pipelineFunc of this.pipelines) {
      if (!isAccepting()) return Pipeline.DISCARDED;
      try {
        // Validate the number of arguments expected by pipelineFunc
        const expectedArgs = pipelineFunc.length;
        if (expectedArgs === 1) {
          // Process with item only
          item = await pipelineFunc(item);
        } else if (expectedArgs >= 2) {
          // Process with item and spider reference
          item = await pipelineFunc(item, spider);
        } else {
          throw new Error(`Pipeline function expects ${expectedArgs} arguments, but only 1 or 2 are allowed.`);
        }

        // If item is null or undefined, stop processing
        if (item == null) {
          console.log("Item was filtered or discarded during processing.");
          return null;
        }
      } catch (error) {
        throw error;
      }
    }

    return item;
  }
}

Pipeline.DISCARDED = Symbol('pipeline-discarded');
module.exports = Pipeline;