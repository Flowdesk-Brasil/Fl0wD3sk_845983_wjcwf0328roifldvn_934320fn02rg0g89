export function stablePersistJson(value: unknown) {
  return JSON.stringify(value);
}

export function arePersistSnapshotsEqual<T>(left: T, right: T) {
  return stablePersistJson(left) === stablePersistJson(right);
}

export type UnchangedPersistResponse<TSettings> = {
  ok: true;
  unchanged: true;
  settings: TSettings;
};

export function buildUnchangedPersistResponse<TSettings>(
  settings: TSettings,
): UnchangedPersistResponse<TSettings> {
  return {
    ok: true,
    unchanged: true,
    settings,
  };
}
