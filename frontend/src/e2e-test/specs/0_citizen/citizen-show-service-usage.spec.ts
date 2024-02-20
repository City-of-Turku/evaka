// SPDX-FileCopyrightText: 2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import LocalDate from 'lib-common/local-date'
import LocalTime from 'lib-common/local-time'
import TimeRange from 'lib-common/time-range'

import { resetDatabase } from '../../dev-api'
import {
  careAreaFixture,
  daycareFixture,
  enduserChildFixtureKaarina,
  enduserGuardianFixture,
  Fixture
} from '../../dev-api/fixtures'
import CitizenCalendarPage from '../../pages/citizen/citizen-calendar'
import CitizenHeader from '../../pages/citizen/citizen-header'
import { Page } from '../../utils/page'
import { enduserLogin } from '../../utils/user'

const today = LocalDate.of(2022, 1, 14)
const yesterday = today.subDays(1)
let page: Page

async function openCalendarPage() {
  page = await Page.open({
    mockedTime: today.toHelsinkiDateTime(LocalTime.of(12, 0))
  })
  await enduserLogin(page)
  const header = new CitizenHeader(page, 'desktop')
  await header.selectTab('calendar')
  return new CitizenCalendarPage(page, 'desktop')
}

describe('Service time usage', () => {
  beforeEach(async () => {
    await resetDatabase()

    await Fixture.careArea().with(careAreaFixture).save()
    await Fixture.daycare().with(daycareFixture).save()
    const guardian = await Fixture.person().with(enduserGuardianFixture).save()
    const child = await Fixture.person().with(enduserChildFixtureKaarina).save()
    await Fixture.child(enduserChildFixtureKaarina.id).save()
    await Fixture.guardian(child, guardian).save()

    const daycareSupervisor = await Fixture.employeeUnitSupervisor(
      daycareFixture.id
    ).save()

    const serviceNeedOption = await Fixture.serviceNeedOption()
      .with({
        validPlacementType: 'DAYCARE',
        defaultOption: false,
        nameFi: 'Kokopäiväinen',
        nameSv: 'Kokopäiväinen (sv)',
        nameEn: 'Kokopäiväinen (en)',
        daycareHoursPerMonth: 140
      })
      .save()

    const placement = await Fixture.placement()
      .with({
        childId: enduserChildFixtureKaarina.id,
        unitId: daycareFixture.id,
        type: 'DAYCARE',
        startDate: yesterday,
        endDate: today.addYears(1)
      })
      .save()
    await Fixture.serviceNeed()
      .with({
        placementId: placement.data.id,
        startDate: yesterday,
        endDate: today.addYears(1),
        optionId: serviceNeedOption.data.id,
        confirmedBy: daycareSupervisor.data.id
      })
      .save()
  })

  it('Reservation time shown in monthly summary', async () => {
    await Fixture.attendanceReservation({
      type: 'RESERVATIONS',
      date: yesterday,
      childId: enduserChildFixtureKaarina.id,
      reservation: new TimeRange(LocalTime.of(8, 0), LocalTime.of(16, 0)),
      secondReservation: null
    }).save()

    const calendarPage = await openCalendarPage()
    const summary = await calendarPage.openMonthlySummary(
      today.year,
      today.month
    )
    await summary.title.assertTextEquals('Läsnäolot 01.01. - 31.01.2022')
    await summary.textElement.assertTextEquals(
      'Kaarina\n' + '\n' + 'Suunnitelma 8 h / 140 h\n' + 'Toteuma 8 h / 140 h'
    )
  })

  it('Attendance time shown in monthly summary', async () => {
    await Fixture.childAttendance()
      .with({
        childId: enduserChildFixtureKaarina.id,
        unitId: daycareFixture.id,
        date: yesterday,
        arrived: LocalTime.of(8, 0),
        departed: LocalTime.of(15, 30)
      })
      .save()

    const calendarPage = await openCalendarPage()
    const summary = await calendarPage.openMonthlySummary(
      today.year,
      today.month
    )
    await summary.title.assertTextEquals('Läsnäolot 01.01. - 31.01.2022')
    await summary.textElement.assertTextEquals(
      'Kaarina\n' +
        '\n' +
        'Suunnitelma - / 140 h\n' +
        'Toteuma 7 h 30 min / 140 h'
    )
  })

  it('Service time usage based on reservation shown in day view', async () => {
    await Fixture.attendanceReservation({
      type: 'RESERVATIONS',
      date: yesterday,
      childId: enduserChildFixtureKaarina.id,
      reservation: new TimeRange(LocalTime.of(8, 0), LocalTime.of(16, 0)),
      secondReservation: null
    }).save()

    const calendarPage = await openCalendarPage()
    const dayView = await calendarPage.openDayView(yesterday)
    await dayView
      .getUsedService(enduserChildFixtureKaarina.id)
      .assertTextEquals('08:00–16:00 (8 h)')
  })

  it('Service time usage based on attendance shown in day view', async () => {
    await Fixture.childAttendance()
      .with({
        childId: enduserChildFixtureKaarina.id,
        unitId: daycareFixture.id,
        date: today,
        arrived: LocalTime.of(8, 0),
        departed: LocalTime.of(15, 30)
      })
      .save()

    const calendarPage = await openCalendarPage()
    const dayView = await calendarPage.openDayView(today)
    await dayView
      .getUsedService(enduserChildFixtureKaarina.id)
      .assertTextEquals('08:00–15:30 (7 h 30 min)')
    await dayView
      .getServiceUsageWarning(enduserChildFixtureKaarina.id)
      .assertTextEquals('Toteunut läsnäoloaika ylittää ilmoitetun ajan.')
  })

  it('Service time warning when attendance is longer than reservation', async () => {
    await Fixture.attendanceReservation({
      type: 'RESERVATIONS',
      date: today,
      childId: enduserChildFixtureKaarina.id,
      reservation: new TimeRange(LocalTime.of(8, 0), LocalTime.of(15, 30)),
      secondReservation: null
    }).save()
    await Fixture.childAttendance()
      .with({
        childId: enduserChildFixtureKaarina.id,
        unitId: daycareFixture.id,
        date: today,
        arrived: LocalTime.of(7, 55),
        departed: LocalTime.of(16, 0)
      })
      .save()

    const calendarPage = await openCalendarPage()
    const dayView = await calendarPage.openDayView(today)
    await dayView
      .getUsedService(enduserChildFixtureKaarina.id)
      .assertTextEquals('07:55–16:00 (8 h 5 min)')
    await dayView
      .getServiceUsageWarning(enduserChildFixtureKaarina.id)
      .assertTextEquals(
        'Saapunut ilmoitettua aikaisemmin. Lähtenyt ilmoitettua myöhemmin.'
      )
  })
})