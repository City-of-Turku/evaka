// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { ErrorRequestHandler } from 'express'
import { logError } from '../logging.js'
import { csrfCookieName } from './csrf.js'
import { InvalidRequest } from '../express.js'
import { debug } from '../config.js'

interface LogResponse {
  message: string | null
  errorCode?: string
}

export const errorHandler: (v: boolean) => ErrorRequestHandler =
  (includeErrorMessage: boolean) =>
  (error, req, res, _next): Express.Response => {
    // https://github.com/expressjs/csurf#custom-error-handling
    if (error.code === 'EBADCSRFTOKEN') {
      logError(
        'CSRF token error',
        req,
        {
          enduserXsrfCookie: req.cookies[csrfCookieName('enduser')],
          employeeXsrfCookie: req.cookies[csrfCookieName('employee')],
          xsrfHeader: req.header('x-xsrf-token')
        },
        error
      )
      return res
        .status(403)
        .send({ message: 'CSRF token error' } as LogResponse)
    }
    if (error instanceof InvalidRequest) {
      const response: LogResponse = {
        message: includeErrorMessage || debug ? error.message : null
      }
      return res.status(400).json(response)
    }
    if (error.response) {
      const response: LogResponse = {
        message: includeErrorMessage
          ? error.response.data?.message || 'Invalid downstream error response'
          : null,
        errorCode: error.response.data?.errorCode
      }
      return res.status(error.response.status).json(response)
    }
    logError(
      `Internal server error: ${error.message || error || 'No error object'}`,
      req,
      undefined,
      error
    )
    return res
      .status(500)
      .json({ message: 'Internal server error' } as LogResponse)
  }

export const fallbackErrorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  _next
) => {
  logError(
    `Internal server error: ${error.message || error || 'No error object'}`,
    req,
    undefined,
    error
  )
  return res
    .status(500)
    .json({ message: 'Internal server error' } as LogResponse)
}
