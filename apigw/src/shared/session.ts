// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import RedisStore from 'connect-redis'
import {
  addMinutes,
  differenceInMinutes,
  differenceInSeconds,
  isDate
} from 'date-fns'
import express, { CookieOptions } from 'express'
import session from 'express-session'
import {
  cookieSecret,
  sessionTimeoutMinutes,
  useSecureCookies
} from './config.js'
import { LogoutToken, toMiddleware } from './express.js'
import { fromCallback } from './promise-utils.js'
import { RedisClient } from './redis-client.js'

export type SessionType = 'enduser' | 'employee'

let redisClient: RedisClient | undefined

const sessionCookieOptions: CookieOptions = {
  path: '/',
  httpOnly: true,
  secure: useSecureCookies,
  sameSite: 'lax'
}

function cookiePrefix(sessionType: SessionType) {
  return sessionType === 'enduser' ? 'evaka.eugw' : 'evaka.employee'
}

function sessionKey(id: string) {
  return `sess:${id}`
}

function logoutKey(token: LogoutToken['value']) {
  return `slo:${token}`
}

export function sessionCookie(sessionType: SessionType) {
  return `${cookiePrefix(sessionType)}.session`
}

export function refreshLogoutToken() {
  return toMiddleware(async (req) => {
    if (!req.session) return
    if (!req.session.logoutToken) return
    if (!isDate(req.session.cookie.expires)) return
    const sessionExpires = req.session.cookie.expires as Date
    const logoutExpires = new Date(req.session.logoutToken.expiresAt)
    // Logout token should always expire at least 30 minutes later than the session
    if (differenceInMinutes(logoutExpires, sessionExpires) < 30) {
      await saveLogoutToken(req)
    }
  })
}

/**
 * Save a logout token for a user session to be consumed during logout.
 * Provide the same token during logout to consume it.
 *
 * The token must be a value generated from values available in a logout request
 * without any cookies, as many browsers will disable 3rd party cookies by
 * default, breaking Single Logout. For example, SAML nameID and sessionIndex.
 *
 * The token is used as an effective secondary index in Redis for the session,
 * which would normally be recognized from the session cookie.
 *
 * This token can be removed if this passport-saml issue is ever fixed and this
 * logic is directly implemented in the library:
 * https://github.com/node-saml/passport-saml/issues/419
 */
export async function saveLogoutToken(
  req: express.Request,
  logoutToken?: string
): Promise<void> {
  if (!req.session) return

  const token = logoutToken || req.session.logoutToken?.value
  if (!token) return

  if (!redisClient) return
  const now = new Date()
  const expires = addMinutes(now, sessionTimeoutMinutes + 60)
  const newToken = {
    expiresAt: expires.valueOf(),
    value: token
  }
  req.session.logoutToken = newToken

  const key = logoutKey(token)
  const ttlSeconds = differenceInSeconds(expires, now)
  // https://redis.io/commands/set - Set key to hold the string value.
  // Options:
  //   EX seconds -- Set the specified expire time, in seconds.
  await redisClient.set(key, req.session.id, { EX: ttlSeconds })
}

export async function logoutWithOnlyToken(
  logoutToken: LogoutToken['value']
): Promise<unknown | undefined> {
  if (!redisClient) return
  if (!logoutToken) return
  const sid = await redisClient.get(logoutKey(logoutToken))
  if (!sid) return
  const session = await redisClient.get(sessionKey(sid))
  await redisClient.del([sessionKey(sid), logoutKey(logoutToken)])
  if (!session) return
  const user = JSON.parse(session)?.passport?.user
  if (!user) return
  return user
}

export async function consumeLogoutToken(token: LogoutToken['value']) {
  if (!redisClient) return
  // TODO: use Redis getdel operation once the client supports it
  const sid = await redisClient.get(logoutKey(token))
  if (sid) {
    // Ensure both session and logout keys are cleared in case no cookies were
    // available -> no req.session was available to be deleted.
    await redisClient.del([sessionKey(sid), logoutKey(token)])
  }
}

export async function saveSession(req: express.Request) {
  if (req.session) {
    const session = req.session
    await fromCallback((cb) => session.save(cb))
  }
}

export const touchSessionMaxAge = toMiddleware(async (req) => {
  req.session?.touch()
})

export default (sessionType: SessionType, redisClientImpl: RedisClient) => {
  redisClient = redisClientImpl
  return session({
    cookie: {
      ...sessionCookieOptions,
      maxAge: sessionTimeoutMinutes * 60000
    },
    resave: false,
    rolling: true,
    saveUninitialized: false,
    secret: cookieSecret,
    name: sessionCookie(sessionType),
    store: new RedisStore({ client: redisClient })
  })
}
