// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import {
  initializeAreaAndPersonData,
  AreaAndPersonFixtures
} from 'e2e-test-common/dev-api/data-init'
import { DaycareDailyNoteBody } from 'lib-common/generated/api-types/messaging'
import { logConsoleMessages } from '../../utils/fixture'
import {
  insertBackupCareFixtures,
  insertDaycareGroupPlacementFixtures,
  insertDaycarePlacementFixtures,
  insertEmployeeFixture,
  postDaycareDailyNote,
  postMobileDevice,
  resetDatabase
} from 'e2e-test-common/dev-api'
import { mobileLogin } from '../../config/users'
import { t } from 'testcafe'
import {
  CareAreaBuilder,
  createDaycarePlacementFixture,
  DaycareBuilder,
  DaycareGroupBuilder,
  enduserChildFixtureJari,
  Fixture,
  uuidv4
} from 'e2e-test-common/dev-api/fixtures'
import MobileGroupsPage from '../../pages/employee/mobile/mobile-groups'
import ChildPage from '../../pages/employee/mobile/child-page'
import { DaycarePlacement } from 'e2e-test-common/dev-api/types'
import LocalDate from 'lib-common/local-date'

let fixtures: AreaAndPersonFixtures

const employeeId = uuidv4()
const mobileDeviceId = employeeId
const mobileLongTermToken = uuidv4()
const daycareGroupPlacementId = uuidv4()

let daycarePlacementFixture: DaycarePlacement
let daycareGroup: DaycareGroupBuilder
let daycare: DaycareBuilder
let backupCareDaycareGroup: DaycareGroupBuilder
let backupCareDaycare: DaycareBuilder
let careArea: CareAreaBuilder

fixture('Mobile daily notes for backup care')
  .meta({ type: 'regression', subType: 'mobile' })
  .beforeEach(async () => {
    await resetDatabase()
    fixtures = await initializeAreaAndPersonData()

    await Promise.all([
      insertEmployeeFixture({
        id: employeeId,
        externalId: `espooad: ${employeeId}`,
        firstName: 'Yrjö',
        lastName: 'Varayksikkö',
        email: 'yy@example.com',
        roles: []
      })
    ])

    careArea = await Fixture.careArea().save()
    daycare = await Fixture.daycare().careArea(careArea).save()
    daycareGroup = await Fixture.daycareGroup().daycare(daycare).save()

    daycarePlacementFixture = createDaycarePlacementFixture(
      uuidv4(),
      fixtures.enduserChildFixtureJari.id,
      daycare.data.id
    )

    await insertDaycarePlacementFixtures([daycarePlacementFixture])
    await insertDaycareGroupPlacementFixtures([
      {
        id: daycareGroupPlacementId,
        daycareGroupId: daycareGroup.data.id,
        daycarePlacementId: daycarePlacementFixture.id,
        startDate: daycarePlacementFixture.startDate,
        endDate: daycarePlacementFixture.endDate
      }
    ])

    backupCareDaycare = await Fixture.daycare().careArea(careArea).save()
    backupCareDaycareGroup = await Fixture.daycareGroup()
      .daycare(backupCareDaycare)
      .save()

    await insertBackupCareFixtures([
      {
        id: uuidv4(),
        childId: fixtures.enduserChildFixtureJari.id,
        unitId: backupCareDaycare.data.id,
        groupId: backupCareDaycareGroup.data.id,
        period: {
          start: new Date().toISOString(),
          end: new Date().toISOString()
        }
      }
    ])

    await postMobileDevice({
      id: mobileDeviceId,
      unitId: backupCareDaycare.data.id,
      name: 'testMobileDevice',
      deleted: false,
      longTermToken: mobileLongTermToken
    })

    await mobileLogin(t, mobileLongTermToken)
  })
  .afterEach(logConsoleMessages)

const mobileGroupsPage = new MobileGroupsPage()
const childPage = new ChildPage()

