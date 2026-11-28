import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {startMarkdownViewer} from '../../projects/markdown-viewer/src/view.js';
export default defineUnlistedScript(()=>{void startMarkdownViewer().catch(error=>console.warn('[Markdown Viewer]',error?.message||'initialization failed'));});
