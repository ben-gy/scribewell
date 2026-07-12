/**
 * UI helpers — DOM building, icons, toast, modals. No business logic.
 */

export function h(
  tag: string,
  attrs: Record<string, string | null> = {},
  ...kids: (Node | string)[]
): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids) {
    el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return el;
}

export function mount(): HTMLElement {
  const el = document.getElementById('app');
  if (!el) throw new Error('#app not found');
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[i]}`;
}

// ---------- icons ----------

const ICONS = {
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  wave: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><line x1="3" y1="10" x2="3" y2="14"/><line x1="7" y1="6" x2="7" y2="18"/><line x1="11" y1="9" x2="11" y2="15"/><line x1="15" y1="4" x2="15" y2="20"/><line x1="19" y1="8" x2="19" y2="16"/><line x1="22" y1="11" x2="22" y2="13"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="11.49"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
};

export function icon(name: keyof typeof ICONS, cls = ''): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.innerHTML = ICONS[name];
  const svg = wrapper.firstElementChild as SVGElement;
  if (cls) svg.setAttribute('class', cls);
  return svg as unknown as HTMLElement;
}

// ---------- toast ----------

let toastEl: HTMLElement | null = null;
let toastTimer: number | null = null;

export function toast(msg: string): void {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove('visible'), 2200);
}

// ---------- modal ----------

export function openModal(content: DocumentFragment | HTMLElement): void {
  const closeBtn = h('button', { class: 'modal-close', type: 'button', 'aria-label': 'close' }, '×');
  const panel = h('div', { class: 'modal-panel', role: 'document' }, closeBtn);
  panel.appendChild(content as unknown as Node);
  const overlay = h('div', { class: 'modal-overlay', role: 'dialog', 'aria-modal': 'true' }, panel);

  const previouslyFocused = document.activeElement as HTMLElement | null;
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  const close = () => {
    overlay.remove();
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey);
    previouslyFocused?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => closeBtn.focus());
}

export function initModalTriggers(): void {
  document.querySelectorAll<HTMLElement>('[data-modal]').forEach((trigger) => {
    const open = () => {
      const id = trigger.dataset.modal;
      if (!id) return;
      const tmpl = document.getElementById(id) as HTMLTemplateElement | null;
      if (!tmpl) return;
      openModal(tmpl.content.cloneNode(true) as DocumentFragment);
    };
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      open();
    });
    trigger.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}
