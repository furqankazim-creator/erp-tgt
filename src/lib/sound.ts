// Browsers refuse to play audio until the page has had a real user gesture
// (click/keydown/touch) — an <audio> element played on a background timer
// (like a notification poll) is silently blocked otherwise. So: keep one
// shared element, and "unlock" it the moment the user interacts with the
// page at all (play + immediately pause, inside that real gesture), well
// before any real notification needs to play.

const NOTIFICATION_SOUND_URL = "/sounds/fahhhhh.mp3";

let audio: HTMLAudioElement | null = null;
let armed = false;
let playing = false;

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audio) {
    audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 1;
    audio.addEventListener("ended", () => {
      playing = false;
    });
  }
  return audio;
}

/** Call once (e.g. on app shell mount) — wires a one-time listener on the
 * very first click/keydown/touch anywhere on the page so audio is unlocked
 * well before the first real notification ever needs to play. */
export function armNotificationSound() {
  if (armed || typeof document === "undefined") return;
  armed = true;
  const unlock = () => {
    const el = getAudio();
    if (!el) return;
    // Play-then-immediately-pause inside a real user gesture is the
    // standard trick to unlock an <audio> element for later, gesture-free
    // playback (e.g. from a polling timer).
    el.play()
      .then(() => {
        el.pause();
        el.currentTime = 0;
      })
      .catch(() => {
        // Unlock attempt itself was blocked — later real plays will just
        // silently no-op too, which is fine; the bell badge still shows.
      });
  };
  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
}

/** Plays the notification sound. Silently no-ops if audio hasn't been
 * unlocked yet, and ignores a call that arrives while it's already
 * sounding — two calls landing close together must never overlap. */
export function playNotificationChime() {
  const el = getAudio();
  if (!el) return;
  if (playing) return;
  playing = true;
  el.currentTime = 0;
  el.play().catch(() => {
    playing = false; // blocked (not unlocked yet) — nothing to clean up
  });
}
