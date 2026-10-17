import {useState} from 'react';
import {Card,CardContent,Switch} from '@opendesk/ui';

// Author-owned JSX only. Host resource lookup and React Root live elsewhere.
export default function App(){
  const [enabled,setEnabled]=useState(false);
  return <Card>
    <CardContent className="adblock-demo-row">
      <div>
        <strong>广告拦截演示</strong>
        <div aria-live="polite">{enabled?'已开启':'已关闭'}</div>
      </div>
      <Switch isSelected={enabled} onChange={setEnabled} aria-label="模拟广告拦截"/>
    </CardContent>
  </Card>;
}
