// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import LocalDate from 'lib-common/local-date'
import { UUID } from 'lib-common/types'

import config from '../../config'
import { resetDatabase } from '../../dev-api'
import { initializeAreaAndPersonData } from '../../dev-api/data-init'
import { Fixture } from '../../dev-api/fixtures'
import ChildInformationPage from '../../pages/employee/child-information'
import { IncomeSection } from '../../pages/employee/guardian-information'
import { waitUntilEqual } from '../../utils'
import { Page } from '../../utils/page'
import { employeeLogin } from '../../utils/user'

let page: Page
let personId: UUID
let incomesSection: IncomeSection

beforeEach(async () => {
  await resetDatabase()

  const fixtures = await initializeAreaAndPersonData()
  personId = fixtures.enduserChildFixtureJari.id

  const financeAdmin = await Fixture.employeeFinanceAdmin().save()

  page = await Page.open()
  await employeeLogin(page, financeAdmin.data)
  await page.goto(config.employeeUrl + '/child-information/' + personId)

  const childInformationPage = new ChildInformationPage(page)
  incomesSection = await childInformationPage.openCollapsible('income')
})

describe('Child Income', () => {
  it('Create a new max fee accepted income', async () => {
    await incomesSection.openNewIncomeForm()

    await incomesSection.fillIncomeStartDate(LocalDate.of(2020, 1, 1))
    await incomesSection.fillIncomeEndDate(LocalDate.of(2020, 1, 31))
    await incomesSection.chooseIncomeEffect('MAX_FEE_ACCEPTED')
    await incomesSection.save()

    await waitUntilEqual(() => incomesSection.incomeListItemCount(), 1)
  })

  it('Create a new income with main income', async () => {
    await incomesSection.openNewIncomeForm()

    await incomesSection.fillIncomeStartDate(LocalDate.of(2020, 1, 1))
    await incomesSection.fillIncomeEndDate(LocalDate.of(2020, 1, 31))
    await incomesSection.chooseIncomeEffect('INCOME')

    await incomesSection.fillIncome('MAIN_INCOME', '5000')
    await incomesSection.save()

    await waitUntilEqual(() => incomesSection.incomeListItemCount(), 1)
    await waitUntilEqual(() => incomesSection.getIncomeSum(), '5000 €')
    await waitUntilEqual(() => incomesSection.getExpensesSum(), '0 €')
  })
})
