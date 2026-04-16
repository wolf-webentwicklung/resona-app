// ══════════════════════════════════════════
// Haptic Feedback
// Uses navigator.vibrate() — works on Android + some browsers
// Silently no-ops on unsupported devices (iOS Safari)
// ══════════════════════════════════════════

var can = typeof navigator !== 'undefined' && 'vibrate' in navigator;

export function hapticTap() { if (can) navigator.vibrate(8); }
export function hapticLight() { if (can) navigator.vibrate(15); }
export function hapticMedium() { if (can) navigator.vibrate(30); }
export function hapticHeavy() { if (can) navigator.vibrate(50); }
export function hapticReveal() { if (can) navigator.vibrate([30, 50, 60, 50, 80]); }
export function hapticMoment() { if (can) navigator.vibrate([20, 80, 20, 80, 40]); }
export function hapticSend() { if (can) navigator.vibrate([15, 40, 25]); }
export function hapticProximity(intensity) {
  // intensity 0-1, stronger as you get closer
  if (!can || intensity < 0.2) return;
  navigator.vibrate(Math.round(5 + intensity * 25));
}
export function hapticWakePeak() { if (can) navigator.vibrate([8, 25, 15]); }
export function hapticFollowPulse() { if (can) navigator.vibrate(12); }
export function hapticFollowComplete() { if (can) navigator.vibrate([20, 40, 30, 40, 50]); }
