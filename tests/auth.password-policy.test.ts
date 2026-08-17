import assert from "node:assert/strict";
import test from "node:test";
import {
  getPasswordPolicyChecklist,
  validatePasswordPolicy,
} from "../lib/auth/passwordPolicy.ts";

test("native signup accepts any password with at least six characters", () => {
  assert.equal(validatePasswordPolicy("abcdef", "abcdef"), null);
  assert.equal(validatePasswordPolicy("123456", "123456"), null);
  assert.equal(validatePasswordPolicy("!!!!!!", "!!!!!!"), null);
});

test("native signup rejects only length, control characters, and mismatch", () => {
  assert.match(validatePasswordPolicy("abcde", "abcde") || "", /6 caracteres/i);
  assert.match(
    validatePasswordPolicy("abcdef", "abcdefg") || "",
    /confirmacao/i,
  );
  assert.match(
    validatePasswordPolicy("abc\u0000def", "abc\u0000def") || "",
    /caracteres invalidos/i,
  );
});

test("password checklist mirrors simplified API policy", () => {
  assert.deepEqual(
    getPasswordPolicyChecklist("123456").map((item) => item.valid),
    [true, true],
  );
});
