// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import LocalDate from 'lib-common/local-date'
import { UUID } from 'lib-common/types'

import { insertDefaultServiceNeedOptions, resetDatabase } from '../../dev-api'
import { initializeAreaAndPersonData } from '../../dev-api/data-init'
import {
  careArea2Fixture,
  daycare2Fixture,
  daycareFixture,
  Fixture,
  uuidv4
} from '../../dev-api/fixtures'
import { Child, Daycare, EmployeeDetail } from '../../dev-api/types'
import { UnitPage } from '../../pages/employee/units/unit'
import {
  ReservationModal,
  UnitAttendancesSection,
  UnitCalendarPage
} from '../../pages/employee/units/unit-attendances-page'
import { waitUntilEqual } from '../../utils'
import { Page } from '../../utils/page'
import { employeeLogin } from '../../utils/user'

let page: Page
let unitPage: UnitPage
let calendarPage: UnitCalendarPage
let attendancesSection: UnitAttendancesSection
let reservationModal: ReservationModal
let child1Fixture: Child
let child1DaycarePlacementId: UUID
let daycare: Daycare
let unitSupervisor: EmployeeDetail

const mockedToday = LocalDate.of(2023, 2, 15)
const placementStartDate = mockedToday.subWeeks(4)
const placementEndDate = mockedToday.addWeeks(4)
const backupCareStartDate = mockedToday.startOfWeek().addWeeks(2)
const backupCareEndDate = backupCareStartDate.addDays(8)
const groupId: UUID = uuidv4()

beforeEach(async () => {
  await resetDatabase()

  const fixtures = await initializeAreaAndPersonData()
  const careArea = await Fixture.careArea().with(careArea2Fixture).save()
  await Fixture.daycare().with(daycare2Fixture).careArea(careArea).save()

  daycare = daycare2Fixture

  unitSupervisor = (await Fixture.employeeUnitSupervisor(daycare.id).save())
    .data

  await insertDefaultServiceNeedOptions()

  await Fixture.daycareGroup()
    .with({
      id: groupId,
      daycareId: daycare.id,
      name: 'Testailijat'
    })
    .save()

  const groupId2 = uuidv4()
  await Fixture.daycareGroup()
    .with({
      id: groupId2,
      daycareId: daycareFixture.id,
      name: 'Testailijat Toisessa'
    })
    .save()

  child1Fixture = fixtures.familyWithTwoGuardians.children[0]
  child1DaycarePlacementId = uuidv4()
  await Fixture.placement()
    .with({
      id: child1DaycarePlacementId,
      childId: child1Fixture.id,
      unitId: daycare.id,
      startDate: placementStartDate.formatIso(),
      endDate: placementEndDate.formatIso()
    })
    .save()

  await Fixture.backupCare()
    .with({
      id: uuidv4(),
      childId: child1Fixture.id,
      unitId: daycareFixture.id,
      groupId: groupId2,
      period: {
        start: backupCareStartDate.formatIso(),
        end: backupCareEndDate.formatIso()
      }
    })
    .save()

  await Fixture.groupPlacement()
    .with({
      daycareGroupId: groupId,
      daycarePlacementId: child1DaycarePlacementId,
      startDate: placementStartDate.formatIso(),
      endDate: placementEndDate.formatIso()
    })
    .save()

  page = await Page.open({ mockedTime: mockedToday.toSystemTzDate() })
  await employeeLogin(page, unitSupervisor)
})

const loadUnitAttendancesSection =
  async (): Promise<UnitAttendancesSection> => {
    unitPage = new UnitPage(page)
    await unitPage.navigateToUnit(daycare.id)
    calendarPage = await unitPage.openCalendarPage()
    return calendarPage.attendancesSection
  }

describe('Unit group calendar', () => {
  test('Employee sees row for child', async () => {
    attendancesSection = await loadUnitAttendancesSection()
    await calendarPage.selectMode('week')
    await waitUntilEqual(
      () => attendancesSection.childRowCount(child1Fixture.id),
      1
    )
  })

  test('Child in backup care for the entire week is shown', async () => {
    attendancesSection = await loadUnitAttendancesSection()
    await calendarPage.selectMode('week')
    await calendarPage.changeWeekToDate(backupCareStartDate)
    await waitUntilEqual(
      () => attendancesSection.childInOtherUnitCount(child1Fixture.id),
      7
    )
  })

  test('Child in backup care during the week is shown', async () => {
    attendancesSection = await loadUnitAttendancesSection()
    await calendarPage.selectMode('week')
    await calendarPage.changeWeekToDate(backupCareEndDate)
    await waitUntilEqual(
      () => attendancesSection.childInOtherUnitCount(child1Fixture.id),
      2
    )
  })

  test('Employee can add reservation', async () => {
    attendancesSection = await loadUnitAttendancesSection()
    await calendarPage.selectMode('week')
    reservationModal = await attendancesSection.openReservationModal(
      child1Fixture.id
    )
    await reservationModal.addReservation(mockedToday)
  })
})

