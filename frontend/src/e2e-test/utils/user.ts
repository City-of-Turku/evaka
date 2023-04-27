// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import config from '../config'

import { Page, TextInput } from './page'

export async function enduserLogin(page: Page, ssn = '070644-937X') {
  const authUrl = `${config.citizenApiUrl}/auth/saml/login/callback?RelayState=%2Fapplications`
  if (!page.url.startsWith(config.enduserUrl)) {
    // We must be in the correct domain to be able to fetch()
    await page.goto(config.enduserLoginUrl)
  }

  await page.page.evaluate(
    ({ ssn, authUrl }: { ssn: string; authUrl: string }) => {
      const params = new URLSearchParams()
      params.append('preset', ssn)
      return fetch(authUrl, {
        method: 'POST',
        body: params,
        redirect: 'manual'
      }).then((response) => {
        if (response.status >= 400) {
          throw new Error(
            `Fetch to {authUrl} failed with status ${response.status}`
          )
        }
      })
    },
    { ssn, authUrl }
  )
  await page.goto(config.enduserUrl + '/applications')
}

export async function enduserLoginWeak(page: Page) {
  await page.goto(config.enduserLoginUrl)
  await page.findByDataQa('weak-login').click()

  await new TextInput(page.find('[id="username"]')).fill('test@example.com')
  await new TextInput(page.find('[id="password"]')).fill('test123')
  await page.find('[id="kc-login"]').click()

  await page.findByDataQa('header-city-logo').waitUntilVisible()
}

export async function employeeLogin(
  page: Page,
  {
    externalId,
    firstName,
    lastName,
    email
  }: {
    externalId: string
    firstName: string
    lastName: string
    email?: string
  }
) {
  const authUrl = `${config.apiUrl}/auth/saml/login/callback?RelayState=%2Femployee`
  const preset = JSON.stringify({
    externalId,
    firstName,
    lastName,
    email: email ?? ''
  })

  if (!page.url.startsWith(config.employeeUrl)) {
    // We must be in the correct domain to be able to fetch()
    await page.goto(config.employeeLoginUrl)
  }

  await page.page.evaluate(
    ({ preset, authUrl }: { preset: string; authUrl: string }) => {
      const params = new URLSearchParams()
      params.append('preset', preset)
      return fetch(authUrl, {
        method: 'POST',
        body: params,
        redirect: 'manual'
      }).then((response) => {
        if (response.status >= 400) {
          throw new Error(
            `Fetch to {authUrl} failed with status ${response.status}`
          )
        }
      })
    },
    { preset, authUrl }
  )
}
