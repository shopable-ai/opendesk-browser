import * as React from 'react';
import {extensionAboutText} from '../../extension-about-localization.js';

export function ExtensionAbout({model,locale}) {
  if(!model)return null;
  const t=key=>extensionAboutText(locale,key);
  const trusted=event=>{if(!event.nativeEvent.isTrusted)event.preventDefault();};
  return <details className="od-disclosure ec-extension-about" open>
    <summary><span>{t('title')}</span></summary>
    <dl>
      <div><dt>{t(model.versionLabel)}</dt><dd>{model.version||t('unknownVersion')}</dd></div>
      {model.author&&<div><dt>{t('author')}</dt><dd>{model.author}</dd></div>}
      {model.links.map(({key,href,hostname})=><div key={key}>
        <dt>{t(key)}</dt><dd><a href={href} target="_blank" rel="noopener noreferrer"
          referrerPolicy="no-referrer" aria-label={t(key)+' · '+hostname+' · '+t('newTab')}
          onClick={trusted} onAuxClick={trusted}>{hostname}</a> <small>{t('newTab')}</small></dd>
      </div>)}
    </dl>
  </details>;
}
