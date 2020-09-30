// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { Request } from 'express'
import { SerializedRequest, SerializedResponse } from 'pino-std-serializers'

export interface PinoRequest
  extends Omit<
    SerializedRequest,
    'id' | 'headers' | 'method' | 'raw' | 'remoteAddress' | 'remotePort'
  > {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw?: any
  // Custom enriched properties
  path?: string
  queryString?: string
  userIdHash?: string
}

export interface PinoResponse
  extends Omit<SerializedResponse, 'raw' | 'statusCode'> {
  // Custom enriched properties
  contentLength?: number
}
export type PinoReqSerializer = (req: PinoRequest) => PinoRequest
export type PinoResSerializer = (res: PinoResponse) => PinoResponse

export interface UserPinoRequest extends PinoRequest {
  spanId?: string
  traceId?: string
  user?: Express.User
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface LogMeta {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface LogFn {
  (msg: string, req?: Request, meta?: LogMeta, err?: Error): void
}
