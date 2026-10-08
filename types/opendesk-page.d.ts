/**
 * OpenDesk Browser Page API R5.1 — ordinary JavaScript executed by the
 * extension's admitted async main() Worker, NOT node:playwright.
 * Capability version: 1.0.0-r5.1. See docs/framework/modern-page-api.zh-CN.md.
 */
export type OpenDeskRole =
  'button'|'link'|'textbox'|'searchbox'|'checkbox'|'radio'|'combobox'|'option'|
  'heading'|'dialog'|'form'|'region'|'list'|'listitem'|'table'|'row'|'cell'|
  'columnheader'|'rowheader'|'img'|'article'|'navigation'|'main'|'banner'|
  'contentinfo'|'status'|'alert';

export interface TextMatchOptions { exact?: boolean; }
export interface RoleMatchOptions extends TextMatchOptions { name?: string; }
export interface LocatorTimeOptions { timeout?: number; }
export interface LocatorWaitOptions extends LocatorTimeOptions {
  state?: 'attached'|'detached'|'visible'|'hidden';
}
export interface OpenDeskLocator {
  locator(css: string): OpenDeskLocator;
  getByRole(role: OpenDeskRole, options?: RoleMatchOptions): OpenDeskLocator;
  getByLabel(text: string, options?: TextMatchOptions): OpenDeskLocator;
  getByText(text: string, options?: TextMatchOptions): OpenDeskLocator;
  getByTestId(id: string): OpenDeskLocator;
  /** DOM .click(), not trusted input. Requires a unique, visible, enabled, stable, unobscured in-viewport element. */
  click(options?: LocatorTimeOptions): Promise<void>;
  /** Replace entire editable input/textarea value; focus + synthetic input/change on changes. */
  fill(value: string, options?: LocatorTimeOptions): Promise<void>;
  /** Instant count; no waiting and no strict-single rule. */
  count(): Promise<number>;
  /** Current node.textContent, requires exactly one element; options currently empty. */
  textContent(options?: Record<never, never>): Promise<string | null>;
  /** Current attribute value, requires exactly one element; options currently empty. */
  getAttribute(name: string, options?: Record<never, never>): Promise<string | null>;
  /** Poll without page-side effects; hidden/detached succeed when absent. */
  waitFor(options?: LocatorWaitOptions): Promise<void>;
}
export interface ObservationOptions {
  /** Native CSS root selector, default "body". */
  root?: string;
  maxDepth?: number; // 1–8; default 5
  maxNodes?: number; // 1–200; default 80
  maxChars?: number; // 256–16000; default 10000
}
export interface LocatorDescriptor {
  kind: 'css'|'role'|'label'|'text'|'testId';
  value: string;
  name?: string;
  exact?: boolean;
  parent?: LocatorDescriptor;
}
export interface ObservedElement {
  role: OpenDeskRole | null;
  name: string;
  text: string;
  state: {visible: boolean; disabled: boolean; readOnly: boolean; expanded?: string; checked?: string; selected?: boolean};
  scope: {tag: string; id: string | null} | null;
  /** Null when a unique matching locator could not be verified. */
  locator: LocatorDescriptor | null;
}
export interface PageObservation {
  kind: 'semantic-dom-summary';
  version: '1.0.0-r5.1';
  document: {documentId: string | null; targetVersion: number | null; url: string | null};
  root: string;
  nodes: ObservedElement[];
  truncated: boolean;
  /** Bounded traversal and exact runtime locator validation counters. */
  budget: {maxDepth: number; maxNodes: number; maxChars: number;
    maxVisited: number; visited: number; locatorChecks: number; maxLocatorChecks: number};
}
export interface ModernPageCapabilities {
  readonly version: '1.0.0-r5.1';
  readonly selectorEngine: string;
  readonly input: 'untrusted-isolated-dom';
  readonly locator: readonly string[];
  readonly actions: readonly string[];
  readonly reads: readonly string[];
  readonly observation: 'semantic-dom-summary';
  readonly unsupported: readonly string[];
}
export interface OpenDeskPage {
  locator(css: string): OpenDeskLocator;
  getByRole(role: OpenDeskRole, options?: RoleMatchOptions): OpenDeskLocator;
  getByLabel(text: string, options?: TextMatchOptions): OpenDeskLocator;
  getByText(text: string, options?: TextMatchOptions): OpenDeskLocator;
  getByTestId(id: string): OpenDeskLocator;
  observe(options?: ObservationOptions): Promise<PageObservation>;
  readonly modernCapabilities: ModernPageCapabilities;
}
declare global {
  /** Injected by the admitted OpenDesk Browser Worker, not imported from npm. */
  const page: OpenDeskPage;
  /** Caller-supplied task parameters. */
  const params: Readonly<Record<string, unknown>>;
}
