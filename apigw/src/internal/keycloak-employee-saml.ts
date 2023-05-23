// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { SamlConfig, Strategy as SamlStrategy } from '@node-saml/passport-saml'
import { employeeLogin } from '../shared/service-client'
import { createSamlStrategy } from '../shared/saml'
import { z } from 'zod'

const Profile = z.object({
  id: z.string(),
  email: z.string().optional(),
  firstName: z.string(),
  lastName: z.string()
})

export function createKeycloakEmployeeSamlStrategy(
  config: SamlConfig
): SamlStrategy {
  return createSamlStrategy(config, Profile, async (profile) => {
    const asString = (value: unknown) =>
      value == null ? undefined : String(value)

    const id = asString(profile['id'])
    if (!id) throw Error('No user ID in evaka IDP SAML data')
    const person = await employeeLogin({
      externalId: `evaka:${id}`,
      firstName: asString(profile['firstName']) ?? '',
      lastName: asString(profile['lastName']) ?? '',
      email: asString(profile['email'])
    })
    return {
      id: person.id,
      userType: 'EMPLOYEE',
      globalRoles: person.globalRoles,
      allScopedRoles: person.allScopedRoles
    }
  })
}