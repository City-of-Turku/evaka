// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import Home from '../../pages/employee/home'
import FridgeHeadInformationPage from '../../pages/employee/fridge-head-information/fridge-head-information-page'
import ChildInformationPage from '../../pages/employee/child-information/child-information-page'
import {
  initializeAreaAndPersonData,
  AreaAndPersonFixtures
} from 'e2e-test-common/dev-api/data-init'
import { logConsoleMessages } from '../../utils/fixture'
import {
  insertFeeThresholds,
  insertDefaultServiceNeedOptions,
  insertVoucherValues,
  resetDatabase,
  runPendingAsyncJobs
} from 'e2e-test-common/dev-api'
import { t } from 'testcafe'
import { employeeLogin, seppoAdmin } from '../../config/users'
import { PersonDetail } from 'e2e-test-common/dev-api/types'
import DateRange from 'lib-common/date-range'
import LocalDate from 'lib-common/local-date'

const home = new Home()
const fridgeHeadInformation = new FridgeHeadInformationPage()
const childInformation = new ChildInformationPage()

let fixtures: AreaAndPersonFixtures
let regularPerson: PersonDetail
let fridgePartner: PersonDetail
let child: PersonDetail

fixture('Employee - Head of family details')
  .meta({ type: 'regression', subType: 'childinformation' })
  .beforeEach(async () => {
    await resetDatabase()
    fixtures = await initializeAreaAndPersonData()
    await insertDefaultServiceNeedOptions()
    await insertVoucherValues()
    regularPerson = fixtures.familyWithTwoGuardians.guardian
    fridgePartner = fixtures.familyWithTwoGuardians.otherGuardian
    child = fixtures.familyWithTwoGuardians.children[0]
    await insertFeeThresholds({
      validDuring: new DateRange(LocalDate.of(2020, 1, 1), null),
      minIncomeThreshold2: 210200,
      minIncomeThreshold3: 271300,
      minIncomeThreshold4: 308000,
      minIncomeThreshold5: 344700,
      minIncomeThreshold6: 381300,
      maxIncomeThreshold2: 479900,
      maxIncomeThreshold3: 541000,
      maxIncomeThreshold4: 577700,
      maxIncomeThreshold5: 614400,
      maxIncomeThreshold6: 651000,
      incomeMultiplier2: 0.107,
      incomeMultiplier3: 0.107,
      incomeMultiplier4: 0.107,
      incomeMultiplier5: 0.107,
      incomeMultiplier6: 0.107,
      incomeThresholdIncrease6Plus: 14200,
      siblingDiscount2: 0.5,
      siblingDiscount2Plus: 0.8,
      minFee: 2700,
      maxFee: 28900
    })
    await employeeLogin(t, seppoAdmin, home.homePage('admin'))
  })
  .afterEach(logConsoleMessages)

test('guardian has restriction details enabled', async () => {
  await home.navigateToGuardianInformation(fixtures.restrictedPersonFixture.id)
  await fridgeHeadInformation.verifyRestrictedDetails(true)
})

test('guardian does not have restriction details enabled', async () => {
  await home.navigateToGuardianInformation(regularPerson.id)
  await fridgeHeadInformation.verifyRestrictedDetails(false)
})

test('Zero-year-old child is shown as age 0', async () => {
  await home.navigateToGuardianInformation(regularPerson.id)
  await fridgeHeadInformation.addChild({
    searchWord: fixtures.personFixtureChildZeroYearOld.firstName,
    startDate: '01.01.2020'
  })

  await fridgeHeadInformation.verifyFridgeChildAge({
    age: 0
  })

  await fridgeHeadInformation.verifyFamilyPerson({
    personId: fixtures.personFixtureChildZeroYearOld.id,
    age: 0
  })
})

test('Retroactive fee decisions can start before the minimum fee decision date', async () => {
  await home.navigateToGuardianInformation(regularPerson.id)
  await fridgeHeadInformation.addChild({
    searchWord: child.firstName,
    startDate: '01.01.2020'
  })

  await home.navigateToChildInformation(child.id)
  await childInformation.createNewPlacement({
    unitName: fixtures.daycareFixture.name,
    startDate: '01.01.2020',
    endDate: '31.07.2020'
  })

  await runPendingAsyncJobs()
  await home.navigateToGuardianInformation(regularPerson.id)
  await fridgeHeadInformation.verifyFeeDecision({
    startDate: '01.03.2020',
    endDate: '31.07.2020',
    status: 'Luonnos'
  })

  await fridgeHeadInformation.createRetroactiveFeeDecisions('01.01.2020')
  await fridgeHeadInformation.verifyFeeDecision({
    startDate: '01.01.2020',
    endDate: '31.07.2020',
    status: 'Luonnos'
  })
})

test('Added partner is shown n family overview', async () => {
  await home.navigateToGuardianInformation(regularPerson.id)
  await fridgeHeadInformation.addPartner({
    searchWord: fridgePartner.firstName,
    startDate: '01.01.2020'
  })

  await fridgeHeadInformation.verifyFamilyPerson({ personId: fridgePartner.id })
})

test('Manually added income is shown in family overview', async () => {
  const income = 1000

  await home.navigateToGuardianInformation(regularPerson.id)
  await fridgeHeadInformation.addIncome({
    mainIncome: income
  })

  await fridgeHeadInformation.verifyFamilyPerson({
    personId: regularPerson.id,
    incomeCents: income * 100
  })
})
