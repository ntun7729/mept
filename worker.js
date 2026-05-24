import { handleApiRequest } from "./src/cloudflare-api.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
