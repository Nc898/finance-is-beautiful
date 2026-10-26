/**
 * The introduction every demonstration opens with: a short explanation (what the demonstration shows, how to read
 * the picture, the ideas in it, and how to use it) over the scene, which is blurred behind it, with a button to
 * start exploring. The scene waits at its starting point, paused, until the viewer presses Play.
 *
 * It shows the first time each demonstration is opened in a browser session (remembered in sessionStorage); the
 * page's "About this demo" button opens it again at any time. The markup lives in each page (a <dialog class="intro">
 * with a form method="dialog" and its button); this module only opens and closes it. A native modal dialog keeps the
 * keyboard inside it and closes on Escape.
 */

export interface IntroOptions {
  /** Which demonstration (the key it is remembered under for the session). */
  slug: string;
  dialog: HTMLDialogElement;
  /** Opens it again (the page's "About this demo" button). */
  openButton?: HTMLElement | null;
  /** Called each time it closes (by its button, Escape, or a click on the blurred scene). */
  onClose?: () => void;
}

export interface Intro {
  open(): void;
  readonly isOpen: boolean;
}

const seenKey = (slug: string): string => `fib-intro-seen:${slug}`;

function seen(slug: string): boolean {
  try {
    return sessionStorage.getItem(seenKey(slug)) === '1';
  } catch {
    return false;
  }
}

function markSeen(slug: string): void {
  try {
    sessionStorage.setItem(seenKey(slug), '1');
  } catch {
    /* storage unavailable (a private window, say): it simply shows again next time */
  }
}

export function setupIntro(o: IntroOptions): Intro {
  const d = o.dialog;
  const open = (): void => {
    if (d.open) return;
    document.documentElement.classList.add('intro-open');
    d.showModal();
    // the button to proceed has the focus, so Enter starts exploring
    d.querySelector<HTMLElement>('[data-intro-close]')?.focus();
  };
  d.addEventListener('close', () => {
    document.documentElement.classList.remove('intro-open');
    markSeen(o.slug);
    o.onClose?.();
  });
  // a click on the blurred scene (the backdrop, outside the card) closes it too
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
  o.openButton?.addEventListener('click', open);
  if (!seen(o.slug)) open();
  return {
    open,
    get isOpen() {
      return d.open;
    },
  };
}
