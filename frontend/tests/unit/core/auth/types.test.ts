import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  rs,
} from "@rstest/core";

const ENV_KEYS = ["NEXT_PUBLIC_DEERFLOW_EXTERNAL_LOGIN_URL"] as const;

type EnvSnapshot = Partial<
  Record<(typeof ENV_KEYS)[number], string | undefined>
>;

function snapshotEnv(): EnvSnapshot {
  const snapshot: EnvSnapshot = {};
  for (const key of ENV_KEYS) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env[key];
  } else {
    env[key] = value;
  }
}

function restoreEnv(snapshot: EnvSnapshot) {
  for (const key of ENV_KEYS) {
    setEnv(key, snapshot[key]);
  }
}

async function loadFreshAuthTypes() {
  rs.resetModules();
  return await import("@/core/auth/types");
}

describe("auth login URL helpers", () => {
  let saved: EnvSnapshot;

  beforeEach(() => {
    saved = snapshotEnv();
    setEnv("NEXT_PUBLIC_DEERFLOW_EXTERNAL_LOGIN_URL", undefined);
  });

  afterEach(() => {
    restoreEnv(saved);
  });

  test("uses DeerFlow login when external login is not configured", async () => {
    const { buildLoginUrl, hasExternalLoginUrl } = await loadFreshAuthTypes();

    expect(hasExternalLoginUrl()).toBe(false);
    expect(buildLoginUrl("/workspace/chats/thread-1")).toBe(
      "/login?next=%2Fworkspace%2Fchats%2Fthread-1",
    );
  });

  test("appends next to configured external login URL", async () => {
    setEnv(
      "NEXT_PUBLIC_DEERFLOW_EXTERNAL_LOGIN_URL",
      "https://orpheus-console.niumedia-ai.com/features?tool=dashboard",
    );

    const { buildLoginUrl, hasExternalLoginUrl } = await loadFreshAuthTypes();

    expect(hasExternalLoginUrl()).toBe(true);
    expect(buildLoginUrl("/workspace")).toBe(
      "https://orpheus-console.niumedia-ai.com/features?tool=dashboard&next=%2Fworkspace",
    );
  });

  test("supports an explicit next placeholder", async () => {
    setEnv(
      "NEXT_PUBLIC_DEERFLOW_EXTERNAL_LOGIN_URL",
      "https://example.com/start?return_to={next}",
    );

    const { buildLoginUrl } = await loadFreshAuthTypes();

    expect(buildLoginUrl("/workspace/chats/a b")).toBe(
      "https://example.com/start?return_to=%2Fworkspace%2Fchats%2Fa%20b",
    );
  });
});
