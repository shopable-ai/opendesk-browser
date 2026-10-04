
var doClickPrevious = () => {
	let prevBtn = document.querySelector('.pagination-item.pagination-item--previous a');
	if (prevBtn) return prevBtn.click()
	console.warn('没有找到上一页按钮');
}
var doClickNext = () => {
	let nextBtn = document.querySelector('.pagination-item.pagination-item--next a');
	if (nextBtn) return nextBtn.click()
	console.warn('没有找到下一页按钮');
}

/**
 * installation
 */
function install(hook, vm) {
	hook.doneEach(function () {
					// 添加触摸手势支持
		if (window.matchMedia('(pointer: coarse)').matches) {
			var element = document.querySelector('main .markdown-section');
			if(element.hammer) return;
			var hammer = new Hammer(element);
			hammer.on('swipeleft', doClickNext);
			hammer.on('swiperight', doClickPrevious);
			element.hammer = hammer;
			console.log('添加触摸手势支持');
		}
	});
}

document.onkeydown = (e) => {
  e = e || window.event;

  // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/keyCode
  switch (e.key) {
    case 'ArrowRight':  doClickNext();      break;
    case 'ArrowLeft':   doClickPrevious();  break;
    // case 'j':           doClickNext();      break;
    // case 'k':           doClickPrevious();  break;
    // case 'l':           doClickNext();      break;
    // case 'h':           doClickPrevious();  break;
  }
};
window.$docsify = window.$docsify || {};
window.$docsify.plugins = (window.$docsify.plugins || []).concat([install]);
