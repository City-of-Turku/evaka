// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import express, { CookieOptions } from 'express'
import {
  assertStringProp,
  toMiddleware,
  toRequestHandler
} from '../shared/express'
import {
  employeePinLogin,
  identifyMobileDevice,
  MobileDeviceIdentity,
  validatePairing
} from '../shared/service-client'
import { useSecureCookies } from '../shared/config'
import { fromCallback } from '../shared/promise-utils'

export const mobileLongTermCookieName = 'evaka.employee.mobile'
const mobileLongTermCookieOptions: CookieOptions = {
  path: '/',
  httpOnly: true,
  secure: useSecureCookies,
  sameSite: 'lax',
  signed: true
}

function daysToMillis(days: number): number {
  return days * 24 * 60 * 60_000
}

async function mobileLogin(
  req: express.Request,
  res: express.Response,
  device: MobileDeviceIdentity
) {
  await fromCallback((cb) =>
    req.logIn(
      {
        id: device.id,
        globalRoles: [],
        allScopedRoles: ['MOBILE'],
        userType: 'MOBILE'
      },
      cb
    )
  )
  // Unconditionally refresh long-term cookie on each login to refresh expiry
  // time and make it a "rolling" cookie
  res.cookie(mobileLongTermCookieName, device.longTermToken, {
    ...mobileLongTermCookieOptions,
    maxAge: daysToMillis(90)
  })
}

export const refreshMobileSession = toMiddleware(async (req, res) => {
  if (!req.user) {
    const token = req.signedCookies[mobileLongTermCookieName]
    if (token) {
      const deviceIdentity = await identifyMobileDevice(req, token)
      if (deviceIdentity) {
        await mobileLogin(req, res, deviceIdentity)
      } else {
        // device has been removed or token has been rotated
        res.clearCookie(mobileLongTermCookieName, mobileLongTermCookieOptions)
      }
    }
  }
})

export default toRequestHandler(async (req, res) => {
  const id = assertStringProp(req.body, 'id')
  const challengeKey = assertStringProp(req.body, 'challengeKey')
  const responseKey = assertStringProp(req.body, 'responseKey')
  const deviceIdentity = await validatePairing(req, id, {
    challengeKey,
    responseKey
  })
  await mobileLogin(req, res, deviceIdentity)
  res.sendStatus(204)
})

export const devApiE2ESignup = toRequestHandler(async (req, res) => {
  const token = assertStringProp(req.query, 'token')
  const deviceIdentity = await identifyMobileDevice(req, token)
  if (deviceIdentity) {
    await mobileLogin(req, res, deviceIdentity)
    res.redirect('/employee/mobile')
  } else {
    res.sendStatus(404)
  }
})

export const pinLoginRequestHandler = toRequestHandler(async (req, res) => {
  const employeeId = assertStringProp(req.body, 'employeeId')
  const pin = assertStringProp(req.body, 'pin')
  console.log(`DEBUG: login ${employeeId} with ${pin}`)
  const status = await employeePinLogin(req)
  console.log('DEBUG: response', status)
  res.status(204).send(status)
})
