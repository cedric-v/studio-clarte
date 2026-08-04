/**
 * Shared client state between Astro components.
 *
 * Each component's `<script>` is a separate bundle: classic module state cannot
 * be shared. We therefore attach a single state object to `window`
 * (`window.__sc`) and communicate through Custom Events.
 */

export interface PayloadFile {
  path: string;
  content: string;
  /** True when content is base64-encoded binary (e.g. a Git-fallback image). */
  base64?: boolean;
}

export interface GeneratedPayload {
  title: string;
  summary: string;
  files: PayloadFile[];
}

export interface WorkflowState {
  siteId: string;
  prNumber: number;
  prUrl: string;
  branch: string;
}

export interface ScState {
  messages: ChatMessage[];
  payload: GeneratedPayload | null;
  workflow: WorkflowState | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Attached images: R2 mode uses `url`, Git mode uses `dataUrl` + `ref`. */
  images?: { url?: string; dataUrl?: string; ref?: string; alt: string }[];
  payload?: boolean;
}

declare global {
  interface Window {
    __sc?: ScState;
  }
}

export function getState(): ScState {
  window.__sc ??= { messages: [], payload: null, workflow: null };
  return window.__sc;
}

export function emit(name: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on(name: string, handler: (detail: any) => void): void {
  window.addEventListener(name, ((event: CustomEvent) => handler(event.detail)) as EventListener);
}

export function toast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  emit('sc:toast', { message, type });
}

/** Mobile switch: shows the "Preview & Deploy" tab. */
export function switchToWorkspaceTab(): void {
  const tab = document.getElementById('tab-workspace') as HTMLInputElement | null;
  if (tab) tab.checked = true;
}

export function switchToChatTab(): void {
  const tab = document.getElementById('tab-chat') as HTMLInputElement | null;
  if (tab) tab.checked = true;
}
