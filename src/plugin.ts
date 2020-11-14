import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { CookieSerializeOptions } from 'fastify-cookie';
import { kCookieOptions, Session, SessionStore } from './session';
import './typings';
import { asBuffer, buildKeyFromSecretAndSalt, sanitizeSecretKeys } from './utils';

export const DEFAULT_COOKIE_NAME = 'Session';

export type SecretKey = Buffer | string | (Buffer | string)[];

export type FastifySessionOptions = {
  salt?: Buffer | string;
  secret?: Buffer | string;
  key?: SecretKey;
  cookieName?: string;
  cookie?: CookieSerializeOptions;
  store?: SessionStore;
};

export const plugin: FastifyPluginAsync<FastifySessionOptions> = async (fastify, options): Promise<void> => {
  const { key, secret, salt, cookieName = DEFAULT_COOKIE_NAME, cookie: cookieOptions = {}, store } = options;

  if (!key && !secret) {
    throw new Error('key or secret must specified');
  }

  const secretKeys: Buffer[] = secret
    ? [buildKeyFromSecretAndSalt(asBuffer(secret), salt ? asBuffer(salt, 'base64') : undefined)]
    : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      sanitizeSecretKeys(key!);

  Session.configure({ cookieOptions, secretKeys, store });

  fastify.decorateRequest('session', null);
  fastify.decorateRequest('sessionStore', store);
  async function destroySession(this: FastifyRequest) {
    if (!this.session) {
      return;
    }
    await this.session.destroy();
  }
  fastify.decorateRequest('destroySession', destroySession);

  // decode/create a session for every request
  fastify.addHook('onRequest', async (request) => {
    const { cookies, log } = request;
    const cookie = cookies[cookieName];
    if (!cookie) {
      log.debug('fastify-session/onRequest: there is no cookie, creating an empty session');
      request.session = new Session();
      return;
    }
    try {
      log.debug('fastify-session: found an existing cookie, attempting to decode session');
      request.session = await Session.fromCookie(cookie);
      log.debug('fastify-session: session successfully decoded');
      return;
    } catch (err) {
      log.debug(`fastify-session: decoding error: ${err.message}, creating an empty session`);
      request.session = new Session();
      return;
    }
  });

  // encode a cookie
  fastify.addHook('onSend', async (request, reply) => {
    const { log, session } = request;

    if (!session) {
      log.debug('fastify-session: there is no session, leaving it as is');
      return;
    } else if (!session.changed && !session.created && !session.rotated) {
      log.debug('fastify-session: the existing session was not changed, leaving it as is');
      return;
    } else if (session.deleted) {
      log.debug('fastify-session: deleting session');
      reply.setCookie(cookieName, '', {
        ...cookieOptions,
        ...session[kCookieOptions],
        expires: new Date(0),
        maxAge: 0,
      });
      return;
    }

    // code: reply.statusCode
    if (session.created || session.changed) {
      log.debug('fastify-session: saving session');
      await session.save();
    }
    reply.setCookie(cookieName, await session.toCookie(), { ...cookieOptions, ...session[kCookieOptions] });
  });
};
