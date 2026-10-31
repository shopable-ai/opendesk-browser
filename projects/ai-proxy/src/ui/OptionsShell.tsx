import type { ReactNode } from 'react';
import type { OptionsSection } from './optionsRoute';

/**
 * Section header shared by all Settings routes. The OpenDesk host owns the
 * tool title; section headings use h2 inside the sidebar workspace.
 */
export function OptionsPageHeader({
  title, titleId, description, eyebrow, badge, actions, className = ''
}: {
  title: string;
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
      <h2 id={titleId}>{title}</h2>
      <p className="hint">{description}</p>
      {badge && <span className="subtleTag">{badge}</span>}
    </div>
    {actions && <div className="panelHeadActions">{actions}</div>}
  </header>;
}

export function OptionsNavIcon({ section }: { section: OptionsSection }) {
  const common = {stroke: 'currentColor', strokeWidth: 1.75,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  return <svg className="optionsNavIcon" width="18" height="18" viewBox="0 0 24 24"
    fill="none" aria-hidden="true" focusable="false" {...common}>
    {section === 'profiles' ? <>
      <rect x="3" y="4" width="18" height="16" rx="3"/>
      <path d="M7 9h10M7 14h7M17 13v4"/>
    </> : section === 'rules' ? <>
      <path d="M5 4v16M5 8h12l-3-3m3 3-3 3M5 16h13l-3-3m3 3-3 3"/>
    </> : section === 'subscriptions' ? <>
      <path d="M4 7h13M4 12h16M4 17h11M17 4l3 3-3 3"/>
    </> : section === 'backup' ? <>
      <path d="M12 3v12m0 0-4-4m4 4 4-4M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>
    </> : section === 'diagnostic' ? <>
      <path d="M3 12h4l3-7 4 14 3-7h4"/>
    </> : section === 'general' ? <>
      <path d="M4 7h16M4 12h16M4 17h16"/>
      <circle cx="9" cy="7" r="2" fill="var(--surface)"/>
      <circle cx="15" cy="12" r="2" fill="var(--surface)"/>
      <circle cx="9" cy="17" r="2" fill="var(--surface)"/>
    </> : <>
      <path d="m12 2 8 4v5c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V6z"/>
      <path d="m9 12 2 2 4-4"/>
    </>}
  </svg>;
}
