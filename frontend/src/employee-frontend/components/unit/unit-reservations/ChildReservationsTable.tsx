// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import classNames from 'classnames'
import max from 'lodash/max'
import range from 'lodash/range'
import sortBy from 'lodash/sortBy'
import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'

import {
  Child,
  ChildRecordOfDay,
  OperationalDay,
  UnitDateInfo
} from 'lib-common/generated/api-types/reservations'
import LocalDate from 'lib-common/local-date'
import { UUID } from 'lib-common/types'
import { Table, Tbody } from 'lib-components/layout/Table'

import EllipsisMenu from '../../../components/common/EllipsisMenu'
import { Translations, useTranslation } from '../../../state/i18n'
import { formatName } from '../../../utils'
import { AgeIndicatorChip } from '../../common/AgeIndicatorChip'
import { ContractDaysIndicatorChip } from '../../common/ContractDaysIndicatorChip'
import { AttendanceGroupFilter } from '../TabCalendar'

import ChildDayAttendance from './ChildDayAttendance'
import ChildDayReservation from './ChildDayReservation'
import {
  AttendanceTableHeader,
  NameWrapper,
  DayTd,
  DayTr,
  NameTd,
  StyledTd,
  ChipWrapper
} from './attendance-elements'

interface Props {
  unitId: UUID
  days: OperationalDay[]
  childBasics: Child[]
  onMakeReservationForChild: (child: Child) => void
  onOpenEditForChildDate: (childId: UUID, date: LocalDate) => void
  selectedDate: LocalDate
  selectedGroup: AttendanceGroupFilter
}

const childFilter = (
  child: ChildRecordOfDay,
  selectedGroup: AttendanceGroupFilter
): boolean =>
  selectedGroup.type === 'group'
    ? child.groupId === selectedGroup.id ||
      child.backupGroupId === selectedGroup.id
    : selectedGroup.type === 'no-group'
      ? child.groupId === null
      : selectedGroup.type === 'all-children'

export default React.memo(function ChildReservationsTable({
  days,
  childBasics,
  onMakeReservationForChild,
  onOpenEditForChildDate,
  selectedDate,
  selectedGroup
}: Props) {
  const { i18n } = useTranslation()

  const displayedChildren = useMemo(() => {
    // children that are in the correct group at least during one day
    const filteredChildren = childBasics.filter((c) =>
      days.some((d) =>
        d.children.some(
          (c2) => c2.childId === c.id && childFilter(c2, selectedGroup)
        )
      )
    )
    return sortBy(
      filteredChildren,
      (child) => child.lastName,
      (child) => child.firstName
    )
  }, [childBasics, days, selectedGroup])

  return (
    <Table data-qa="child-reservations-table">
      <AttendanceTableHeader
        operationalDays={days}
        nameColumnLabel={i18n.unit.attendanceReservations.childName}
      />
      <Tbody>
        {displayedChildren.flatMap((childBasics) => {
          const childDays = days.map((d) => ({
            date: d.date,
            dateInfo: d.dateInfo,
            child: d.children.find((c) => c.childId === childBasics.id)
          }))
          return (
            <ChildRowGroup
              key={childBasics.id}
              childBasics={childBasics}
              days={childDays}
              selectedDate={selectedDate}
              onMakeReservationForChild={onMakeReservationForChild}
              onOpenEditForChildDate={onOpenEditForChildDate}
              selectedGroup={selectedGroup}
            />
          )
        })}
      </Tbody>
    </Table>
  )
})

