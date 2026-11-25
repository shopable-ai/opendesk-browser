import {readExtensionAboutFields,readExtensionAboutLink} from '../extension-about-metadata.js';

export function describeExtensionAbout({kind,installed,record,release}) {
  const source=installed?(kind==='page'?record?.installed:record):release;
  if(!source)return null;
  const {author,homepage,supportUrl}=readExtensionAboutFields(source);
  const version=typeof source.version==='string'&&source.version.trim()&&
    source.version.length<=128&&!/[\p{Cc}\p{Cf}]/u.test(source.version)?source.version:null;
  const links=[['homepage',homepage],['supportUrl',supportUrl===homepage?null:supportUrl]]
    .flatMap(([key,value])=>{
      const url=readExtensionAboutLink(value);
      return url?[{key,href:url.href,hostname:url.hostname}]:[];
    });
  // An official resource or matching digest alone does not attest a publisher.
  return {version,author,links,versionLabel:installed?'installedVersion':
    release.status==='blocked'?'releaseVersion':'installableVersion'};
}
