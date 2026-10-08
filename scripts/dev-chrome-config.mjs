import {createHash} from 'node:crypto';
import path from 'node:path';

// Interactive developer loops and independent native acceptance are separate
// Chrome profiles. The latter must continue to use fresh launcher-owned profiles.
export function developmentProfilePath({home, workspace, name = 'primary'}) {
  if (typeof home !== 'string' || !path.isAbsolute(home) ||
      typeof workspace !== 'string' || !path.isAbsolute(workspace))
    throw new TypeError('Profile home and workspace must be absolute paths');
  if (typeof name !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(name))
    throw new TypeError('Developer profile name must be a bounded safe identifier');
  const fingerprint = createHash('sha256').update(path.normalize(workspace)).digest('hex').slice(0, 12);
  return path.join(path.normalize(home), '.opendesk-browser', 'dev-profiles',
    name + '-' + fingerprint);
}

export function developmentChromeArgs({profile, extension}) {
  if (typeof profile !== 'string' || !path.isAbsolute(profile) ||
      typeof extension !== 'string' || !path.isAbsolute(extension))
    throw new TypeError('Profile and extension paths must be absolute');
  if (path.resolve(profile) === path.parse(profile).root)
    throw new TypeError('Refusing to use the filesystem root as a Chrome profile');
  return [
    '--use-mock-keychain',
    '--password-store=basic',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    '--load-extension=' + extension,
    '--disable-extensions-except=' + extension,
    'about:blank'
  ];
}
