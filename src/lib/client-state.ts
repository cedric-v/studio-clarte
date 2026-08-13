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
  /** True when the human manually edited the content in the preview panel. */
  modified?: boolean;
  /** Pre-edit repo content (existing files) — powers the Diff view. */
  original?: string;
  /** Snapshot of the content before the first manual edit (new files). */
  diffBase?: string;
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
  /** True once the production deploy succeeded (post-merge tracking). */
  published?: boolean;
  /**
   * Direct page links (from the draft's frontmatter permalinks) at the time
   * the preview PR was created — persisted so the publish-success links keep
   * working even if the local draft/payload is later cleared or lost.
   */
  pageLinks?: { path: string; url: string; title: string }[];
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

const STORAGE_KEY = 'sc:state';

export function getState(): ScState {
  if (!window.__sc) {
    window.__sc = { messages: [], payload: null, workflow: null };
    restoreState(window.__sc);
  }
  return window.__sc;
}

/**
 * Persists the shared state to sessionStorage so a page REFRESH survives
 * (draft files, chat history and the open PR). Per-tab by design — C3
 * (server-side KV snapshot, cross-device) remains a documented future step.
 */
/** Clears the shared state and the persisted copy (session reset). */
export function resetState(): void {
  // ⚠️ MUTATE IN PLACE — components captured the same object reference at
  // startup (`const state = getState()`). Replacing the object would leave
  // them pointing at the OLD state: the chat pane kept rendering the stale
  // messages after reset, and new messages/payloads were pushed to an
  // orphaned object that `persistState()` (which re-reads window.__sc) never
  // saved. In-place mutation keeps every captured reference in sync.
  if (window.__sc) {
    window.__sc.messages = [];
    window.__sc.payload = null;
    window.__sc.workflow = null;
  } else {
    window.__sc = { messages: [], payload: null, workflow: null };
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function persistState(): void {
  const state = window.__sc;
  if (!state) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded (large data-URL image previews) → strip the previews
    // and retry once (the payload itself stays intact).
    try {
      const slim: ScState = {
        ...state,
        messages: state.messages.map((message) => ({
          ...message,
          images: message.images?.map((img) => ({ url: img.url, ref: img.ref, alt: img.alt })),
        })),
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch {
      // Give up silently (best effort).
    }
  }
}

function restoreState(target: ScState): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<ScState>;
    if (Array.isArray(parsed.messages)) target.messages = parsed.messages;
    if (parsed.payload && Array.isArray(parsed.payload.files)) {
      target.payload = parsed.payload as GeneratedPayload;
    }
    if (parsed.workflow && typeof parsed.workflow.prNumber === 'number') {
      target.workflow = parsed.workflow as WorkflowState;
    }
  } catch {
    // Corrupted storage → ignore.
  }
}

export function emit(name: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on(name: string, handler: (detail: any) => void): void {
  window.addEventListener(name, ((event: CustomEvent) => handler(event.detail)) as EventListener);
}

/** Optional action rendered as a button inside a toast (e.g. "Undo"). */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export function toast(
  message: string,
  type: 'info' | 'success' | 'error' = 'info',
  action?: ToastAction,
): void {
  emit('sc:toast', { message, type, action });
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
