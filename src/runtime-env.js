export function setRuntimeEnv(env = {}) {
  globalThis.__MEPT_RUNTIME_ENV__ = env || {};
}

export function getEnv(name, fallback = "") {
  const runtimeEnv = globalThis.__MEPT_RUNTIME_ENV__ || {};
  if (runtimeEnv[name] !== undefined && runtimeEnv[name] !== null) return String(runtimeEnv[name]);
  if (typeof process !== "undefined" && process.env && process.env[name] !== undefined) return String(process.env[name]);
  return fallback;
}

export function hasEnv(name) {
  return Boolean(getEnv(name, "").trim());
}