const ChildRowGroup = React.memo(function ChildRowGroup({
  childBasics,
  days,
  onMakeReservationForChild,
  onOpenEditForChildDate,
  selectedDate,
  selectedGroup
}: {
  childBasics: Child
  days: {
    date: LocalDate
    dateInfo: UnitDateInfo
    child: ChildRecordOfDay | undefined
  }[]
  onMakeReservationForChild: (child: Child) => void
  onOpenEditForChildDate: (childId: UUID, date: LocalDate) => void
  selectedDate: LocalDate
  selectedGroup: AttendanceGroupFilter
}) {
  const { i18n } = useTranslation()

  const childId = childBasics.id
  const childContractDayServiceNeeds = childBasics.serviceNeeds.filter(
    (sn) => sn.hasContractDays
  )
  const reservationRowCount =
    max(days.map((d) => Math.max(1, d.child?.reservations?.length ?? 0))) ?? 1
  const attendanceRowCount =
    max(days.map((d) => Math.max(1, d.child?.attendances?.length ?? 0))) ?? 1
  const rowsCount = reservationRowCount + attendanceRowCount

  return (
    <>
      {/* reservation rows */}
      {range(0, reservationRowCount).map((index) => (
        <DayTr
          key={`${childId}-${index}`}
          data-qa={`reservation-row-child-${childId}`}
        >
          {index == 0 && (
            <NameTd partialRow={false} rowIndex={0} rowSpan={rowsCount}>
              <NameWrapper>
                <ChipWrapper spacing="xs">
                  <AgeIndicatorChip
                    age={selectedDate.differenceInYears(
                      childBasics.dateOfBirth
                    )}
                  />
                  {childContractDayServiceNeeds.length > 0 && (
                    <ContractDaysIndicatorChip
                      contractDayServiceNeeds={childContractDayServiceNeeds}
                    />
                  )}
                </ChipWrapper>
                <Link to={`/child-information/${childId}`}>
                  {formatName(
                    childBasics.firstName.split(/\s/)[0],
                    childBasics.lastName,
                    i18n,
                    true
                  )}
                  {childBasics.preferredName
                    ? ` (${childBasics.preferredName})`
                    : ''}
                </Link>
              </NameWrapper>
            </NameTd>
          )}
          {days.map(({ date, dateInfo, child }) => {
            const fullyAbsent =
              !!child &&
              child.possibleAbsenceCategories.every((c) => {
                switch (c) {
                  case 'BILLABLE':
                    return child.absenceBillable !== null
                  case 'NONBILLABLE':
                    return child.absenceNonbillable !== null
                }
              })
            const hasReservations = !!child && child.reservations.length > 0
            const displayAbsence = fullyAbsent || !hasReservations
            const absence =
              child?.absenceBillable ?? child?.absenceNonbillable ?? null

            return (
              <DayTd
                key={date.formatIso()}
                data-qa={`td-${date.formatIso()}`}
                className={classNames({ 'is-today': date.isToday() })}
                partialRow={reservationRowCount > 1}
                rowIndex={index}
                maxRows={reservationRowCount}
              >
                {child && childFilter(child, selectedGroup) && (
                  <ChildDayReservation
                    date={date}
                    reservationIndex={index}
                    dateInfo={dateInfo}
                    reservation={child.reservations[index]}
                    absence={displayAbsence ? absence : null}
                    dailyServiceTimes={child.dailyServiceTimes}
                    inOtherUnit={child.inOtherUnit}
                    isInBackupGroup={
                      selectedGroup.type === 'group' &&
                      !child.inOtherUnit &&
                      child.backupGroupId !== null &&
                      child.backupGroupId !== selectedGroup.id
                    }
                    scheduleType={child.scheduleType}
                    serviceNeedInfo={childBasics.serviceNeeds.find((sn) =>
                      sn.validDuring.includes(date)
                    )}
                    onStartEdit={() => onOpenEditForChildDate(childId, date)}
                  />
                )}
              </DayTd>
            )
          })}
          {index === 0 && (
            <StyledTd partialRow={false} rowIndex={0} rowSpan={rowsCount}>
              <RowMenu
                i18n={i18n}
                child={childBasics}
                openReservationModal={onMakeReservationForChild}
              />
            </StyledTd>
          )}
        </DayTr>
      ))}

      {/* attendance rows */}
      {range(0, attendanceRowCount).map((index) => (
        <DayTr
          key={`${childId}-${index}`}
          data-qa={`attendance-row-child-${childId}`}
        >
          {days.map(({ date, dateInfo, child }) => (
            <DayTd
              key={date.formatIso()}
              data-qa={`td-${date.formatIso()}`}
              className={classNames({ 'is-today': date.isToday() })}
              partialRow={attendanceRowCount > 1}
              rowIndex={index}
              maxRows={attendanceRowCount}
            >
              {child && childFilter(child, selectedGroup) && (
                <ChildDayAttendance
                  date={date}
                  attendanceIndex={index}
                  dateInfo={dateInfo}
                  attendance={child.attendances[index]}
                  reservations={child.reservations}
                  dailyServiceTimes={child.dailyServiceTimes}
                  inOtherUnit={child.inOtherUnit}
                  isInBackupGroup={
                    selectedGroup.type === 'group' &&
                    !child.inOtherUnit &&
                    child.backupGroupId !== null &&
                    child.backupGroupId !== selectedGroup.id
                  }
                  scheduleType={child.scheduleType}
                  serviceNeedInfo={childBasics.serviceNeeds.find((sn) =>
                    sn.validDuring.includes(date)
                  )}
                  onStartEdit={() => onOpenEditForChildDate(childId, date)}
                />
              )}
            </DayTd>
          ))}
        </DayTr>
      ))}
    </>
  )
})

const RowMenu = React.memo(function RowMenu({
  i18n,
  child,
  openReservationModal
}: {
  i18n: Translations
  child: Child
  openReservationModal: (c: Child) => void
}) {
  return (
    <EllipsisMenu
      items={[
        {
          id: 'reservation-modal',
          label: i18n.unit.attendanceReservations.openReservationModal,
          onClick: () => openReservationModal(child)
        }
      ]}
      data-qa={`ellipsis-menu-${child.id}`}
    />
  )
})
