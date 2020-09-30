// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { ErrorRequestHandler } from 'express'
import { logError } from '../logging'
interface LogResponse {
  message: string
  errorCode?: string
}

export const errorHandler: (v: boolean) => ErrorRequestHandler = (
  includeErrorMessage: boolean
) => (error, req, res, _next): Express.Response => {
  // https://github.com/expressjs/csurf#custom-error-handling
  if (error.code === 'EBADCSRFTOKEN') {
    return res.status(403).send({ message: 'CSRF token error' } as LogResponse)
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
