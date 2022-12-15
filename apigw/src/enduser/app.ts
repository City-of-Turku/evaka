// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import cookieParser from 'cookie-parser'
import express, { Router } from 'express'
import helmet from 'helmet'
import passport from 'passport'
import { requireAuthentication } from '../shared/auth'
import createEvakaCustomerSamlStrategy, {
  createSamlConfig as createEvakaCustomerSamlConfig
} from '../shared/auth/customer-saml'
import createSuomiFiStrategy, {
  createSamlConfig as createSuomiFiSamlConfig
} from '../shared/auth/suomi-fi-saml'
import setupLoggingMiddleware from '../shared/logging'
import { csrf, csrfCookie } from '../shared/middleware/csrf'
import { errorHandler } from '../shared/middleware/error-handler'
import tracing from '../shared/middleware/tracing'
import { trustReverseProxy } from '../shared/reverse-proxy'
import createSamlRouter from '../shared/routes/auth/saml'
import session, {
  refreshLogoutToken,
  touchSessionMaxAge
} from '../shared/session'
import publicRoutes from './publicRoutes'
import routes from './routes'
import authStatus from './routes/auth-status'
import { cacheControl } from '../shared/middleware/cache-control'
import { RedisClient } from 'redis'

export default function enduserGwApp(redisClient: RedisClient) {
  const app = express()
  trustReverseProxy(app)
  app.set('etag', false)

  app.use(
    cacheControl((req) =>
      req.path.startsWith('/api/application/citizen/child-images/')
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
  app.use(cookieParser())
  app.use(session('enduser', redisClient))
  app.use(touchSessionMaxAge)
  app.use(passport.initialize())
  app.use(passport.session())
  passport.serializeUser<Express.User>((user, done) => done(null, user))
  passport.deserializeUser<Express.User>((user, done) => done(null, user))
  app.use(refreshLogoutToken())
  setupLoggingMiddleware(app)

  function apiRouter() {
    const router = Router()

    router.use(publicRoutes)
    const suomifiSamlConfig = createSuomiFiSamlConfig(redisClient)
    router.use(
      createSamlRouter({
        strategyName: 'suomifi',
        strategy: createSuomiFiStrategy(suomifiSamlConfig),
        samlConfig: suomifiSamlConfig,
        sessionType: 'enduser',
        pathIdentifier: 'saml'
      })
    )
    const evakaCustomerSamlConfig = createEvakaCustomerSamlConfig(redisClient)
    router.use(
      createSamlRouter({
        strategyName: 'evaka-customer',
        strategy: createEvakaCustomerSamlStrategy(evakaCustomerSamlConfig),
        samlConfig: evakaCustomerSamlConfig,
        sessionType: 'enduser',
        pathIdentifier: 'evaka-customer'
      })
    )
    router.get('/auth/status', csrf, csrfCookie('enduser'), authStatus)
    router.use(requireAuthentication)
    router.use(csrf)
    router.use(routes)
    return router
  }

  app.use('/api/application', apiRouter())
  app.use(errorHandler(false))

  return app
}
