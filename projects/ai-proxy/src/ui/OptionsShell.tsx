import * as React from 'react';
import type { ReactNode } from 'react';
import type { OptionsSection } from './optionsRoute';

/**
 * Section header shared by all Settings routes. The OpenDesk host owns the
 * tool title; section headings use h2 inside the sidebar workspace.
 */
export function OptionsPageHeader({
  title, titleId, description, eyebrow, badge, actions, className = ''
}: {
  title: ReactNode;
  titleId?: string;
  description: string;
  eyebrow?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return <header className={['panelHead','optionsPageHead',className].filter(Boolean).join(' ')}>
    <div className="panelHeadIntro">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <div className="optionsTitleRow">
        <h2 id={titleId}>{title}{typeof badge === 'number' && <span className="countTag">{badge}</span>}</h2>
        {actions && <div className="panelHeadActions">{actions}</div>}
      </div>
      <p className="hint">{description}</p>
      {typeof badge !== 'number' && badge && <span className="subtleTag">{badge}</span>}
    </div>
  </header>;
}

export function OptionsNavIcon({ section }: { section: OptionsSection }) {
  const common = {stroke: 'currentColor', strokeWidth: 1.75,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  return <svg className="optionsNavIcon" width="18" height="18" viewBox="0 0 24 24"
    fill="none" aria-hidden="true" focusable="false" {...common}>
    {section === 'profiles' ? <>
      <rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/>
      <path d="M7 7h.01M7 17h.01"/>
    </> : section === 'rules' ? <>
      <path d="M6 4h7a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h9"/><circle cx="6" cy="4" r="2"/><circle cx="18" cy="20" r="2"/>
    </> : section === 'subscriptions' ? <>
      <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>
    </> : section === 'backup' ? <>
      <path d="M3 6h6l2 2h10v11H3z"/>
    </> : section === 'diagnostic' ? <>
      <rect x="2" y="3" width="20" height="13" rx="2"/><path d="M8 21h8m-4-5v5"/>
    </> : section === 'general' ? <>
      <circle cx="12" cy="12" r="3"/><path d="m10 2 4 0 .6 2.3 2 1 2.3-.9 2 3.2-1.5 1.9v2.6l1.5 1.9-2 3.2-2.3-.9-2 1L14 21h-4l-.6-2.3-2-1-2.3.9-2-3.2L4.6 13.5v-3l-1.5-1.9 2-3.2 2.3.9 2-1z"/>
    </> : <>
      <circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>
    </>}
  </svg>;
}
