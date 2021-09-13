// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import {
  createDaycarePlacementFixture,
  daycareGroupFixture,
  uuidv4
} from 'e2e-test-common/dev-api/fixtures'
import AdminHome from '../../pages/home'
import EmployeeHome from '../../pages/employee/home'
import UnitPage, {
  daycareGroupElement
} from '../../pages/employee/units/unit-page'
import { DaycarePlacement } from 'e2e-test-common/dev-api/types'
import config from 'e2e-test-common/config'
import {
  initializeAreaAndPersonData,
  AreaAndPersonFixtures
} from 'e2e-test-common/dev-api/data-init'
import {
  insertDaycareGroupFixtures,
  insertDaycarePlacementFixtures,
  insertEmployeeFixture,
  insertServiceNeedOptions,
  resetDatabase,
  setAclForDaycares
} from 'e2e-test-common/dev-api'
import { logConsoleMessages } from '../../utils/fixture'
import AbsencesPage from '../../pages/employee/absences/absences-page'
import { t } from 'testcafe'
import { employeeLogin, seppoManager } from '../../config/users'

const adminHome = new AdminHome()
const employeeHome = new EmployeeHome()
const unitPage = new UnitPage()
const absencesPage = new AbsencesPage()

let fixtures: AreaAndPersonFixtures
let daycarePlacementFixture: DaycarePlacement

fixture('Employee - Absences')
  .meta({ type: 'regression', subType: 'absences' })
  .beforeEach(async () => {
    await resetDatabase()
    fixtures = await initializeAreaAndPersonData()
    await insertServiceNeedOptions()
    await insertDaycareGroupFixtures([daycareGroupFixture])
    await insertEmployeeFixture({
      externalId: config.supervisorExternalId,
      firstName: 'Seppo',
      lastName: 'Sorsa',
      roles: []
    })
    await setAclForDaycares(
      config.supervisorExternalId,
      fixtures.daycareFixture.id
    )

    daycarePlacementFixture = createDaycarePlacementFixture(
      uuidv4(),
      fixtures.enduserChildFixtureJari.id,
      fixtures.daycareFixture.id
    )
    await insertDaycarePlacementFixtures([daycarePlacementFixture])

    await employeeLogin(t, seppoManager, adminHome.homePage('admin'))
    await employeeHome.navigateToUnits()
  })
  .afterEach(logConsoleMessages)

test('User can place a child into a group and remove the child from the group', async (t) => {
  await unitPage.navigateHere(fixtures.daycareFixture.id)
  await unitPage.openTabGroups()
  await unitPage.openGroups()
  const group = daycareGroupElement(unitPage.groups.nth(0))

  await absencesPage.addDaycareGroupPlacement()

  await t.expect(unitPage.missingPlacementRows.count).eql(0)
  await t.expect(group.groupPlacementRows.count).eql(1)

  await absencesPage.removeDaycareGroupPlacement()
  await t.expect(unitPage.missingPlacementRows.count).eql(1)
  await t.expect(group.groupPlacementRows.count).eql(0)
})

test('User can open the absence dialog', async (t) => {
  await unitPage.navigateHere(fixtures.daycareFixture.id)
  await unitPage.openTabGroups()
  await unitPage.openGroups()
  const group = daycareGroupElement(unitPage.groups.nth(0))
  await absencesPage.addDaycareGroupPlacement()

  await t.click(absencesPage.btnOpenAbsenceDiary)
  await t
    .expect(absencesPage.absencesUnitName.innerText)
    .eql(fixtures.daycareFixture.name)

  await unitPage.openTabGroups()

  await unitPage.openGroups()
  await absencesPage.removeDaycareGroupPlacement()
  await t.expect(group.groupPlacementRows.count).eql(0)
})

test('User can find the child in the absence dialog', async (t) => {
  await unitPage.navigateHere(fixtures.daycareFixture.id)
  await unitPage.openTabGroups()
  await unitPage.openGroups()
  const group = daycareGroupElement(unitPage.groups.nth(0))

  await absencesPage.addDaycareGroupPlacement()

  await t.click(absencesPage.btnOpenAbsenceDiary)
  await absencesPage.tryToFindAnyChildWithinNext24Months(
    createDaycarePlacementFixture(
      uuidv4(),
      fixtures.enduserChildFixtureJari.id,
      fixtures.daycareFixture.id
    )
  )
  await t.expect(absencesPage.absenceTableChildLink.exists).ok()
  await unitPage.openTabGroups()

  await unitPage.openGroups()
  await absencesPage.removeDaycareGroupPlacement()
  await t.expect(group.groupPlacementRows.count).eql(0)
})

