import * as React from 'react';
import App from '../src/App.jsx';

// Fixed first-party presentation, shared verbatim by the trusted portal and
// offline Preview. No installed bytes or privileges enter this component.
// Keep the link in the portal, after the Host styles, with the same lifetime
// as the old style element. React hoists stylesheet links with precedence.
export default function AIProxySurface({surface='side-panel',previewCss}={}) {
  return <>{previewCss===undefined
    ?<link rel="stylesheet" href="ui/ai-proxy.css" data-ai-proxy-css=""/>
    :<style data-ai-proxy-css="">{previewCss}</style>}<App surface={surface}/></>;
}
