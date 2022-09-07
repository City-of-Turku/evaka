// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import LocalDate from 'lib-common/local-date'
import LocalTime from 'lib-common/local-time'
import { UUID } from 'lib-common/types'

import {
  insertDefaultServiceNeedOptions,
  insertStaffRealtimeAttendance,
  resetDatabase
} from '../../dev-api'
import { initializeAreaAndPersonData } from '../../dev-api/data-init'
import {
  careArea2Fixture,
  daycare2Fixture,
  Fixture,
  uuidv4
} from '../../dev-api/fixtures'
import { Child, Daycare, EmployeeDetail } from '../../dev-api/types'
import { UnitPage } from '../../pages/employee/units/unit'
import {
  UnitAttendancesSection,
  UnitCalendarPage
} from '../../pages/employee/units/unit-attendances-page'
import { waitUntilEqual } from '../../utils'
import { Page } from '../../utils/page'
import { employeeLogin } from '../../utils/user'

let page: Page
let unitPage: UnitPage
let attendancesSection: UnitAttendancesSection
let calendarPage: UnitCalendarPage
let child1Fixture: Child
let child1DaycarePlacementId: UUID
let daycare: Daycare
let unitSupervisor: EmployeeDetail
let staff: EmployeeDetail[]
let groupStaff: EmployeeDetail

const mockedToday = LocalDate.of(2022, 3, 28)
const placementStartDate = mockedToday.subWeeks(4)
const placementEndDate = mockedToday.addWeeks(4)
const groupId: UUID = uuidv4()
const groupId2 = uuidv4()

