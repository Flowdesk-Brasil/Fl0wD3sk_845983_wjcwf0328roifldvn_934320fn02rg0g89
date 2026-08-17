import assert from "node:assert/strict";
import test from "node:test";
import {
  FlowSecureDtoError,
  flowSecureDto,
  parseFlowSecureDto,
} from "../lib/security/flowSecure";

test("FlowSecure DTO rejects unknown top-level properties", () => {
  assert.throws(
    () =>
      parseFlowSecureDto(
        { email: "user@example.com", role: "admin" },
        { email: flowSecureDto.email() },
        { rejectUnknown: true },
      ),
    (error) =>
      error instanceof FlowSecureDtoError &&
      error.issues.some((issue) => issue.includes("role")),
  );
});

test("FlowSecure DTO rejects nested prototype pollution keys even in unknown payloads", () => {
  const payload = JSON.parse(
    '{"securityProof":{"provider":"totp","__proto__":{"polluted":true}}}',
  ) as unknown;

  assert.throws(
    () =>
      parseFlowSecureDto(
        payload,
        { securityProof: flowSecureDto.unknown() },
        { rejectUnknown: true },
      ),
    (error) =>
      error instanceof FlowSecureDtoError &&
      error.issues.some((issue) => issue.includes("__proto__")),
  );
});

test("FlowSecure DTO rejects excessively deep unknown payloads", () => {
  let current: Record<string, unknown> = { leaf: "ok" };
  for (let index = 0; index < 30; index += 1) {
    current = { nested: current };
  }

  assert.throws(
    () =>
      parseFlowSecureDto(
        { draft: current },
        { draft: flowSecureDto.unknown() },
        { rejectUnknown: true },
      ),
    (error) =>
      error instanceof FlowSecureDtoError &&
      error.issues.some((issue) => issue.includes("profundidade")),
  );
});

test("FlowSecure DTO rejects oversized arrays before route-specific handling", () => {
  assert.throws(
    () =>
      parseFlowSecureDto(
        { items: Array.from({ length: 1_001 }, (_, index) => index) },
        { items: flowSecureDto.unknown() },
        { rejectUnknown: true },
      ),
    (error) =>
      error instanceof FlowSecureDtoError &&
      error.issues.some((issue) => issue.includes("limite de itens")),
  );
});
