import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {Confirmation} from '../../../src/ui/react/components/confirmation.tsx';
import '../../../src/ui/extension-center.css';

// Presentation stays in the outer preview document, outside the sandbox.
export function createPreviewReview(){
  const container=document.createElement('div');
  document.body.append(container);
  const root=createRoot(container);
  let pending=null,sequence=0;
  const cancelled=()=>Object.assign(Error('已取消，未启用所选线路'),{code:'E_CANCELLED'});
  return {
    request(review){
      if(pending)return Promise.reject(Object.assign(Error('已有待决审阅'),{code:'E_UI_CONFIRM_BUSY'}));
      return new Promise((resolve,reject)=>{
        let settled=false,submitted=false;
        const finish=(ok,value)=>{
          if(settled)return;settled=true;clearTimeout(timer);pending=null;
          root.render(null);
          if(ok)resolve(value);else reject(value);
        };
        pending=()=>finish(false,cancelled());
        const timer=setTimeout(()=>finish(false,cancelled()),90000);
        root.render(<Confirmation open identity={++sequence} source="AI Proxy"
          title={review.title} message={review.message} confirmLabel={review.button}
          onCancel={()=>{if(!submitted)finish(false,cancelled());}}
          onConfirm={event=>{
            // Execute in the actual click stack, as the trusted Host does.
            if(settled||submitted)return;
            submitted=true;clearTimeout(timer);root.render(null);
            try{Promise.resolve(review.run(event)).then(value=>finish(true,value),error=>finish(false,error));}
            catch(error){finish(false,error);}
          }}/>);
      });
    },
    cancel(){pending?.();},
    dispose(){pending?.();root.unmount();container.remove();}
  };
}
