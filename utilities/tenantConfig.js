const DEFAULT_TENANT_KEY = process.env.TENANT_KEY || null;

function normalizeTenantKey(candidate) {
  if (typeof candidate !== "string") {
    return null;
  }

  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveTenantKey(hostname, explicitKey) {
  const normalizedExplicit = normalizeTenantKey(explicitKey);
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  if (!hostname) {
    return null;
  }

  const normalizedHost = String(hostname).toLowerCase();
  const labels = normalizedHost.split(".");

  if (labels.length <= 1) {
    return null;
  }

  return normalizeTenantKey(labels[0]);
}

module.exports = {
  DEFAULT_TENANT_KEY,
  resolveTenantKey,
  normalizeTenantKey,
};
