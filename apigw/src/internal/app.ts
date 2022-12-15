// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import cookieParser from 'cookie-parser'
import express, { Router } from 'express'
import helmet from 'helmet'
import passport from 'passport'
import { requireAuthentication } from '../shared/auth'
import createAdSamlStrategy, {
  createSamlConfig as createAdSamlConfig
} from '../shared/auth/ad-saml'
import createEvakaSamlStrategy, {
  createSamlConfig as createEvakaSamlconfig
} from '../shared/auth/keycloak-saml'
import {
  appCommit,
  Config,
  cookieSecret,
  enableDevApi,
  titaniaConfig
} from '../shared/config'
import setupLoggingMiddleware from '../shared/logging'
import { csrf, csrfCookie } from '../shared/middleware/csrf'
import { errorHandler } from '../shared/middleware/error-handler'
import tracing from '../shared/middleware/tracing'
import { createProxy } from '../shared/proxy-utils'
import { trustReverseProxy } from '../shared/reverse-proxy'
import createSamlRouter from '../shared/routes/auth/saml'
import csp from '../shared/routes/csp'
import session, {
  refreshLogoutToken,
  touchSessionMaxAge
} from '../shared/session'
import mobileDeviceSession, {
  checkMobileEmployeeIdToken,
  devApiE2ESignup,
  pinLoginRequestHandler,
  pinLogoutRequestHandler,
  refreshMobileSession
} from './mobile-device-session'
import authStatus from './routes/auth-status'
import AsyncRedisClient from '../shared/async-redis-client'
import expressBasicAuth from 'express-basic-auth'
import { cacheControl } from '../shared/middleware/cache-control'
import { RedisClient } from 'redis'

export default function internalGwApp(
  config: Config,
  redisClient: RedisClient
) {
  const app = express()
  trustReverseProxy(app)
  app.set('etag', false)

  app.use(
    cacheControl((req) =>
      req.path.startsWith('/api/internal/child-images/')
        ? 'allow-cache'
        : 'forbid-cache'
    )
  )

  app.use(
    helmet({
      // Content-Security-Policy is set by the nginx proxy
      contentSecurityPolicy: false
    })
  )
  app.get('/health', (_, res) => {
    redisClient.connected !== true && redisClient.ping() !== true
      ? res.status(503).json({ status: 'DOWN' })
      : res.status(200).json({ status: 'UP' })
  })
  app.use(tracing)
  app.use(session('employee', redisClient))
  app.use(touchSessionMaxAge)
  app.use(cookieParser(cookieSecret))
  app.use(passport.initialize())
  app.use(passport.session())
  passport.serializeUser<Express.User>((user, done) => done(null, user))
  passport.deserializeUser<Express.User>((user, done) => done(null, user))
  app.use(refreshLogoutToken())
  setupLoggingMiddleware(app)

  app.use('/api/csp', csp)

  function internalApiRouter() {
    const router = Router()
    router.all('/system/*', (_, res) => res.sendStatus(404))

    const integrationUsers = {
      ...(titaniaConfig && { [titaniaConfig.username]: titaniaConfig.password })
    }
    router.use('/integration', expressBasicAuth({ users: integrationUsers }))
    router.all('/integration/*', createProxy())

    router.all('/auth/*', (req: express.Request, res, next) => {
      if (req.session?.idpProvider === 'evaka') {
        req.url = req.url.replace('saml', 'evaka')
      }
      next()
    })

    const adSamlConfig = createAdSamlConfig(config.ad, redisClient)
    router.use(
      createSamlRouter(config, {
        strategyName: 'ead',
        strategy: createAdSamlStrategy(config.ad, adSamlConfig),
        samlConfig: adSamlConfig,
        sessionType: 'employee',
        pathIdentifier: 'saml'
      })
    )

    const evakaSamlConfig = createEvakaSamlconfig(redisClient)
    router.use(
      createSamlRouter(config, {
        strategyName: 'evaka',
        strategy: createEvakaSamlStrategy(evakaSamlConfig),
        samlConfig: evakaSamlConfig,
        sessionType: 'employee',
        pathIdentifier: 'evaka'
      })
    )

    if (enableDevApi) {
      router.post(
        '/dev-api/pedagogical-document-attachment/:id',
        createProxy({ multipart: true })
      )

      router.use(
        '/dev-api',
        createProxy({ path: ({ path }) => `/dev-api${path}` })
      )

      router.get('/auth/mobile-e2e-signup', devApiE2ESignup)
    }

    router.post('/auth/mobile', express.json(), mobileDeviceSession)

    router.use(checkMobileEmployeeIdToken(new AsyncRedisClient(redisClient)))

    router.get(
      '/auth/status',
      refreshMobileSession,
      csrf,
      csrfCookie('employee'),
      authStatus
    )
    router.all('/public/*', createProxy())
    router.get('/version', (_, res) => {
      res.send({ commitId: appCommit })
    })
    router.use(requireAuthentication)
    router.use(csrf)
    router.post(
      '/auth/pin-login',
      express.json(),
      pinLoginRequestHandler(new AsyncRedisClient(redisClient))
    )
    router.post(
      '/auth/pin-logout',
      express.json(),
      pinLogoutRequestHandler(new AsyncRedisClient(redisClient))
    )
    router.post(
      '/attachments/applications/:applicationId',
      createProxy({ multipart: true })
    )
    router.post(
      '/attachments/income-statements/:incomeStatementId',
      createProxy({ multipart: true })
    )
    router.post(
      '/attachments/messages/:draftId',
      createProxy({ multipart: true })
    )
    router.post(
      '/attachments/pedagogical-documents/:documentId',
      createProxy({ multipart: true })
    )
    router.put('/children/:childId/image', createProxy({ multipart: true }))

    router.post(
      '/attachments/income/:incomeId?',
      createProxy({ multipart: true })
    )

    router.use(createProxy())
    return router
  }

  app.use('/api/internal', internalApiRouter())
  app.use(errorHandler(true))
  return app
}
