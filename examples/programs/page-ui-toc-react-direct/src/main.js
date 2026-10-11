import {createElement, useEffect, useMemo, useRef, useState} from 'react';
import {chooseActiveTocItem, createTocScanner, sameToc, selectTocItems} from './toc-model.js';

// Official React JavaScript syntax. OpenDesk provides React, mounts this
// component in its managed Shadow DOM and runs root.unmount() on Stop.
// No createRoot, createPageUI, JSX transform, CDN or npm install is needed.
const h = createElement;
const colors = {
  text: '#273247', muted: '#728095', line: '#e1e7f0', accent: '#4269d9',
  light: '#f1f5ff'
};
const ui = {
  card: {
    width: 'min(300px, calc(100vw - 32px))', maxWidth: '100%',
    background: '#fff', color: colors.text, border: '1px solid ' + colors.line,
    borderRadius: 13, boxShadow: '0 10px 32px rgba(17, 32, 57, 0.18)',
    padding: 11, font: '13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    colorScheme: 'light'
  },
  head: {display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7},
  title: {fontWeight: 700, letterSpacing: '.06em', fontSize: 11, color: colors.muted},
  buttons: {display: 'flex', gap: 3, alignItems: 'center'},
  mode: {padding: '4px 6px', cursor: 'pointer', border: '1px solid transparent',
    borderRadius: 6, background: 'transparent', font: 'inherit', fontSize: 11,
    color: colors.muted},
  nav: {overflowY: 'auto', overscrollBehavior: 'contain', maxHeight: 'min(64vh, 520px)',
    marginTop: 10, scrollbarWidth: 'thin'},
  list: {display: 'grid', gap: 1, padding: 0, margin: 0, listStyle: 'none'},
  item: {display: 'block', width: '100%', border: 0, borderLeft: '2px solid transparent',
    background: 'transparent', color: '#5f6c80', textAlign: 'left', borderRadius: 4,
    paddingTop: 5, paddingBottom: 5, paddingRight: 5, cursor: 'pointer',
    lineHeight: 1.4, fontSize: 12, fontFamily: 'inherit', overflowWrap: 'anywhere'},
  footer: {display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 6, marginTop: 8, paddingTop: 7, borderTop: '1px solid ' + colors.line,
    fontSize: 11, color: colors.muted},
  more: {border: 0, padding: 4, color: colors.accent, background: 'transparent',
    font: 'inherit', fontSize: 11, cursor: 'pointer'},
  empty: {padding: '10px 4px', color: colors.muted, fontSize: 12},
  status: {marginTop: 7, fontSize: 11, color: '#ad4a4f'}
};
const modes = [['overview', '概览'], ['focus', '当前'], ['full', '全部']];

export default function App() {
  const [items, setItems] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [mode, setMode] = useState('focus');
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState('');
  const scan = useMemo(() => createTocScanner(document), []);
  const currentItems = useRef([]);

  useEffect(() => {
    const win = document.defaultView;
    let stopped = false, scanFrame = 0, activeFrame = 0;
    const refreshActive = () => {
      activeFrame = 0;
      if (stopped) return;
      const next = chooseActiveTocItem(currentItems.current);
      setActiveId(old => old === next ? old : next);
    };
    const rescan = () => {
      scanFrame = 0;
      if (stopped) return;
      try {
        const next = scan();
        currentItems.current = next;
        setItems(old => sameToc(old, next) ? old : next);
        setError('');
        refreshActive();
      } catch (reason) {
        setError('扫描目录失败：' + String(reason?.message || reason));
      }
    };
    const scheduleScan = () => {
      if (!stopped && !scanFrame) scanFrame = win.requestAnimationFrame(rescan);
    };
    const scheduleActive = () => {
      if (!stopped && !activeFrame) activeFrame = win.requestAnimationFrame(refreshActive);
    };
    // Shadow DOM changes from React are outside this observer's document subtree.
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body || document.documentElement, {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['hidden', 'aria-hidden', 'style', 'class']
    });
    win.addEventListener('scroll', scheduleActive, true);
    win.addEventListener('resize', scheduleScan);
    win.addEventListener('hashchange', scheduleActive);
    scheduleScan();
    return () => {
      stopped = true;
      observer.disconnect();
      win.removeEventListener('scroll', scheduleActive, true);
      win.removeEventListener('resize', scheduleScan);
      win.removeEventListener('hashchange', scheduleActive);
      if (scanFrame) win.cancelAnimationFrame(scanFrame);
      if (activeFrame) win.cancelAnimationFrame(activeFrame);
    };
  }, [scan]);

  const shown = selectTocItems(items, activeId, mode);
  function goTo(item) {
    if (!item.element?.isConnected) {
      setError('此章节已改变，请重新运行目录扫描。');
      return;
    }
    try {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      item.element.scrollIntoView({behavior: reducedMotion ? 'auto' : 'smooth', block: 'start'});
      setActiveId(item.id);
      setError('');
    } catch (reason) {
      setError('跳转失败：' + String(reason?.message || reason));
    }
  }
  return h('section', {style: ui.card, 'aria-label': 'React Direct 阅读目录演示'},
    h('header', {style: ui.head},
      h('strong', {style: ui.title}, 'CONTENTS'),
      h('div', {style: ui.buttons, role: 'group', 'aria-label': '目录视图'},
        ...(!collapsed ? modes.map(([value, label]) => h('button', {
          key: value, type: 'button', title: label, 'aria-label': label + '视图',
          'aria-pressed': mode === value,
          onClick: () => setMode(value),
          style: {...ui.mode, ...(mode === value ? {
            color: colors.accent, background: colors.light, borderColor: '#dce6ff'
          } : {})}
        }, label)) : []),
        h('button', {
          key: 'collapse', type: 'button', onClick: () => setCollapsed(value => !value),
          title: collapsed ? '展开目录' : '收起目录',
          'aria-label': collapsed ? '展开目录' : '收起目录',
          'aria-expanded': !collapsed,
          style: {...ui.mode, color: colors.text, fontSize: 14}
        }, collapsed ? '＋' : '－')
      )
    ),
    !collapsed && h('nav', {style: ui.nav, 'aria-label': '章节导航'},
      shown.length === 0
        ? h('p', {style: ui.empty}, '当前网页暂无可用正文标题')
        : h('ol', {style: ui.list}, ...shown.map(item => h('li', {key: item.id},
          h('button', {
            type: 'button', title: item.label,
            'aria-current': item.id === activeId ? 'location' : undefined,
            onClick: () => goTo(item),
            style: {...ui.item,
              paddingLeft: 8 + Math.min(item.depth, 3) * 11,
              ...(item.id === activeId ? {
                color: colors.text, fontWeight: 650,
                background: colors.light, borderLeftColor: colors.accent
              } : {})}
          }, item.label)
        )))),
    !collapsed && h('div', {style: ui.footer},
      h('span', null, items.length + ' 个章节 · React Direct Demo'),
      shown.length < items.length && h('button', {
        type: 'button', onClick: () => setMode('full'), style: ui.more
      }, '查看全部')
    ),
    !collapsed && error && h('p', {role: 'status', style: ui.status}, error)
  );
}
