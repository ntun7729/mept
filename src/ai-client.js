import { logDebug, logError, logInfo } from "./logger.js";

const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";

export function getConfig() {
  const apiKey = (process.env.AI_API_KEY || process.env.NVIDIA_API_KEY || "").trim();
  const baseUrl = trimTrailingSlash(process.env.AI_BASE_URL || DEFAULT_BASE_URL);
  const model = (process.env.AI_MODEL || "z-ai/glm-5.1").trim();
  if (!apiKey) throw new Error("Missing AI_API_KEY or NVIDIA_API_KEY in your environment");
  if (!isHttpUrl(baseUrl)) throw new Error("AI_BASE_URL must be an http or https URL");
  logDebug("ai.config.loaded", { baseUrl, model, hasApiKey: Boolean(apiKey) });
  return { apiKey, baseUrl, model };
}

export function getChatCompletionsUrl(baseUrl) {
  const clean = trimTrailingSlash(baseUrl);
  return clean.endsWith("/v1") ? `${clean}/chat/completions` : `${clean}/v1/chat/completions`;
}

export function getModelsUrl(baseUrl) {
  const clean = trimTrailingSlash(baseUrl);
  return clean.endsWith("/v1") ? `${clean}/models` : `${clean}/v1/models`;
}

export function getAudioSpeechUrl(baseUrl) {
  const clean = trimTrailingSlash(baseUrl);
  return clean.endsWith("/v1") ? `${clean}/audio/speech` : `${clean}/v1/audio/speech`;
}

export async function listModels() {
  const config = getConfig();
  const url = getModelsUrl(config.baseUrl);
  const startedAt = Date.now();
  logInfo("ai.models.request", { url: redactUrl(url) });
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" }
  });
  const text = await response.text();
  const data = safeJson(text) || {};
  logInfo("ai.models.response", { status: response.status, durationMs: Date.now() - startedAt, bodyBytes: text.length });
  if (!response.ok) {
    const message = data?.error?.message || text.slice(0, 400) || `Model request failed: ${response.status}`;
    logError("ai.models.error", { status: response.status, message });
    throw new Error(message);
  }
  return Array.isArray(data.data) ? data.data.map((model) => String(model.id || "").trim()).filter(Boolean).sort() : [];
}

export async function chatJson({ messages, temperature = 0.7, maxTokens = 4096, model }) {
  const config = getConfig();
  const url = getChatCompletionsUrl(config.baseUrl);
  const selectedModel = model || config.model;
  const startedAt = Date.now();
  logInfo("ai.chat.request", { url: redactUrl(url), model: selectedModel, messageCount: messages.length, temperature, maxTokens });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      model: selectedModel,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" }
    })
  });
  const text = await response.text();
  const data = safeJson(text);
  logInfo("ai.chat.response", { status: response.status, durationMs: Date.now() - startedAt, bodyBytes: text.length });
  if (!response.ok) {
    const message = data?.error?.message || text.slice(0, 400) || `AI request failed: ${response.status}`;
    logError("ai.chat.error", { status: response.status, message });
    throw new Error(message);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    logError("ai.chat.empty_response", { status: response.status });
    throw new Error("AI provider returned an empty response");
  }
  const parsed = parseJsonFromModel(content);
  logDebug("ai.chat.parsed", { topLevelKeys: Object.keys(parsed || {}) });
  return parsed;
}

export async function speechMp3({ text }) {
  const apiKey = (process.env.AUDIO_API_KEY || process.env.AI_API_KEY || process.env.NVIDIA_API_KEY || "").trim();
  const baseUrl = trimTrailingSlash(process.env.AUDIO_BASE_URL || process.env.AI_BASE_URL || DEFAULT_BASE_URL);
  const model = (process.env.AUDIO_MODEL || "tts-1").trim();
  const voice = (process.env.AUDIO_VOICE || "alloy").trim();
  if (!apiKey) throw new Error("Missing audio API key");
  const url = getAudioSpeechUrl(baseUrl);
  const startedAt = Date.now();
  logInfo("ai.audio.request", { url: redactUrl(url), model, voice, textChars: text.length });
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ model, voice, input: text, response_format: "mp3" })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const message = body.slice(0, 400) || `Audio request failed: ${response.status}`;
    logError("ai.audio.error", { status: response.status, durationMs: Date.now() - startedAt, message });
    throw new Error(message);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  logInfo("ai.audio.response", { status: response.status, durationMs: Date.now() - startedAt, audioBytes: buffer.length });
  return buffer.toString("base64");
}

function parseJsonFromModel(content) {
  const direct = safeJson(content);
  if (direct) return direct;
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const parsed = safeJson(fenced[1]);
    if (parsed) return parsed;
  }
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const parsed = safeJson(content.slice(start, end + 1));
    if (parsed) return parsed;
  }
  logError("ai.json_parse.error", { preview: content.slice(0, 220) });
  throw new Error("AI response was not valid JSON");
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
function trimTrailingSlash(value) { return String(value || "").replace(/\/+$/, ""); }
function isHttpUrl(value) {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}
function redactUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return "[invalid-url]";
  }
}
