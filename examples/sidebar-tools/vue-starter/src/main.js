import {createApp} from 'vue';
import App from './App.vue';
import './style.css';
const target=globalThis.OpenDeskTool?.root?.querySelector('#tool-app');
if(!target)throw new Error('OpenDesk Tool sandbox root unavailable');
createApp(App,{request:globalThis.OpenDeskTool.request}).mount(target);