beforeEach(async () => {
  await resetDatabase()

  const fixtures = await initializeAreaAndPersonData()
  const careArea = await Fixture.careArea().with(careArea2Fixture).save()
  daycare = (
    await Fixture.daycare()
      .with({
        ...daycare2Fixture,
        enabledPilotFeatures: ['REALTIME_STAFF_ATTENDANCE']
      })
      .careArea(careArea)
      .save()
  ).data

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

  await Fixture.daycareGroup()
    .with({
      id: groupId2,
      daycareId: daycare.id,
      name: 'Testailijat 2'
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

  await Fixture.groupPlacement()
    .with({
      daycareGroupId: groupId,
      daycarePlacementId: child1DaycarePlacementId,
      startDate: placementStartDate.formatIso(),
      endDate: placementEndDate.formatIso()
    })
    .save()

  groupStaff = (
    await Fixture.employee()
      .with({
        email: 'kalle.kasvattaja@evaka.test',
        firstName: 'Kalle',
        lastName: 'Kasvattaja',
        roles: []
      })
      .withDaycareAcl(daycare.id, 'STAFF')
      .withGroupAcl(groupId)
      .withGroupAcl(groupId2)
      .save()
  ).data
  staff = [(await Fixture.employeeStaff(daycare.id).save()).data, groupStaff]
  await Fixture.staffOccupancyCoefficient(daycare.id, staff[1].id).save()

  await insertStaffRealtimeAttendance({
    id: uuidv4(),
    employeeId: staff[0].id,
    groupId: groupId,
    arrived: mockedToday.subDays(1).toHelsinkiDateTime(LocalTime.of(7, 0)),
    departed: mockedToday.subDays(1).toHelsinkiDateTime(LocalTime.of(15, 0)),
    occupancyCoefficient: 7.0,
    type: 'PRESENT'
  })

  page = await Page.open({
    viewport: { width: 1440, height: 720 },
    mockedTime: mockedToday
      .toHelsinkiDateTime(LocalTime.of(12, 0))
      .toSystemTzDate()
  })
  await employeeLogin(page, unitSupervisor)
})

const openAttendancesSection = async (): Promise<UnitAttendancesSection> => {
  unitPage = new UnitPage(page)
  await unitPage.navigateToUnit(daycare.id)
  calendarPage = await unitPage.openCalendarPage()
  return calendarPage.attendancesSection
}

describe('Realtime staff attendances', () => {
  test('Occupancy graph', async () => {
    await insertStaffRealtimeAttendance({
      id: uuidv4(),
      employeeId: staff[1].id,
      groupId: groupId,
      arrived: mockedToday.toHelsinkiDateTime(LocalTime.of(7, 0)),
      departed: null,
      occupancyCoefficient: 7.0,
      type: 'PRESENT'
    })

    attendancesSection = await openAttendancesSection()
    await attendancesSection.occupancies.assertGraphIsVisible()
    await attendancesSection.setFilterStartDate(LocalDate.of(2022, 3, 1))
    await attendancesSection.occupancies.assertGraphHasNoData()
  })
  describe('Group selection: staff', () => {
    beforeEach(async () => {
      attendancesSection = await openAttendancesSection()
      await attendancesSection.selectGroup('staff')
    })

    test('The staff attendances table shows all unit staff', async () => {
      await waitUntilEqual(
        () => attendancesSection.staffInAttendanceTable(),
        staff.map(staffName)
      )
    })

    test('The icon tells whether a staff member is counted in occupancy or not', async () => {
      await attendancesSection.assertPositiveOccupancyCoefficientCount(1)
      await attendancesSection.assertZeroOccupancyCoefficientCount(1)
    })

    test('It is not possible to create new entries', async () => {
      await attendancesSection.assertNoTimeInputsVisible()
      await attendancesSection.clickEditOnRow(0)
      await attendancesSection.assertNoTimeInputsVisible()
      await attendancesSection.clickCommitOnRow(0)
    })

    test('Sunday entries are shown in the calendar', async () => {
      await calendarPage.changeWeekToDate(mockedToday.subWeeks(1))
      await attendancesSection.assertArrivalDeparture({
        rowIx: 0,
        nth: 6,
        arrival: '07:00',
        departure: '15:00'
      })
    })
  })
  describe('Group selection: staff, with one attendance entry', () => {
    beforeEach(async () => {
      await insertStaffRealtimeAttendance({
        id: uuidv4(),
        employeeId: staff[1].id,
        groupId: groupId,
        arrived: mockedToday.toHelsinkiDateTime(LocalTime.of(7, 0)),
        departed: null,
        occupancyCoefficient: 7.0,
        type: 'PRESENT'
      })

      attendancesSection = await openAttendancesSection()
      await attendancesSection.selectGroup('staff')
      await attendancesSection.assertNoTimeInputsVisible()
    })
    test('Existing entries can be edited', async () => {
      await attendancesSection.clickEditOnRow(1)
      await attendancesSection.assertCountTimeInputsVisible(1)
    })

    test('Editing an existing entry updates it', async () => {
      const rowIx = 1
      const nth = 0
      await attendancesSection.assertArrivalDeparture({
        rowIx,
        nth,
        arrival: '07:00',
        departure: '–'
      })
      await attendancesSection.clickEditOnRow(rowIx)
      await attendancesSection.setNthArrivalDeparture(
        0,
        nth,
        '07:00',
        '15:00',
        1
      )
      await attendancesSection.closeInlineEditor()
      await attendancesSection.assertArrivalDeparture({
        rowIx,
        nth,
        arrival: '07:00',
        departure: '15:00'
      })
    })
  })
  describe('Group selection: group', () => {
    beforeEach(async () => {
      await insertStaffRealtimeAttendance({
        id: uuidv4(),
        employeeId: staff[1].id,
        groupId: groupId,
        arrived: mockedToday.toHelsinkiDateTime(LocalTime.of(7, 0)),
        departed: mockedToday.toHelsinkiDateTime(LocalTime.of(16, 0)),
        occupancyCoefficient: 7.0,
        type: 'PRESENT'
      })

      attendancesSection = await openAttendancesSection()
      await attendancesSection.selectGroup(groupId)
      await waitUntilEqual(
        () => attendancesSection.staffInAttendanceTable(),
        [staffName(groupStaff)]
      )
    })
    test('A new entry can be added', async () => {
      const rowIx = 0
      await attendancesSection.clickEditOnRow(rowIx)
      await attendancesSection.setNthArrivalDeparture(0, 2, '07:00', '15:00')
      await attendancesSection.closeInlineEditor()
      await attendancesSection.assertArrivalDeparture({
        rowIx,
        nth: 2,
        arrival: '07:00',
        departure: '15:00'
      })
    })
    test('An overnight entry can be added', async () => {
      const rowIx = 0
      await attendancesSection.clickEditOnRow(rowIx)
      await attendancesSection.setNthArrivalDeparture(0, 1, '09:00', '')
      await attendancesSection.setNthDeparture(0, 2, '15:00')
      await attendancesSection.closeInlineEditor()
      await attendancesSection.assertArrivalDeparture({
        rowIx,
        nth: 1,
        arrival: '09:00',
        departure: '→'
      })
      await attendancesSection.assertArrivalDeparture({
        rowIx,
        nth: 2,
        arrival: '→',
        departure: '15:00'
      })
    })
    test('Existing entries can be deleted by entering empty values', async () => {
      const rowIx = 0
      await attendancesSection.clickEditOnRow(rowIx)
      await attendancesSection.setNthArrivalDeparture(0, 0, '', '')
      await attendancesSection.closeInlineEditor()
      await attendancesSection.assertArrivalDeparture({
        rowIx,
        nth: 0,
        arrival: '–',
        departure: '–'
      })
    })
    test('An overnight entry can be added over the week boundary', async () => {
      const rowIx = 0
      await attendancesSection.clickEditOnRow(rowIx)
      await attendancesSection.setNthArrivalDeparture(0, 6, '15:00', '')
      await calendarPage.changeWeekToDate(mockedToday.addWeeks(1))
      await attendancesSection.assertDepartureLocked(0, 0)
      await attendancesSection.setNthDeparture(0, 0, '07:00')
      await attendancesSection.closeInlineEditor()
      await attendancesSection.assertArrivalDeparture({
        rowIx,
        nth: 0,
        arrival: '→',
        departure: '07:00'
      })
      await calendarPage.changeWeekToDate(mockedToday)
      await attendancesSection.assertArrivalDeparture({
        rowIx,
        nth: 6,
        arrival: '15:00',
        departure: '→'
      })
    })
    test('Navigating to the previous week does not delete an open attendance', async () => {
      const rowIx = 0
      await attendancesSection.clickEditOnRow(rowIx)
      await attendancesSection.setNthArrivalDeparture(0, 0, '15:00', '')
      await attendancesSection.closeInlineEditor()
      await calendarPage.changeWeekToDate(mockedToday.subWeeks(1))
      await calendarPage.changeWeekToDate(mockedToday)
      await attendancesSection.assertArrivalDeparture({
        rowIx,
        nth: 0,
        arrival: '15:00',
        departure: '–'
      })
    })
    test('A warning is shown if open range is added with a future attendance', async () => {
      await attendancesSection.clickEditOnRow(0)
      await attendancesSection.setNthArrivalDeparture(0, 6, '09:00', '10:00')
      await attendancesSection.setNthArrivalDeparture(0, 4, '10:00', '')
      await attendancesSection.assertFormWarning()
    })
    test('A warning is shown if open range is added with a future attendance over the week boundary', async () => {
      await attendancesSection.clickEditOnRow(0)
      await calendarPage.changeWeekToDate(mockedToday.addWeeks(1))
      await attendancesSection.setNthArrivalDeparture(0, 0, '09:00', '10:00')
      await calendarPage.changeWeekToDate(mockedToday)
      await attendancesSection.setNthArrivalDeparture(0, 4, '10:00', '')
      await attendancesSection.assertFormWarning()
    })
  })
  describe('Group selected, multiple per-day attendances', () => {
    beforeEach(async () => {
      await insertStaffRealtimeAttendance({
        id: uuidv4(),
        employeeId: staff[1].id,
        groupId: groupId,
        arrived: mockedToday.addDays(1).toHelsinkiDateTime(LocalTime.of(7, 0)),
        departed: mockedToday.addDays(1).toHelsinkiDateTime(LocalTime.of(9, 0)),
        occupancyCoefficient: 2.0,
        type: 'PRESENT'
      })
      await insertStaffRealtimeAttendance({
        id: uuidv4(),
        employeeId: staff[1].id,
        groupId: groupId,
        arrived: mockedToday.addDays(1).toHelsinkiDateTime(LocalTime.of(9, 0)),
        departed: mockedToday
          .addDays(1)
          .toHelsinkiDateTime(LocalTime.of(10, 0)),
        occupancyCoefficient: 2.0,
        type: 'PRESENT'
      })

      attendancesSection = await openAttendancesSection()
      await attendancesSection.selectGroup(groupId)
      await waitUntilEqual(
        () => attendancesSection.staffInAttendanceTable(),
        [staffName(groupStaff)]
      )
    })

    test('Multi-row attendances can be edited', async () => {
      await attendancesSection.clickEditOnRow(0)
      await attendancesSection.setNthArrivalDeparture(1, 1, '12:00', '14:00')
      await attendancesSection.closeInlineEditor()
      await attendancesSection.assertArrivalDeparture({
        rowIx: 0,
        nth: 1,
        timeNth: 0,
        arrival: '07:00',
        departure: '09:00'
      })
      await attendancesSection.assertArrivalDeparture({
        rowIx: 0,
        nth: 1,
        timeNth: 1,
        arrival: '12:00',
        departure: '14:00'
      })
    })
    test('Multi-row attendance can be extended overnight', async () => {
      await attendancesSection.clickEditOnRow(0)
      await attendancesSection.setNthArrivalDeparture(1, 1, '14:00', '')
      await attendancesSection.setNthDeparture(0, 2, '04:00')
      await attendancesSection.closeInlineEditor()
      await attendancesSection.assertArrivalDeparture({
        rowIx: 0,
        nth: 1,
        timeNth: 1,
        arrival: '14:00',
        departure: '→'
      })
      await attendancesSection.assertArrivalDeparture({
        rowIx: 0,
        nth: 2,
        timeNth: 0,
        arrival: '→',
        departure: '04:00'
      })
    })
    test('An open multi-row attendance has warning when there is another after it', async () => {
      await attendancesSection.clickEditOnRow(0)
      await attendancesSection.setNthArrivalDeparture(0, 1, '07:00', '')
      await attendancesSection.assertFormWarning()
    })
  })
  describe('Details modal', () => {
    beforeEach(async () => {
      await insertStaffRealtimeAttendance({
        id: uuidv4(),
        employeeId: staff[1].id,
        groupId: groupId,
        arrived: mockedToday.toHelsinkiDateTime(LocalTime.of(7, 0)),
        departed: null,
        occupancyCoefficient: 7.0,
        type: 'PRESENT'
      })

      attendancesSection = await openAttendancesSection()
      await attendancesSection.selectGroup('staff')
    })
    test('An existing entry can be edited', async () => {
      const modal = await attendancesSection.openDetails(
        groupStaff.id,
        mockedToday
      )
      await modal.setDepartureTime(0, '15:00')
      await modal.save()

      await waitUntilEqual(() => modal.summary(), {
        plan: '–',
        realized: '07:00 – 15:00',
        hours: '8:00'
      })

      await modal.close()
      await attendancesSection.assertArrivalDeparture({
        rowIx: 1,
        nth: 0,
        arrival: '07:00',
        departure: '15:00'
      })
    })
    test('An existing overnight entry can be edited', async () => {
      const modal = await attendancesSection.openDetails(
        groupStaff.id,
        mockedToday.addDays(1)
      )
      await modal.setDepartureTime(0, '16:00')
      await modal.save()

      await waitUntilEqual(() => modal.summary(), {
        plan: '–',
        realized: '→ – 16:00',
        hours: '33:00'
      })

      await modal.close()
      await attendancesSection.assertArrivalDeparture({
        rowIx: 1,
        nth: 0,
        arrival: '07:00',
        departure: '→'
      })
      await attendancesSection.assertArrivalDeparture({
        rowIx: 1,
        nth: 1,
        arrival: '→',
        departure: '16:00'
      })
    })
    test('Multiple new entries can be added', async () => {
      const modal = await attendancesSection.openDetails(
        groupStaff.id,
        mockedToday
      )
      await modal.setDepartureTime(0, '12:00')
      await modal.addNewAttendance()
      await modal.setGroup(1, groupId)
      await modal.setType(1, 'TRAINING')
      await modal.setArrivalTime(1, '12:00')
      await modal.setDepartureTime(1, '13:00')
      await modal.addNewAttendance()
      await modal.setGroup(2, groupId)
      await modal.setType(2, 'PRESENT')
      await modal.setArrivalTime(2, '13:00')
      await modal.setDepartureTime(2, '14:30')
      await modal.addNewAttendance()
      await modal.setGroup(3, groupId)
      await modal.setType(3, 'OTHER_WORK')
      await modal.setArrivalTime(3, '14:30')
      await modal.setDepartureTime(3, '15:00')
      await modal.save()

      await waitUntilEqual(() => modal.summary(), {
        plan: '–',
        realized: '07:00 – 15:00',
        hours: '8:00'
      })

      await modal.close()
      await attendancesSection.assertArrivalDeparture({
        rowIx: 1,
        nth: 0,
        timeNth: 0,
        arrival: '07:00',
        departure: '12:00'
      })
      await attendancesSection.assertArrivalDeparture({
        rowIx: 1,
        nth: 0,
        timeNth: 1,
        arrival: '13:00',
        departure: '14:30'
      })
    })
    test('Gaps in attendances are warned about', async () => {
      const modal = await attendancesSection.openDetails(
        groupStaff.id,
        mockedToday
      )
      await modal.setDepartureTime(0, '12:00')
      await modal.addNewAttendance()
      await modal.setGroup(1, groupId)
      await modal.setType(1, 'TRAINING')
      await modal.setArrivalTime(1, '12:30')
      await modal.setDepartureTime(1, '13:00')
      await modal.addNewAttendance()
      await modal.setGroup(2, groupId)
      await modal.setType(2, 'PRESENT')
      await modal.setArrivalTime(2, '13:20')
      await modal.setDepartureTime(2, '14:30')

      await waitUntilEqual(
        () => modal.gapWarning(1),
        'Kirjaus puuttuu välillä 12:00 – 12:30'
      )
      await waitUntilEqual(
        () => modal.gapWarning(2),
        'Kirjaus puuttuu välillä 13:00 – 13:20'
      )
    })
  })
  describe('Entries to multiple groups', () => {
    beforeEach(async () => {
      await insertStaffRealtimeAttendance({
        id: uuidv4(),
        employeeId: staff[1].id,
        groupId: groupId,
        arrived: mockedToday.toHelsinkiDateTime(LocalTime.of(8, 0)),
        departed: null,
        occupancyCoefficient: 7.0,
        type: 'PRESENT'
      })

      attendancesSection = await openAttendancesSection()
    })
    test('Inline editor does not overwrite entries to other groups', async () => {
      await attendancesSection.selectGroup(groupId)
      await attendancesSection.assertArrivalDeparture({
        rowIx: 0,
        nth: 0,
        arrival: '08:00',
        departure: '–'
      })
      await attendancesSection.clickEditOnRow(0)
      await attendancesSection.setNthArrivalDeparture(0, 0, '07:00', '15:00')
      await attendancesSection.closeInlineEditor()
      await attendancesSection.assertArrivalDeparture({
        rowIx: 0,
        nth: 0,
        arrival: '07:00',
        departure: '15:00'
      })
      await attendancesSection.selectGroup(groupId2)
      await attendancesSection.assertArrivalDeparture({
        rowIx: 0,
        nth: 0,
        arrival: '–',
        departure: '–'
      })
      await attendancesSection.clickEditOnRow(0)
      await attendancesSection.setNthArrivalDeparture(0, 0, '15:00', '16:15')
      await attendancesSection.closeInlineEditor()
      await attendancesSection.assertArrivalDeparture({
        rowIx: 0,
        nth: 0,
        arrival: '15:00',
        departure: '16:15'
      })
      await attendancesSection.selectGroup(groupId)
      await attendancesSection.assertArrivalDeparture({
        rowIx: 0,
        nth: 0,
        arrival: '07:00',
        departure: '15:00'
      })
    })
  })
  describe('Staff count sums in the table', () => {
    beforeEach(async () => {
      attendancesSection = await openAttendancesSection()
    })
    test('Total staff counts', async () => {
      await waitUntilEqual(() => attendancesSection.personCountSum(0), '– hlö')
      await attendancesSection.selectGroup(groupId)
      await attendancesSection.clickEditOnRow(0)
      await attendancesSection.setNthArrivalDeparture(0, 0, '12:00', '15:00')
      await attendancesSection.setNthArrivalDeparture(0, 4, '09:00', '10:00')
      await attendancesSection.setNthArrivalDeparture(0, 5, '10:00', '13:00')
      await attendancesSection.closeInlineEditor()
      await waitUntilEqual(() => attendancesSection.personCountSum(0), '1 hlö')
      await waitUntilEqual(() => attendancesSection.personCountSum(4), '1 hlö')
      await waitUntilEqual(() => attendancesSection.personCountSum(5), '1 hlö')
      await waitUntilEqual(() => attendancesSection.personCountSum(1), '– hlö')
      await waitUntilEqual(() => attendancesSection.personCountSum(2), '– hlö')
      await waitUntilEqual(() => attendancesSection.personCountSum(3), '– hlö')
    })
  })
})

function staffName(employeeDetail: EmployeeDetail): string {
  return `${employeeDetail.lastName} ${employeeDetail.firstName}`
}
