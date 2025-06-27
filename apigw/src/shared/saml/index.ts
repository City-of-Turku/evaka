// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { readFileSync } from 'node:fs'

import { CacheProvider, Profile, SamlConfig } from '@node-saml/node-saml'
import express from 'express'
import { z } from 'zod'

import { EvakaSessionUser } from '../auth/index.js'
import certificates, { TrustedCertificates } from '../certificates.js'
import { evakaBaseUrl, EvakaSamlConfig } from '../config.js'
import { logError } from '../logging.js'
import { parseUrlWithOrigin } from '../parse-url-with-origin.js'

export function createSamlConfig(
  config: EvakaSamlConfig,
  cacheProvider?: CacheProvider,
  wantAuthnResponseSigned = true
): SamlConfig {
  const privateCert = readFileSync(config.privateCert, {
    encoding: 'utf8'
  })
  const lookupPublicCert = (cert: string) =>
    cert in certificates
      ? certificates[cert as TrustedCertificates]
      : readFileSync(cert, {
          encoding: 'utf8'
        })
  const publicCert = Array.isArray(config.publicCert)
    ? config.publicCert.map(lookupPublicCert)
    : lookupPublicCert(config.publicCert)

  return {
    acceptedClockSkewMs: config.acceptedClockSkewMs,
    audience: config.issuer,
    cacheProvider,
    callbackUrl: config.callbackUrl,
    idpCert: publicCert,
    disableRequestedAuthnContext: true,
    decryptionPvk: config.decryptAssertions ? privateCert : undefined,
    entryPoint: config.entryPoint,
    identifierFormat:
      config.nameIdFormat ??
      'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
    issuer: config.issuer,
    logoutUrl: config.logoutUrl,
    privateKey: privateCert,
    signatureAlgorithm: 'sha256',
    validateInResponseTo: config.validateInResponseTo,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned
  }
}

export type AuthenticateProfile = (
  req: express.Request,
  profile: Profile
) => Promise<EvakaSessionUser>

export function authenticateProfile<T>(
  schema: z.ZodType<T>,
  authenticate: (
    req: express.Request,
    samlSession: SamlSession,
    profile: T
  ) => Promise<EvakaSessionUser>
): AuthenticateProfile {
  return async (req, profile) => {
    const samlSession = SamlSessionSchema.parse(profile)
    const parseResult = schema.safeParse(profile)
    if (parseResult.success) {
      return await authenticate(req, samlSession, parseResult.data)
    } else {
      throw new Error(
        `SAML ${profile.issuer} profile parsing failed: ${parseResult.error.message}`
      )
    }
  }
}

export const SamlProfileIdSchema = z.object({
  nameID: z.string(),
  nameIDFormat: z.string()
})

export type SamlSession = z.infer<typeof SamlSessionSchema>

// A subset of SAML Profile fields that are expected to be present in valid SAML sessions
export const SamlSessionSchema = z.object({
  issuer: z.string(),
  nameID: z.string(),
  nameIDFormat: z.string(),
  sessionIndex: z.string().optional(),
  nameQualifier: z.string().optional(),
  spNameQualifier: z.string().optional()
})

export function getRawUnvalidatedRelayState(
  req: express.Request
): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-assignment
  const relayState = req.body?.RelayState || req.query.RelayState
  return typeof relayState === 'string' ? relayState : undefined
}

// SAML RelayState is an arbitrary string that gets passed in a SAML transaction.
// In our case, we specify it to be a redirect URL where the user should be
// redirected to after the SAML transaction is complete. Since the RelayState
// is not signed or encrypted, we must make sure the URL points to our application
// and not to some 3rd party domain
export function validateRelayStateUrl(req: express.Request): URL | undefined {
  const relayState = getRawUnvalidatedRelayState(req)
  if (relayState) {
    const url = parseUrlWithOrigin(evakaBaseUrl, relayState)
    if (url) return url
    logError('Invalid RelayState in request', req)
  }
  return undefined
}