test('Daycare daily note is shown for backupcare child', async (t) => {
  const daycareDailyNote: DaycareDailyNoteBody = {
    groupId: backupCareDaycareGroup.data.id,
    childId: enduserChildFixtureJari.id,
    date: LocalDate.today(),
    note: 'Testi viesti',
    feedingNote: 'MEDIUM',
    sleepingMinutes: null,
    sleepingNote: 'NONE',
    reminders: ['DIAPERS'],
    reminderNote: 'Ei enää pähkinöitä antaa saa'
  }

  await postDaycareDailyNote(daycareDailyNote)

  await t
    .expect(
      mobileGroupsPage.childName(fixtures.enduserChildFixtureJari.id)
        .textContent
    )
    .eql(
      `${fixtures.enduserChildFixtureJari.firstName} ${fixtures.enduserChildFixtureJari.lastName}`
    )

  await t
    .expect(
      mobileGroupsPage.childDailyNoteLink(fixtures.enduserChildFixtureJari.id)
        .visible
    )
    .ok()
})

test('User can create a daily note for a backup care child', async (t) => {
  const daycareDailyNote: DaycareDailyNoteBody = {
    groupId: null,
    childId: enduserChildFixtureJari.id,
    date: LocalDate.today(),
    note: 'Testi viesti',
    feedingNote: 'MEDIUM',
    sleepingMinutes: 140,
    sleepingNote: 'NONE',
    reminders: ['DIAPERS'],
    reminderNote: 'Ei saa pähkinöitä antaa'
  }
  const hours =
    Math.floor(Number(daycareDailyNote.sleepingMinutes) / 60) > 0
      ? Math.floor(Number(daycareDailyNote.sleepingMinutes) / 60).toString()
      : ''
  const minutes =
    Number(daycareDailyNote.sleepingMinutes) % 60 > 0
      ? (Number(daycareDailyNote.sleepingMinutes) % 60).toString()
      : ''

  await t
    .expect(
      mobileGroupsPage.childName(fixtures.enduserChildFixtureJari.id)
        .textContent
    )
    .eql(
      `${fixtures.enduserChildFixtureJari.firstName} ${fixtures.enduserChildFixtureJari.lastName}`
    )

  await t
    .expect(
      mobileGroupsPage.childDailyNoteLink(fixtures.enduserChildFixtureJari.id)
        .visible
    )
    .notOk()

  await childPage.createDailyNote(
    fixtures.enduserChildFixtureJari,
    mobileGroupsPage,
    daycareDailyNote
  )

  await t.click(
    mobileGroupsPage.childDailyNoteLink(fixtures.enduserChildFixtureJari.id)
  )
  await t
    .expect(childPage.dailyNoteNoteInput.textContent)
    .eql(daycareDailyNote.note)
  await t.expect(childPage.dailyNoteSleepingTimeHoursInput.value).eql(hours)
  await t.expect(childPage.dailyNoteSleepingTimeMinutesInput.value).eql(minutes)
  await t
    .expect(childPage.dailyNoteReminderNoteInput.textContent)
    .eql(daycareDailyNote.reminderNote)
})

test('User can delete a daily note for a backup care child', async (t) => {
  const daycareDailyNote: DaycareDailyNoteBody = {
    groupId: null,
    childId: enduserChildFixtureJari.id,
    date: LocalDate.today(),
    note: 'Testi viesti',
    feedingNote: 'MEDIUM',
    sleepingMinutes: null,
    sleepingNote: 'NONE',
    reminders: ['DIAPERS'],
    reminderNote: 'Ei enää pähkinöitä antaa saa'
  }

  await postDaycareDailyNote(daycareDailyNote)

  await t.click(
    mobileGroupsPage.childDailyNoteLink(fixtures.enduserChildFixtureJari.id)
  )

  await childPage.deleteDailyNote()

  await t
    .expect(
      mobileGroupsPage.childDailyNoteLink(fixtures.enduserChildFixtureJari.id)
        .visible
    )
    .notOk()
})

test('User can see group daily note for a backup care child in the group', async (t) => {
  const daycareDailyNote: DaycareDailyNoteBody = {
    groupId: backupCareDaycareGroup.data.id,
    childId: null,
    date: LocalDate.today(),
    note: 'Testi ryhmäviesti',
    feedingNote: 'MEDIUM',
    sleepingMinutes: 3,
    sleepingNote: 'NONE',
    reminders: [],
    reminderNote: ''
  }

  await postDaycareDailyNote(daycareDailyNote)

  await t.click(mobileGroupsPage.childRow(enduserChildFixtureJari.id))
  await t.click(mobileGroupsPage.childDailyNoteLink2)

  await t.click(mobileGroupsPage.groupNoteTab)

  await t
    .expect(childPage.dailyNoteGroupNoteInput.value)
    .eql(daycareDailyNote.note)
})
