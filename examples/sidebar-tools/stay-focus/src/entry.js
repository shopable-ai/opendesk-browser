// Vite only packages the existing one-root React implementation. No second UI.
import './style.css';
import {createFocusController} from '../trusted/focus-controller.js';
Object.defineProperty(globalThis,'__opendeskCreateFocusController',{
  value:createFocusController,writable:false,configurable:false
});
import './main.js';
