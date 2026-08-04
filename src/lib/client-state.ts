/**
 * État client partagé entre composants Astro.
 *
 * Les `<script>` de chaque composant sont des bundles séparés : on ne peut pas
 * partager de module state classique. On attache donc un unique objet d'état
 * sur `window` (`window.__sc`) et on communique par Custom Events.
 */

export interface PayloadFile {
  path: string;
  content: string;
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
  images?: { url: string; alt: string }[];
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

/** Bascule mobile : affiche l'onglet « Aperçu & Déploiement ». */
export function switchToWorkspaceTab(): void {
  const tab = document.getElementById('tab-workspace') as HTMLInputElement | null;
  if (tab) tab.checked = true;
}

export function switchToChatTab(): void {
  const tab = document.getElementById('tab-chat') as HTMLInputElement | null;
  if (tab) tab.checked = true;
}
