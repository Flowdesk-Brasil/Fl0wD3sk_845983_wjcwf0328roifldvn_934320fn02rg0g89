const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;

export type PasswordPolicyFeedback = {
  minLengthMet: boolean;
  maxLengthMet: boolean;
  hasLowercase: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  hasControlCharacters: boolean;
  score: number;
};

export function evaluatePasswordPolicy(password: string): PasswordPolicyFeedback {
  const value = typeof password === "string" ? password : "";
  const hasLowercase = /[a-z]/.test(value);
  const hasUppercase = /[A-Z]/.test(value);
  const hasNumber = /\d/.test(value);
  const hasSymbol = /[^A-Za-z0-9\s]/.test(value);
  const hasControlCharacters = /[\u0000-\u001F\u007F]/.test(value);
  const score = [
    value.length >= MIN_PASSWORD_LENGTH,
    value.length >= Math.min(10, MAX_PASSWORD_LENGTH),
    value.length >= Math.min(16, MAX_PASSWORD_LENGTH),
    !hasControlCharacters,
  ].filter(Boolean).length;

  return {
    minLengthMet: value.length >= MIN_PASSWORD_LENGTH,
    maxLengthMet: value.length <= MAX_PASSWORD_LENGTH,
    hasLowercase,
    hasUppercase,
    hasNumber,
    hasSymbol,
    hasControlCharacters,
    score,
  };
}

export function validatePasswordPolicy(
  password: string,
  confirmPassword?: string | null,
) {
  const value = typeof password === "string" ? password : "";
  const feedback = evaluatePasswordPolicy(value);

  if (!feedback.minLengthMet) {
    return `Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres na senha.`;
  }

  if (!feedback.maxLengthMet) {
    return `A senha ultrapassa o limite de ${MAX_PASSWORD_LENGTH} caracteres.`;
  }

  if (feedback.hasControlCharacters) {
    return "A senha contem caracteres invalidos. Remova caracteres de controle e tente novamente.";
  }

  if (typeof confirmPassword === "string" && value !== confirmPassword) {
    return "A confirmacao da senha nao confere.";
  }

  return null;
}

export function getPasswordPolicyChecklist(password: string) {
  const feedback = evaluatePasswordPolicy(password);

  return [
    {
      id: "password-length",
      label: `Minimo de ${MIN_PASSWORD_LENGTH} caracteres`,
      valid: feedback.minLengthMet,
    },
    {
      id: "password-max-length",
      label: `Ate ${MAX_PASSWORD_LENGTH} caracteres`,
      valid: feedback.maxLengthMet,
    },
  ];
}
