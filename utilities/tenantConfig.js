const DEFAULT_TENANT_KEY = process.env.TENANT_KEY || "derseturizm";

const LOCALHOST_TOKENS = new Set([
  "",
  "localhost",
  "127",
  "127.0.0.1",
  "0",
  "0.0.0.0",
  "::1",
]);

const IPV4_PATTERN = /^\d+(?:\.\d+){3}$/;

function resolveTenantKey(hostname) {
  if (!hostname) {
    return DEFAULT_TENANT_KEY || null;
  }

  const normalizedHost = String(hostname).toLowerCase();

  if (LOCALHOST_TOKENS.has(normalizedHost) || IPV4_PATTERN.test(normalizedHost)) {
    return DEFAULT_TENANT_KEY || null;
  }

  const [firstLabel] = normalizedHost.split(".");

  if (!firstLabel || LOCALHOST_TOKENS.has(firstLabel)) {
    return DEFAULT_TENANT_KEY || null;
  }

  return firstLabel;
}

module.exports = {
  DEFAULT_TENANT_KEY,
  resolveTenantKey,
};
