import * as React from 'react';
import {CookieEditorView} from '../../../../examples/sidebar-tools/cookie-editor/ui/CookieEditorView.jsx';

// Development-only inert fixture. No Cookie values, SDK methods or real origins.
// The production Cookie Editor remains the installed v2.0.23 sandbox package.
const DEMO=Object.freeze([
  Object.freeze({id:'fixture-session',name:'session_id',domain:'demo.example',path:'/',httpOnly:true,secure:true,session:true}),
  Object.freeze({id:'fixture-theme',name:'theme',domain:'demo.example',path:'/',httpOnly:false,secure:false,session:false}),
  Object.freeze({id:'fixture-language',name:'locale',domain:'demo.example',path:'/shop',httpOnly:false,secure:true,session:false})
]);
export function CookieTrustedPilot(){
  const [query,setQuery]=React.useState('');
  const [filter,setFilter]=React.useState('all');
  const [sort,setSort]=React.useState('name');
  const [expanded,setExpanded]=React.useState(false);
  const [selected,setSelected]=React.useState(null);
  const [refreshes,setRefreshes]=React.useState(0);
  return <section className="cookie-react-pilot" aria-label="Cookie React 静态试点">
    <p className="cookie-react-fixture" role="status">
      Trusted React 19 · UI-only 技术试点 · 虚构 Cookie 元数据
    </p>
    <CookieEditorView site="demo.example" rows={DEMO} query={query} onQuery={setQuery}
      filter={filter} onFilter={setFilter} sort={sort} onSort={setSort}
      expandedFilters={expanded} onToggleFilters={()=>setExpanded(value=>!value)}
      selected={selected} onSelect={setSelected}
      onRefresh={()=>{setQuery('');setFilter('all');setSelected(null);
        setRefreshes(value=>value+1);}}/>
    <p className="cookie-react-fixture-note">
      仅验证列表、搜索、筛选、行展开和单 React Root 生命周期。
      导入、导出、编辑及授权保持原正式工具实现，不在试点中模拟成功。
      {refreshes>0&&' · 已重置试点视图 '+refreshes+' 次'}
    </p>
  </section>;
}
