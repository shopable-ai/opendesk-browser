import {h, ref} from 'vue';
// Vue official render component; OpenDesk generates createApp and unmount.
export default {
  setup(){
    const count=ref(0);
    return ()=>h('button',{
      type:'button',onClick:()=>{count.value++;},
      style:{padding:'8px 14px',borderRadius:'8px',cursor:'pointer'}
    },'已点击 '+count.value+' 次');
  }
};
