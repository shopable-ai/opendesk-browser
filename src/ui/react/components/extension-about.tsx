import * as React from 'react';
import {extensionAboutText} from '../../extension-about-localization.js';

export function ExtensionAbout({model,locale}) {
  const heading=React.useId();
  if(!model)return null;
  const t=key=>extensionAboutText(locale,key);
  const trusted=event=>{if(!event.nativeEvent.isTrusted)event.preventDefault();};
  return <section className="ec-detail-card ec-extension-about" aria-labelledby={heading}>
    <h3 id={heading}>{t('title')}</h3>
    <dl>
      <div><dt>{t(model.versionLabel)}</dt><dd>{model.version||t('unknownVersion')}</dd></div>
      {model.revision!==null&&<div><dt>{t('revision')}</dt><dd>r{model.revision}</dd></div>}
      {model.author&&<div><dt>{t('author')}</dt><dd>{model.author}</dd></div>}
      {model.links.map(({key,href,hostname})=><div key={key}>
        <dt>{t(key)}</dt><dd><a href={href} target="_blank" rel="noopener noreferrer"
          referrerPolicy="no-referrer" aria-label={t(key)+' · '+hostname+' · '+t('newTab')}
          onClick={trusted} onAuxClick={trusted}>{hostname}</a> <small>{t('newTab')}</small></dd>
      </div>)}
    </dl>
  </section>;
}
