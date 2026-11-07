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
    if (typeof codeInput !== 'function') {
      throw Object.assign(new TypeError('Pipeline requires a packaged function; source strings are unsupported.'), {
        code: typeof codeInput === 'string' ? 'E_UNSUPPORTED' : 'E_PIPELINE_INPUT'
      });
    }
    if (!this.pipelines.includes(codeInput)) this.pipelines.push(codeInput);
    console.log("Pipeline 已添加:", codeInput);
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
