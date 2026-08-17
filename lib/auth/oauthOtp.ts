import type { DiscordUser } from "@/lib/auth/discord";
import type { GoogleUser } from "@/lib/auth/google";
import { normalizeAuthEmail } from "@/lib/auth/email";
import {
  createEmailRegistrationOtpChallenge,
  type PendingOtpSessionContext,
  type VerifiedOtpChallengeContext,
} from "@/lib/auth/emailOtp";
import {
  resolveAuthUserForDiscordLogin,
  resolveAuthUserForGoogleLogin,
} from "@/lib/auth/session";
import {
  decryptFlowSecureValue,
  encryptFlowSecureValue,
} from "@/lib/security/flowSecure";

type PendingOAuthOtpProvider = "discord" | "google";

type PendingOAuthRegistrationPayload =
  | {
      provider: "google";
      emailNormalized: string;
      googleUser: GoogleUser;
    }
  | {
      provider: "discord";
      emailNormalized: string;
      discordUser: DiscordUser;
    };

const OAUTH_REGISTRATION_METADATA_KEY = "oauth_registration_encrypted";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveGoogleVerifiedEmail(googleUser: GoogleUser) {
  const normalizedEmail = normalizeAuthEmail(googleUser.email);
  if (!normalizedEmail || !googleUser.email_verified) {
    throw new Error("Sua conta Google precisa ter um email verificado para continuar.");
  }
  return normalizedEmail;
}

function resolveDiscordVerifiedEmail(discordUser: DiscordUser) {
  const normalizedEmail = discordUser.verified
    ? normalizeAuthEmail(discordUser.email)
    : null;
  if (!normalizedEmail) {
    throw new Error("Sua conta Discord precisa ter um email verificado para continuar.");
  }
  return normalizedEmail;
}

function encryptPendingOAuthRegistration(
  payload: PendingOAuthRegistrationPayload,
) {
  return encryptFlowSecureValue(JSON.stringify(payload), {
    purpose: "auth_oauth_registration",
  });
}

function parsePendingOAuthRegistration(
  metadata: unknown,
): PendingOAuthRegistrationPayload | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const encrypted = metadata[OAUTH_REGISTRATION_METADATA_KEY];
  if (typeof encrypted !== "string" || !encrypted.trim()) {
    return null;
  }

  try {
    const decrypted = decryptFlowSecureValue(encrypted, {
      purpose: "auth_oauth_registration",
    });
    if (!decrypted) {
      return null;
    }

    const parsed = JSON.parse(decrypted) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    if (
      parsed.provider === "google" &&
      typeof parsed.emailNormalized === "string" &&
      isRecord(parsed.googleUser)
    ) {
      return {
        provider: "google",
        emailNormalized: parsed.emailNormalized,
        googleUser: parsed.googleUser as GoogleUser,
      };
    }

    if (
      parsed.provider === "discord" &&
      typeof parsed.emailNormalized === "string" &&
      isRecord(parsed.discordUser)
    ) {
      return {
        provider: "discord",
        emailNormalized: parsed.emailNormalized,
        discordUser: parsed.discordUser as DiscordUser,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function shouldRequireInitialOAuthEmailOtp(input: {
  mode: "login" | "link";
  existingProviderUserId: number | null;
}) {
  return input.mode !== "link" && input.existingProviderUserId === null;
}

export async function createPendingOAuthEmailOtpChallenge(input:
  | {
      provider: "google";
      googleUser: GoogleUser;
      nextPath: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      preserveChallengeOnEmailFailure?: boolean;
    }
  | {
      provider: "discord";
      discordUser: DiscordUser;
      nextPath: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      preserveChallengeOnEmailFailure?: boolean;
      discordAccessToken: string | null;
      discordRefreshToken: string | null;
      discordTokenExpiresAt: string | null;
    },
) {
  const emailNormalized =
    input.provider === "google"
      ? resolveGoogleVerifiedEmail(input.googleUser)
      : resolveDiscordVerifiedEmail(input.discordUser);
  const session: PendingOtpSessionContext = {
    authMethod: input.provider,
    nextPath: input.nextPath,
    discordAccessToken:
      input.provider === "discord" ? input.discordAccessToken : null,
    discordRefreshToken:
      input.provider === "discord" ? input.discordRefreshToken : null,
    discordTokenExpiresAt:
      input.provider === "discord" ? input.discordTokenExpiresAt : null,
  };
  const oauthPayload: PendingOAuthRegistrationPayload =
    input.provider === "google"
      ? {
          provider: "google",
          emailNormalized,
          googleUser: input.googleUser,
        }
      : {
          provider: "discord",
          emailNormalized,
          discordUser: input.discordUser,
        };

  return createEmailRegistrationOtpChallenge({
    email: emailNormalized,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    preserveChallengeOnEmailFailure:
      input.preserveChallengeOnEmailFailure ?? false,
    metadata: {
      [OAUTH_REGISTRATION_METADATA_KEY]:
        encryptPendingOAuthRegistration(oauthPayload),
      session,
    },
  });
}

export async function completePendingOAuthEmailOtpChallenge(
  challenge: VerifiedOtpChallengeContext,
) {
  if (challenge.purpose !== "email_registration") {
    return null;
  }

  const payload = parsePendingOAuthRegistration(challenge.metadata);
  if (!payload) {
    return null;
  }

  if (payload.emailNormalized !== challenge.emailNormalized) {
    throw new Error("O email do provedor nao confere com este codigo.");
  }

  let resolvedEmail: string;
  if (payload.provider === "google") {
    resolvedEmail = resolveGoogleVerifiedEmail(payload.googleUser);
    if (resolvedEmail !== challenge.emailNormalized) {
      throw new Error("O email do Google nao confere com este codigo.");
    }
    const user = await resolveAuthUserForGoogleLogin(payload.googleUser);
    return {
      userId: user.id,
      provider: "google" as PendingOAuthOtpProvider,
    };
  }

  resolvedEmail = resolveDiscordVerifiedEmail(payload.discordUser);
  if (resolvedEmail !== challenge.emailNormalized) {
    throw new Error("O email do Discord nao confere com este codigo.");
  }

  const user = await resolveAuthUserForDiscordLogin(payload.discordUser);
  return {
    userId: user.id,
    provider: "discord" as PendingOAuthOtpProvider,
  };
}
