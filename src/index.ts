import fastifyPlugin from "fastify-plugin";
import { plugin } from "./plugin";

export { SecretKey, SessionCrypto } from "./crypto";
export { FastifySessionOptions } from "./plugin";
export { Session, SessionData } from "./session";
export { MemoryStore, SessionStore } from "./store";
export { createError, CRYPTO_SPLIT_CHAR, ErrorWithCode } from "./utils";

export default fastifyPlugin(plugin, {
  fastify: "4.x",
  name: "fastify-session",
});
