import {createApp} from 'vue';
import Widget from './Widget.vue';
export function mountVue(container,props){
  const app=createApp(Widget,props);app.mount(container);return app;
}
