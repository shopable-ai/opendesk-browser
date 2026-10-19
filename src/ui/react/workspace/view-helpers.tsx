import * as React from 'react';
import {flushSync} from 'react-dom';
import {getLocale, getLocalePreference, subscribeLocale} from '../../../i18n/index.js';
import {recoverControlFocus} from '../../../native-agent/control-focus.js';

export type Store<T> = {subscribe: (listener: () => void) => () => void; getSnapshot: () => T};

// Include the preference: switching from “auto” to its resolved language must also update the select.
const localeSnapshot = () => `${getLocale()}:${getLocalePreference()}`;
export function useWorkspaceLocale() {
  return React.useSyncExternalStore(subscribeLocale, localeSnapshot, localeSnapshot);
}

// Keep DOM focus ownership in the React event boundary, outside the domain controller.
export function useControlAction(editor: React.RefObject<HTMLTextAreaElement | null>) {
  const [, render] = React.useReducer(value => value + 1, 0);
  const pending = React.useRef(new Set<ReturnType<typeof recoverControlFocus>>());
  React.useEffect(() => () => {for (const recovery of pending.current) recovery.restore(false); pending.current.clear();}, []);
  return (event: React.SyntheticEvent<HTMLElement>, action: () => unknown) => {
    const recovery = recoverControlFocus(event.currentTarget.ownerDocument, editor.current);
    pending.current.add(recovery);
    let result: unknown;
    try {
      // Commit disabled controls before recording whether Chrome took focus away.
      flushSync(() => {result = action();});
      recovery.disabled();
    } catch (error) {
      recovery.restore(false); pending.current.delete(recovery); throw error;
    }
    const finish = () => {
      if (!pending.current.delete(recovery)) return;
      flushSync(() => render());
      recovery.restore(true);
    };
    return Promise.resolve(result).then(finish, finish);
  };
}

const page = ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6'];
const paths = {
  refresh: ['M20 11a8 8 0 0 0-14-5L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0 0 14 5l2-2', 'M20 20v-4h-4'],
  settings: ['M4 7h9m4 0h3M4 17h2m4 0h10', 'M17 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0', 'M10 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0'],
  sidebar: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M15 3v18'],
  back: ['m12 19-7-7 7-7M5 12h14'],
  collapse: ['m7 10 5-5 5 5', 'm7 17 5-5 5 5'],
  chevron: ['m9 18 6-6-6-6'],
  copy: ['M10 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z', 'M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3'],
  discard: ['M3 6h18M8 6V4h8v2m-10 0 1 14h10l1-14M10 10v7m4-7v7'],
  save: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z', 'M17 21v-8H7v8M7 3v5h8'],
  external: ['M15 3h6v6M10 14 21 3', 'M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6'],
  folder: ['M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4.6a2 2 0 0 1 1.6.8L12.8 8H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z'],
  'folder-open': ['M2 10V6a2 2 0 0 1 2-2h4.6a2 2 0 0 1 1.6.8L12.8 8H20a2 2 0 0 1 2 2v1', 'M3 13h18l-2.5 7H5.5Z'],
  file: page,
  text: [...page, 'M8 12h8', 'M8 16h8', 'M8 19h5'],
  markdown: [...page, 'M8 17v-5l2.5 3 2.5-3v5', 'M15 13v4'],
  code: [...page, 'm10 12-2 2 2 2', 'm14 12 2 2-2 2'],
  json: [...page, 'M10 12H9c-1 0-1 1-1 2s0 2-1 2h3', 'M14 12h1c1 0 1 1 1 2s0 2 1 2h-3'],
  style: [...page, 'M8 12h8', 'M8 16h5', 'M15 16v3'],
  markup: [...page, 'm10 12-2 2 2 2', 'm14 12 2 2-2 2'],
};

export function WorkspaceIcon({name, ...props}: React.SVGProps<SVGSVGElement> & {name: keyof typeof paths}) {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {paths[name].map(d => <path key={d} d={d} />)}
  </svg>;
}