test('User can add a sickleave to a child', async (t) => {
  await unitPage.navigateHere(fixtures.daycareFixture.id)
  await unitPage.openTabGroups()
  await unitPage.openGroups()
  const group = daycareGroupElement(unitPage.groups.nth(0))

  await absencesPage.addDaycareGroupPlacement()

  await t.click(absencesPage.btnOpenAbsenceDiary)
  await absencesPage.tryToFindAnyChildWithinNext24Months(
    createDaycarePlacementFixture(
      uuidv4(),
      fixtures.enduserChildFixtureJari.id,
      fixtures.daycareFixture.id
    )
  )

  await absencesPage.addBillableAbsence('SICKLEAVE')
  await t.expect(absencesPage.absenceIndicatorRight('SICKLEAVE').exists).ok()

  await unitPage.openTabGroups()

  await unitPage.openGroups()
  await absencesPage.removeDaycareGroupPlacement()
  await t.expect(group.groupPlacementRows.count).eql(0)
})

test('Adding another leave type will override the previous one', async (t) => {
  await unitPage.navigateHere(fixtures.daycareFixture.id)
  await unitPage.openTabGroups()
  await unitPage.openGroups()
  const group = daycareGroupElement(unitPage.groups.nth(0))

  await absencesPage.addDaycareGroupPlacement()

  await t.click(absencesPage.btnOpenAbsenceDiary)
  await absencesPage.tryToFindAnyChildWithinNext24Months(
    createDaycarePlacementFixture(
      uuidv4(),
      fixtures.enduserChildFixtureJari.id,
      fixtures.daycareFixture.id
    )
  )
  await absencesPage.addBillableAbsence('SICKLEAVE')
  await t.expect(absencesPage.absenceIndicatorRight('SICKLEAVE').exists).ok()
  await absencesPage.addBillableAbsence('UNKNOWN_ABSENCE')
  await t.expect(absencesPage.absenceIndicatorRight('SICKLEAVE').exists).notOk()
  await t
    .expect(absencesPage.absenceIndicatorRight('UNKNOWN_ABSENCE').exists)
    .ok()

  await unitPage.openTabGroups()

  await unitPage.openGroups()
  await absencesPage.removeDaycareGroupPlacement()
  await t.expect(group.groupPlacementRows.count).eql(0)
})

test('User can clear an absence', async (t) => {
  await unitPage.navigateHere(fixtures.daycareFixture.id)
  await unitPage.openTabGroups()
  await unitPage.openGroups()
  const group = daycareGroupElement(unitPage.groups.nth(0))

  await absencesPage.addDaycareGroupPlacement()

  await t.click(absencesPage.btnOpenAbsenceDiary)
  await absencesPage.tryToFindAnyChildWithinNext24Months(
    createDaycarePlacementFixture(
      uuidv4(),
      fixtures.enduserChildFixtureJari.id,
      fixtures.daycareFixture.id
    )
  )
  await absencesPage.addBillableAbsence('SICKLEAVE')
  await t.expect(absencesPage.absenceIndicatorRight('SICKLEAVE').exists).ok()
  await absencesPage.addBillableAbsence('PRESENCE')
  await t.expect(absencesPage.absenceIndicatorRight('SICKLEAVE').exists).notOk()

  await unitPage.openTabGroups()

  await unitPage.openGroups()
  await absencesPage.removeDaycareGroupPlacement()
  await t.expect(group.groupPlacementRows.count).eql(0)
})

test('User can add a staff attendance', async (t) => {
  await unitPage.navigateHere(fixtures.daycareFixture.id)
  await unitPage.openTabGroups()
  await unitPage.openGroups()
  const group = daycareGroupElement(unitPage.groups.nth(0))

  await absencesPage.addDaycareGroupPlacement()

  await t.click(absencesPage.btnOpenAbsenceDiary)
  await absencesPage.tryToFindAnyChildWithinNext24Months(
    createDaycarePlacementFixture(
      uuidv4(),
      fixtures.enduserChildFixtureJari.id,
      fixtures.daycareFixture.id
    )
  )

  await t.expect(absencesPage.staffAttendanceInput.value).eql('')
  await t.typeText(absencesPage.staffAttendanceInput, '3')
  await t.wait(1000) // without this the page wont save the staff attendance
  await unitPage.openTabGroups()
  await t.click(absencesPage.btnOpenAbsenceDiary)
  await absencesPage.tryToFindAnyChildWithinNext24Months(
    createDaycarePlacementFixture(
      uuidv4(),
      fixtures.enduserChildFixtureJari.id,
      fixtures.daycareFixture.id
    )
  )
  await t.expect(absencesPage.staffAttendanceInput.value).eql('3')

  await unitPage.openTabGroups()
  await unitPage.openGroups()
  await absencesPage.removeDaycareGroupPlacement()
  await t.expect(group.groupPlacementRows.count).eql(0)
})
