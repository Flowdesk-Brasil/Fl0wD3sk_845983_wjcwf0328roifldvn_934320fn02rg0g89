export const DEFAULT_NICKNAME_FORMAT = "{nome} | {ID}";
export const NICKNAME_FORMAT_MAX = 80;

export function normalizeNicknameFormat(value: unknown): string {
  const text = String(value || "").trim().slice(0, NICKNAME_FORMAT_MAX);
  if (!text) return DEFAULT_NICKNAME_FORMAT;
  if (!/\{nome\}/i.test(text) && !/\{id\}/i.test(text)) {
    return DEFAULT_NICKNAME_FORMAT;
  }
  return text;
}

export function applyNicknameFormat(format: string, nome: string, id: string): string {
  const safeId = String(id || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 32);
  const safeNome = String(nome || "Jogador")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32) || "Jogador";

  const template = normalizeNicknameFormat(format);
  const withId = template.replace(/\{id\}/gi, safeId);
  const overhead = withId.replace(/\{nome\}/gi, "").length;
  const nomeBudget = Math.max(1, 32 - overhead);
  return withId
    .replace(/\{nome\}/gi, safeNome.slice(0, nomeBudget))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
}

export function previewNicknameFormat(format: string): string {
  return applyNicknameFormat(format, "Jogador", "15");
}
