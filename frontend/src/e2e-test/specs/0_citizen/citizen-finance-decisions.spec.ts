// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import DateRange from 'lib-common/date-range'
import {
  DecisionIncome,
  FeeDecision
} from 'lib-common/generated/api-types/invoicing'
import HelsinkiDateTime from 'lib-common/helsinki-date-time'
import LocalDate from 'lib-common/local-date'

import config from '../../config'
import {
  AreaAndPersonFixtures,
  initializeAreaAndPersonData
} from '../../dev-api/data-init'
import {
  daycareFixture,
  feeDecisionsFixture,
  uuidv4,
  voucherValueDecisionsFixture
} from '../../dev-api/fixtures'
import {
  createFeeDecisions,
  createVoucherValueDecisions,
  resetServiceState
} from '../../generated/api-clients'
import { DevPerson, VoucherValueDecision } from '../../generated/api-types'
import CitizenDecisionsPage from '../../pages/citizen/citizen-decisions'
import CitizenHeader from '../../pages/citizen/citizen-header'
import { Page } from '../../utils/page'
import { enduserLogin } from '../../utils/user'

let page: Page
let header: CitizenHeader
let citizenDecisionsPage: CitizenDecisionsPage
let fixtures: AreaAndPersonFixtures
const now = HelsinkiDateTime.of(2023, 3, 15, 12, 0)

let feeDecision: FeeDecision
let voucherValueDecision: VoucherValueDecision
let headOfFamily: DevPerson
let partner: DevPerson
let child: DevPerson

const feeDecisionValidDuring = new DateRange(LocalDate.of(2023, 1, 1), null)
const voucherValueDecisionValidDuring = new DateRange(
  LocalDate.of(2023, 2, 1),
  null
)

beforeEach(async () => {
  await resetServiceState()
  fixtures = await initializeAreaAndPersonData()
  headOfFamily = fixtures.enduserGuardianFixture
  partner = fixtures.restrictedPersonFixture
  child = fixtures.enduserChildFixtureJari

  feeDecision = feeDecisionsFixture(
    'SENT',
    headOfFamily,
    child,
    daycareFixture.id,
    partner,
    feeDecisionValidDuring,
    now,
    uuidv4(),
    'test-fd-key'
  )
  await insertFeeDecision(feeDecision)
  voucherValueDecision = voucherValueDecisionsFixture(
    uuidv4(),
    headOfFamily.id,
    child.id,
    daycareFixture.id,
    null,
    'SENT',
    voucherValueDecisionValidDuring.start,
    voucherValueDecisionValidDuring.end ?? undefined,
    now.subHours(24),
    'test-vvd-key'
  )
  await insertVoucherValueDecision(voucherValueDecision)
})

const parsePersonNames = (persons: DevPerson[]) =>
  persons.map((person) => `${person.firstName} ${person.lastName}`)

describe('Citizen finance decisions', () => {
  test('Head of family sees their decisions with strong auth', async () => {
    page = await Page.open({ mockedTime: now })
    header = new CitizenHeader(page)
    citizenDecisionsPage = new CitizenDecisionsPage(page)
    await enduserLogin(page)
    await page.goto(config.enduserUrl)

    await header.selectTab('decisions')

    await citizenDecisionsPage.assertFinanceDecisionShown(
      feeDecision.id,
      `Maksupäätös ${feeDecisionValidDuring.start.format()} -`,
      `${feeDecision.sentAt?.format()}`,
      parsePersonNames([headOfFamily, partner])
    )
    await citizenDecisionsPage.assertFinanceDecisionShown(
      voucherValueDecision.id,
      `Arvopäätös ${voucherValueDecisionValidDuring.start.format()} -`,
      `${voucherValueDecision.sentAt?.format()}`,
      parsePersonNames([headOfFamily]),
      parsePersonNames([child])
    )
  })

  test('Partner sees their decisions with strong auth', async () => {
    page = await Page.open({ mockedTime: now })
    header = new CitizenHeader(page)
    citizenDecisionsPage = new CitizenDecisionsPage(page)
    await enduserLogin(page, partner.ssn!)
    await page.goto(config.enduserUrl)

    await header.selectTab('decisions')

    await citizenDecisionsPage.assertFinanceDecisionShown(
      feeDecision.id,
      `Maksupäätös ${feeDecisionValidDuring.start.format()} -`,
      `${feeDecision.sentAt?.format()}`,
      parsePersonNames([headOfFamily, partner])
    )
    await citizenDecisionsPage.assertFinanceDecisionNotShown(
      voucherValueDecision.id
    )
  })
})

async function insertFeeDecision(
  fixture: FeeDecision,
  childIncome: DecisionIncome | null = null
) {
  await createFeeDecisions({
    body: [
      {
        ...fixture,
        children: fixture.children.map((child) => ({
          ...child,
          childIncome
        }))
      }
    ]
  })
}

async function insertVoucherValueDecision(fixture: VoucherValueDecision) {
  await createVoucherValueDecisions({ body: [fixture] })
}
