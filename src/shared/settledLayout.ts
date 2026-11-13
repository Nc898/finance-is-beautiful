/**
 * Resolves once the page's web fonts have loaded and a frame has passed, so the bands the app measures with them
 * (titles, notes, labels: the scene's insets) are final.
 *
 * A scene build depends on its insets. Started before the fonts land, it was painted at one size and then thrown away
 * when the labels grew a few pixels: about 1.5 s of wasted painting in Bread and Butter. A build that waits for this
 * starts once, at its final size; a change of insets in the meantime cancels it before it has painted anything.
 */
let settled: Promise<void> | null = null;

export function settledLayout(): Promise<void> {
  settled ??= (async () => {
    try {
      if (typeof document !== 'undefined' && document.fonts) await document.fonts.ready;
    } catch {
      /* no font loading API: carry on */
    }
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  })();
  return settled;
}
