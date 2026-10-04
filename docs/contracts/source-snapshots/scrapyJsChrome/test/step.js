class StepHighlighter {
    constructor(options = {}) {
        this.elements = options.elements || []; // 需要高亮的元素数组
        this.currentIndex = 0; // 当前高亮的索引
        this.highlightClass = 'step-highlight'; // 高亮时的类名
        this.stepPrefix = options.stepPrefix || 'Step '; // 步骤前缀
        this.onSwitch = options.onSwitch || (() => {}); // 切换时的回调
        this.initStyles(); // 初始化样式
        this.render(); // 渲染初始状态
    }

    // 初始化高亮和步骤标记的样式
    initStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .${this.highlightClass} {
                position: relative;
                border: 2px solid #00b4d8;
                box-shadow: 0 0 10px rgba(0, 180, 216, 0.5);
                transition: all 0.3s ease;
                z-index: 10;
            }
            .step-label {
                position: absolute;
                top: -25px;
                left: 10px;
                background: #00b4d8;
                color: white;
                padding: 2px 8px;
                border-radius: 3px;
                font-size: 12px;
                font-family: Arial, sans-serif;
            }
        `;
        document.head.appendChild(style);
    }

    // 渲染高亮和步骤标记
    render() {
        this.clear(); // 先清除所有高亮
        if (this.elements.length === 0) return;

        const currentElement = this.elements[this.currentIndex];
        currentElement.classList.add(this.highlightClass);

        // 添加步骤标记
        const stepLabel = document.createElement('div');
        stepLabel.className = 'step-label';
        stepLabel.textContent = `${this.stepPrefix}${this.currentIndex + 1}/${this.elements.length}`;
        currentElement.appendChild(stepLabel);

        // 滚动到当前元素
        currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.onSwitch(this.currentIndex, currentElement);
    }

    // 清除所有高亮和标记
    clear() {
        this.elements.forEach(el => {
            el.classList.remove(this.highlightClass);
            const label = el.querySelector('.step-label');
            if (label) label.remove();
        });
    }

    // 切换到下一个
    next() {
        if (this.currentIndex < this.elements.length - 1) {
            this.currentIndex++;
            this.render();
        }
    }

    // 切换到上一个
    prev() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.render();
        }
    }

    // 跳转到指定索引
    goTo(index) {
        if (index >= 0 && index < this.elements.length) {
            this.currentIndex = index;
            this.render();
        }
    }

    // 更新元素列表
    updateElements(newElements) {
        this.elements = newElements;
        this.currentIndex = 0;
        this.render();
    }
}

// 使用示例
document.addEventListener('DOMContentLoaded', () => {
    // 获取所有表格元素（你可以替换为其他选择器）
    const tables = Array.from(document.querySelectorAll('table'));

    // 初始化 StepHighlighter
    const highlighter = new StepHighlighter({
        elements: tables,
        stepPrefix: '步骤 ',
        onSwitch: (index, element) => {
            console.log(`当前高亮第 ${index + 1} 个元素`, element);
        }
    });

    // 添加切换按钮（可选）
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '下一个';
    nextBtn.style.position = 'fixed';
    nextBtn.style.bottom = '20px';
    nextBtn.style.right = '20px';
    nextBtn.onclick = () => highlighter.next();
    document.body.appendChild(nextBtn);

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '上一个';
    prevBtn.style.position = 'fixed';
    prevBtn.style.bottom = '60px';
    prevBtn.style.right = '20px';
    prevBtn.onclick = () => highlighter.prev();
    document.body.appendChild(prevBtn);
});