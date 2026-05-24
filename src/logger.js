import { getEnv } from "./runtime-env.js";

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

export function logInfo(event, details = {}) {
  write("info", event, details);
}

export function logWarn(event, details = {}) {
  write("warn", event, details);
}

export function logError(event, details = {}) {
  write("error", event, details);
}

export function logDebug(event, details = {}) {
  write("debug", event, details);
}

export function isDebugEnabled() {
  return currentLevel() >= LEVELS.debug;
}

function write(level, event, details) {
  if (currentLevel() < LEVELS[level]) return;
  const safeDetails = redact(details);
  const record = {
    time: new Date().toISOString(),
    level,
    event,
    ...safeDetails
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function currentLevel() {
  const defaultLevel = getEnv("NODE_ENV") === "production" ? "silent" : "info";
  const raw = String(getEnv("LOG_LEVEL", getEnv("DEBUG_LOGS", defaultLevel))).toLowerCase().trim();
  if (raw === "true" || raw === "1" || raw === "yes") return LEVELS.debug;
  return LEVELS[raw] ?? LEVELS[defaultLevel];
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (/key|token|secret|authorization|password/i.test(key)) return [key, "[redacted]"];
      return [key, redact(item)];
    })
  );
}
