export const SERVER_SETTINGS_SAVE_MIN_UI_MS = 750;
export const SERVER_SETTINGS_SAVE_SUCCESS_VISIBLE_MS = 1600;
export const SERVER_SETTINGS_SAVE_BAR_EXIT_MS = 420;

export async function waitUntilMinServerSettingsSaveUi(startedAtMs: number) {
  const elapsed = Date.now() - startedAtMs;
  const remaining = SERVER_SETTINGS_SAVE_MIN_UI_MS - elapsed;
  if (remaining <= 0) return;
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, remaining);
  });
}

export function waitMs(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}