describe('Unit group calendar for shift care unit', () => {
  test('Employee can add two reservations for day and sees two rows', async () => {
    attendancesSection = await loadUnitAttendancesSection()

    await calendarPage.selectMode('week')

    reservationModal = await attendancesSection.openReservationModal(
      child1Fixture.id
    )
    await reservationModal.selectRepetitionType('IRREGULAR')

    const startDate = mockedToday
    await reservationModal.setStartDate(startDate.format())
    await reservationModal.setEndDate(startDate.format())
    await reservationModal.setStartTime('00:00', 0)
    await reservationModal.setEndTime('12:00', 0)

    await reservationModal.addNewTimeRow(0)

    await reservationModal.setStartTime('20:00', 1)
    await reservationModal.setEndTime('00:00', 1)
    await reservationModal.save()

    await waitUntilEqual(
      () => attendancesSection.childRowCount(child1Fixture.id),
      2
    )
  })

  // DST breaks this
  test.skip('Employee sees attendances along reservations', async () => {
    attendancesSection = await loadUnitAttendancesSection()
    await calendarPage.selectMode('week')

    reservationModal = await attendancesSection.openReservationModal(
      child1Fixture.id
    )
    await reservationModal.selectRepetitionType('IRREGULAR')

    const startDate = mockedToday
    const arrived = new Date(`${startDate.formatIso()}T08:30Z`)
    const departed = new Date(`${startDate.formatIso()}T13:30Z`)

    await Fixture.childAttendances()
      .with({
        childId: child1Fixture.id,
        unitId: daycare2Fixture.id,
        arrived,
        departed
      })
      .save()

    const arrived2 = new Date(`${startDate.formatIso()}T18:15Z`)
    const departed2 = new Date(`${startDate.addDays(1).formatIso()}T05:30Z`)

    await Fixture.childAttendances()
      .with({
        childId: child1Fixture.id,
        unitId: daycare2Fixture.id,
        arrived: arrived2,
        departed: departed2
      })
      .save()

    await reservationModal.setStartDate(startDate.format())
    await reservationModal.setEndDate(startDate.format())
    await reservationModal.setStartTime('00:00', 0)
    await reservationModal.setEndTime('12:00', 0)

    await reservationModal.addNewTimeRow(0)

    await reservationModal.setStartTime('20:00', 1)
    await reservationModal.setEndTime('00:00', 1)

    await reservationModal.save()

    await waitUntilEqual(
      () => attendancesSection.childRowCount(child1Fixture.id),
      2
    )

    await waitUntilEqual(
      () => attendancesSection.getReservationStart(startDate, 0),
      '00:00'
    )
    await waitUntilEqual(
      () => attendancesSection.getReservationEnd(startDate, 0),
      '12:00'
    )
    await waitUntilEqual(
      () => attendancesSection.getReservationStart(startDate, 1),
      '20:00'
    )
    await waitUntilEqual(
      () => attendancesSection.getReservationEnd(startDate, 1),
      '23:59'
    )

    await waitUntilEqual(
      () => attendancesSection.getAttendanceStart(startDate, 0),
      `${arrived.getHours()}:${arrived.getMinutes()}`
    )
    await waitUntilEqual(
      () => attendancesSection.getAttendanceEnd(startDate, 0),
      `${departed.getHours()}:${departed.getMinutes()}`
    )
    await waitUntilEqual(
      () => attendancesSection.getAttendanceStart(startDate, 1),
      `${arrived2.getHours()}:${arrived2.getMinutes()}`
    )
    await waitUntilEqual(
      () => attendancesSection.getAttendanceEnd(startDate, 1),
      '23:59'
    )
    await waitUntilEqual(
      () => attendancesSection.getAttendanceStart(startDate.addDays(1), 0),
      '00:00'
    )
    await waitUntilEqual(
      () => attendancesSection.getAttendanceEnd(startDate.addDays(1), 0),
      `0${departed2.getHours()}:${departed2.getMinutes()}`
    )
    await waitUntilEqual(
      () => attendancesSection.getAttendanceStart(startDate.addDays(1), 1),
      '–'
    )
    await waitUntilEqual(
      () => attendancesSection.getAttendanceEnd(startDate.addDays(1), 1),
      '–'
    )
  })

  test('Employee can edit attendances and reservations inline', async () => {
    attendancesSection = await loadUnitAttendancesSection()
    await calendarPage.selectMode('week')
    await attendancesSection.openInlineEditor(child1Fixture.id)
    await attendancesSection.setReservationTimes(mockedToday, '08:00', '16:00')
    await attendancesSection.setAttendanceTimes(mockedToday, '08:02', '15:54')
    await attendancesSection.closeInlineEditor()
    await waitUntilEqual(
      () => attendancesSection.getReservationStart(mockedToday, 0),
      '08:00'
    )
    await waitUntilEqual(
      () => attendancesSection.getReservationEnd(mockedToday, 0),
      '16:00'
    )
    await waitUntilEqual(
      () => attendancesSection.getAttendanceStart(mockedToday, 0),
      '08:02'
    )
    await waitUntilEqual(
      () => attendancesSection.getAttendanceEnd(mockedToday, 0),
      '15:54'
    )
  })

  test('Employee can add attendance without an end', async () => {
    attendancesSection = await loadUnitAttendancesSection()
    await calendarPage.selectMode('week')
    await attendancesSection.openInlineEditor(child1Fixture.id)
    await attendancesSection.setAttendanceTimes(mockedToday, '08:02', '')
    await attendancesSection.closeInlineEditor()
    await waitUntilEqual(
      () => attendancesSection.getAttendanceStart(mockedToday, 0),
      '08:02'
    )
    await waitUntilEqual(
      () => attendancesSection.getAttendanceEnd(mockedToday, 0),
      '–'
    )
  })

  test('Employee cannot edit attendances in the future', async () => {
    attendancesSection = await loadUnitAttendancesSection()
    await calendarPage.selectMode('week')
    await attendancesSection.openInlineEditor(child1Fixture.id)
    await waitUntilEqual(
      () => attendancesSection.getAttendanceStart(mockedToday.addDays(1), 0),
      '–'
    )
    await waitUntilEqual(
      () => attendancesSection.getAttendanceEnd(mockedToday.addDays(1), 0),
      '–'
    )
  })
})
