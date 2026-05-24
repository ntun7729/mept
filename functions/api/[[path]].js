import { handleApiRequest } from "../../src/cloudflare-api.js";

export async function onRequest(context) {
  return handleApiRequest(context.request, context.env);
}
