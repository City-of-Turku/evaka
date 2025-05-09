// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import HelsinkiDateTime from 'lib-common/helsinki-date-time'

import config from '../../config'
import { execSimpleApplicationActions } from '../../dev-api'
import {
  applicationFixture,
  familyWithDeadGuardian,
  Fixture,
  testCareArea,
  testDaycare
} from '../../dev-api/fixtures'
import {
  createApplications,
  resetServiceState
} from '../../generated/api-clients'
import ApplicationListView from '../../pages/employee/applications/application-list-view'
import EmployeeNav from '../../pages/employee/employee-nav'
import { Page } from '../../utils/page'
import { employeeLogin } from '../../utils/user'

let page: Page
let applicationsPage: ApplicationListView

beforeEach(async () => {
  await resetServiceState()
  await testCareArea.save()
  await testDaycare.save()
  await familyWithDeadGuardian.save()
  const serviceWorker = await Fixture.employee().serviceWorker().save()

  page = await Page.open()
  applicationsPage = new ApplicationListView(page)

  await employeeLogin(page, serviceWorker)
  await page.goto(config.employeeUrl)
  await new EmployeeNav(page).applicationsTab.click()
})

describe('Applications', () => {
  test('Application with a dead applicant has to be manually sent', async () => {
    const application = applicationFixture(
      familyWithDeadGuardian.children[0],
      familyWithDeadGuardian.guardian,
      familyWithDeadGuardian.otherGuardian,
      'DAYCARE'
    )
    await createApplications({ body: [application] })
    await execSimpleApplicationActions(
      application.id,
      [
        'MOVE_TO_WAITING_PLACEMENT',
        'CREATE_DEFAULT_PLACEMENT_PLAN',
        'SEND_DECISIONS_WITHOUT_PROPOSAL'
      ],
      HelsinkiDateTime.now() // TODO: use mock clock
    )

    await applicationsPage.filterByApplicationStatus('ALL')
    await applicationsPage.searchButton.click()
    await applicationsPage
      .applicationRow(application.id)
      .status.assertTextEquals('Odottaa postitusta')
  })

  test('Application with a dead applicant has an indicator for the date of death', async () => {
    const application = applicationFixture(
      familyWithDeadGuardian.children[0],
      familyWithDeadGuardian.guardian,
      familyWithDeadGuardian.otherGuardian,
      'DAYCARE'
    )
    await createApplications({ body: [application] })

    await applicationsPage.filterByApplicationStatus('ALL')
    await applicationsPage.searchButton.click()
    const applicationDetails = await applicationsPage
      .applicationRow(application.id)
      .openApplication()
    await applicationDetails.assertApplicantIsDead()
  })
})
