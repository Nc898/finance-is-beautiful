/**
 * Let the browser breathe between steps of a long paint (input, the loader's animation, a frame if one is due), then
 * carry on as soon as possible.
 *
 * The scenes used to yield with `setTimeout(r, 0)`. Browsers clamp nested zero-delay timeouts to at least 4 ms, and a
 * scene build yields hundreds of times, so that alone left 0.6 to 0.75 s of idle time in each of the slower builds.
 * `scheduler.yield()` (where the browser has it) and a MessageChannel task (elsewhere) aren't clamped.
 */

type Scheduler = { yield?: () => Promise<void> };

const channel: MessageChannel | null = typeof MessageChannel === 'undefined' ? null : new MessageChannel();
const waiting: (() => void)[] = [];
if (channel) channel.port1.onmessage = () => waiting.shift()?.();

export function yieldTask(): Promise<void> {
  const sched = (globalThis as unknown as { scheduler?: Scheduler }).scheduler;
  if (sched?.yield) return sched.yield();
  if (channel) {
    return new Promise<void>((r) => {
      waiting.push(r);
      channel.port2.postMessage(0);
    });
  }
  return new Promise<void>((r) => setTimeout(r, 0));
}
