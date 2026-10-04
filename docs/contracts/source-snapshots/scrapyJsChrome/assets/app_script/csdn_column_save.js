// 查找所有专栏组中的item-r元素
function addFixButton() {
    const itemRElements = document.querySelectorAll('.column-group-item .item-r');
    
    itemRElements.forEach((itemR, index) => {
        // 检查是否已经存在修复专栏按钮
        if (!itemR.querySelector('a[innerText="修复专栏"]')) {
            // 创建新的按钮元素
            const fixButton = document.createElement('a');
            
            // 添加类名
            fixButton.className = 'item-target article-column-bt articleColumnBt';
            
            // 设置样式
            fixButton.style.backgroundColor = '#a3c2ec';
            
            // 设置文本
            fixButton.innerText = '修复专栏';
            
            // 添加点击事件
            fixButton.addEventListener('click', function(e) {
                // 阻止默认行为
                e.preventDefault();
                
                // 获取当前专栏的一些信息
                const columnItem = itemR.closest('.column-group-item');
                const titleElement = columnItem.querySelector('.tit');
                const title = titleElement ? titleElement.innerText : '未知专栏';
                
                // 输出日志
                console.log('修复专栏按钮被点击');
                console.log('专栏标题:', title);
                console.log('专栏索引:', index);
                console.log('点击时间:', new Date().toLocaleString());
                let saveScript = `crawlColumnCurrent()`
                executeScript( saveScript );
            });
            
            // 将按钮添加到item-r元素中
            itemR.appendChild(fixButton);
        }
    });
}

// 运行函数
addFixButton();