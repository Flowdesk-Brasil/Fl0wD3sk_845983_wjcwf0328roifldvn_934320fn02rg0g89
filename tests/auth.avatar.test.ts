import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDiscordUserAvatarUrl,
  normalizeProfileAvatarUrl,
  resolveNextAuthUserProfileAvatar,
} from "../lib/auth/avatar";

test("constroi avatar Discord com extensao animada correta", () => {
  assert.equal(
    buildDiscordUserAvatarUrl("123", "a_hash", 256),
    "https://cdn.discordapp.com/avatars/123/a_hash.gif?size=256",
  );
  assert.equal(
    buildDiscordUserAvatarUrl("123", "hash", 512),
    "https://cdn.discordapp.com/avatars/123/hash.png?size=512",
  );
});

test("aceita apenas avatar remoto seguro", () => {
  assert.equal(
    normalizeProfileAvatarUrl("https://lh3.googleusercontent.com/a/test"),
    "https://lh3.googleusercontent.com/a/test",
  );
  assert.equal(normalizeProfileAvatarUrl("http://example.com/a.png"), null);
  assert.equal(normalizeProfileAvatarUrl("javascript:alert(1)"), null);
});

test("preserva upload manual acima de avatar social", () => {
  const nextAvatar = resolveNextAuthUserProfileAvatar(
    {
      profile_avatar_url: "https://cdn.flwdesk.com/account/avatar.webp",
      profile_avatar_source: "upload",
    },
    "google",
    "https://lh3.googleusercontent.com/a/new",
  );

  assert.deepEqual(nextAvatar, {
    profileAvatarUrl: "https://cdn.flwdesk.com/account/avatar.webp",
    profileAvatarSource: "upload",
  });
});

test("atualiza avatar social quando nao existe upload manual", () => {
  const nextAvatar = resolveNextAuthUserProfileAvatar(
    {
      profile_avatar_url: "https://cdn.discordapp.com/avatars/1/old.png?size=512",
      profile_avatar_source: "discord",
    },
    "google",
    "https://lh3.googleusercontent.com/a/new",
  );

  assert.deepEqual(nextAvatar, {
    profileAvatarUrl: "https://lh3.googleusercontent.com/a/new",
    profileAvatarSource: "google",
  });
});
