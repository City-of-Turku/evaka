// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import {
  Profile,
  SamlConfig,
  Strategy as SamlStrategy,
  VerifiedCallback
} from 'passport-saml'
import DevPassportStrategy from './dev-passport-strategy'
import { SamlUser } from '../routes/auth/saml/types'
import { adMock, adConfig, adExternalIdPrefix } from '../config'
import certificates from '../certificates'
import { readFileSync } from 'fs'
import { getEmployeeByExternalId, upsertEmployee } from '../dev-api'
import { employeeLogin, UserRole } from '../service-client'
import { RedisClient } from 'redis'
import redisCacheProvider from './passport-saml-cache-redis'

const AD_USER_ID_KEY =
  'http://schemas.microsoft.com/identity/claims/objectidentifier'
const AD_ROLES_KEY =
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'
const AD_GIVEN_NAME_KEY =
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'
const AD_FAMILY_NAME_KEY =
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'
const AD_EMAIL_KEY =
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'
const AD_EMPLOYEE_NUMBER_KEY =
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/employeenumber'

interface AdProfile {
  nameID?: Profile['nameID']
  nameIDFormat?: Profile['nameIDFormat']
  nameQualifier?: Profile['nameQualifier']
  spNameQualifier?: Profile['spNameQualifier']
  sessionIndex?: Profile['sessionIndex']
  [AD_USER_ID_KEY]: string
  [AD_ROLES_KEY]: string | string[]
  [AD_GIVEN_NAME_KEY]: string
  [AD_FAMILY_NAME_KEY]: string
  [AD_EMAIL_KEY]: string
  [AD_EMPLOYEE_NUMBER_KEY]?: string
}

async function verifyProfile(profile: AdProfile): Promise<SamlUser> {
  const aad = profile[AD_USER_ID_KEY]
  if (!aad) throw Error('No user ID in SAML data')
  const person = await employeeLogin({
    externalId: `${adExternalIdPrefix}:${aad}`,
    firstName: profile[AD_GIVEN_NAME_KEY],
    lastName: profile[AD_FAMILY_NAME_KEY],
    email: profile[AD_EMAIL_KEY],
    employeeNumber: profile[AD_EMPLOYEE_NUMBER_KEY]
  })
  return {
    id: person.id,
    userType: 'EMPLOYEE',
    globalRoles: person.globalRoles,
    allScopedRoles: person.allScopedRoles,
    nameID: profile.nameID,
    nameIDFormat: profile.nameIDFormat,
    nameQualifier: profile.nameQualifier,
    spNameQualifier: profile.spNameQualifier,
    sessionIndex: profile.sessionIndex
  }
}

export function createSamlConfig(redisClient?: RedisClient): SamlConfig {
  if (adMock) return { cert: 'mock-certificate' }
  if (!adConfig) throw Error('Missing AD SAML configuration')
  return {
    acceptedClockSkewMs: 0,
    audience: adConfig.issuer,
    cacheProvider: redisClient
      ? redisCacheProvider(redisClient, { keyPrefix: 'ad-saml-resp:' })
      : undefined,
    callbackUrl: adConfig.callbackUrl,
    cert: Array.isArray(adConfig.publicCert)
      ? adConfig.publicCert.map(
          (certificateName) => certificates[certificateName]
        )
      : adConfig.publicCert,
    disableRequestedAuthnContext: true,
    entryPoint: adConfig.entryPoint,
    identifierFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
    issuer: adConfig.issuer,
    logoutUrl: adConfig.logoutUrl,
    privateKey: readFileSync(adConfig.privateCert, { encoding: 'utf8' }),
    signatureAlgorithm: 'sha256',
    validateInResponseTo: true
  }
}

export default function createAdStrategy(
  config: SamlConfig
): SamlStrategy | DevPassportStrategy {
  if (adMock) {
    const getter = async (userId: string) => {
      const employee = await getEmployeeByExternalId(userId)
      return verifyProfile({
        nameID: 'dummyid',
        [AD_USER_ID_KEY]: userId,
        [AD_ROLES_KEY]: [],
        [AD_GIVEN_NAME_KEY]: employee.firstName,
        [AD_FAMILY_NAME_KEY]: employee.lastName,
        [AD_EMAIL_KEY]: employee.email ? employee.email : ''
      })
    }

    const upserter = async (
      userId: string,
      roles: string[],
      firstName: string,
      lastName: string,
      email: string
    ) => {
      if (!userId) throw Error('No user ID in SAML data')
      await upsertEmployee({
        firstName,
        lastName,
        email,
        externalId: `${adExternalIdPrefix}:${userId}`,
        roles: roles as UserRole[]
      })
      return verifyProfile({
        nameID: 'dummyid',
        [AD_USER_ID_KEY]: userId,
        [AD_ROLES_KEY]: roles,
        [AD_GIVEN_NAME_KEY]: firstName,
        [AD_FAMILY_NAME_KEY]: lastName,
        [AD_EMAIL_KEY]: email
      })
    }

    return new DevPassportStrategy(getter, upserter)
  } else {
    return new SamlStrategy(
      config,
      (profile: Profile | null | undefined, done: VerifiedCallback) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        verifyProfile(profile as any as AdProfile)
          .then((user) => done(null, user))
          .catch(done)
      }
    )
  }
}
