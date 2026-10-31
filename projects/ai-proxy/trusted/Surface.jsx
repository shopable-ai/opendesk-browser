import * as React from 'react';
import App from '../src/App.jsx';
import css from '../src/style.css?inline';

// Fixed first-party presentation, shared verbatim by the trusted portal and
// offline Preview. No installed bytes or privileges enter this component.
export default function AIProxySurface() {
  return <><style data-ai-proxy-css="">{css}</style><App/></>;
}
