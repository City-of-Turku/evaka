// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import classNames from 'classnames'
import groupBy from 'lodash/groupBy'
import isEqual from 'lodash/isEqual'
import mapValues from 'lodash/mapValues'
import maxBy from 'lodash/maxBy'
import minBy from 'lodash/minBy'
import partition from 'lodash/partition'
import sortBy from 'lodash/sortBy'
import uniqBy from 'lodash/uniqBy'
import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  MutableRefObject
} from 'react'
import styled from 'styled-components'

import { getStaffAttendances } from 'employee-frontend/api/staff-attendance'
import { getUnitAttendanceReservations } from 'employee-frontend/api/unit'
import { Loading, Result } from 'lib-common/api'
import {
  OperationalDay,
  UnitAttendanceReservations
} from 'lib-common/api-types/reservations'
import DateRange from 'lib-common/date-range'
import FiniteDateRange from 'lib-common/finite-date-range'
import {
  Attendance,
  EmployeeAttendance,
  ExternalAttendance,
  UpsertStaffAttendance,
  StaffAttendanceResponse,
  UpsertStaffAndExternalAttendanceRequest,
  PlannedStaffAttendance
} from 'lib-common/generated/api-types/attendance'
import { DaycareGroup } from 'lib-common/generated/api-types/daycare'
import HelsinkiDateTime from 'lib-common/helsinki-date-time'
import LocalDate from 'lib-common/local-date'
import LocalTime from 'lib-common/local-time'
import { UUID } from 'lib-common/types'
import { useRestApi } from 'lib-common/utils/useRestApi'
import RoundIcon from 'lib-components/atoms/RoundIcon'
import Tooltip from 'lib-components/atoms/Tooltip'
import IconButton from 'lib-components/atoms/buttons/IconButton'
import { SpinnerSegment } from 'lib-components/atoms/state/Spinner'
import { Table, Tbody } from 'lib-components/layout/Table'
import { FixedSpaceRow } from 'lib-components/layout/flex-helpers'
import { fontWeights } from 'lib-components/typography'
import { BaseProps } from 'lib-components/utils'
import { defaultMargins } from 'lib-components/white-space'
import { colors } from 'lib-customizations/common'
import { featureFlags } from 'lib-customizations/employee'
import {
  faCheck,
  faCircleEllipsis,
  faClock,
  faExclamationTriangle
} from 'lib-icons'

import { useTranslation } from '../../../state/i18n'
import { formatName } from '../../../utils'
import EllipsisMenu from '../../common/EllipsisMenu'

import StaffAttendanceDetailsModal from './StaffAttendanceDetailsModal'
import {
  AttendanceTableHeader,
  DayTd,
  DayTr,
  NameTd,
  NameWrapper,
  StyledTd,
  TimeInputWithoutPadding
} from './attendance-elements'

interface Props {
  unitId: UUID
  operationalDays: OperationalDay[]
  staffAttendances: EmployeeAttendance[]
  extraAttendances: ExternalAttendance[]
  saveAttendances: (
    body: UpsertStaffAndExternalAttendanceRequest
  ) => Promise<Result<void>>
  deleteAttendances: (
    staffAttendanceIds: UUID[],
    externalStaffAttendanceIds: UUID[]
  ) => Promise<Result<void>[]>
  reloadStaffAttendances: () => Promise<void>
  groups: Result<DaycareGroup[]>
  groupFilter: (id: UUID) => boolean
  selectedGroup: UUID | null
  weekSavingFns: MutableRefObject<Map<string, () => Promise<void>>>
}

export default React.memo(function StaffAttendanceTable({
  unitId,
  staffAttendances,
  extraAttendances,
  operationalDays,
  saveAttendances,
  deleteAttendances,
  reloadStaffAttendances,
  groups,
  groupFilter,
  selectedGroup,
  weekSavingFns
}: Props) {
  const { i18n } = useTranslation()
  const [detailsModal, setDetailsModal] = useState<{
    employeeId: string
    date: LocalDate
  }>()
  const closeModal = useCallback(() => setDetailsModal(undefined), [])

  const staffRows = useMemo(
    () =>
      sortBy(
        staffAttendances.map(
          ({ firstName, lastName, attendances, ...rest }) => ({
            ...rest,
            name: formatName(firstName.split(/\s/)[0], lastName, i18n, true),
            attendances: sortBy(
              attendances,
              ({ departed }) => departed?.timestamp ?? Infinity
            )
          })
        ),
        (attendance) => attendance.name
      ),
    [i18n, staffAttendances]
  )

  const extraRowsGroupedByName = useMemo(
    () =>
      sortBy(
        Object.entries(groupBy(extraAttendances, (a) => a.name)).map(
          ([name, attendances]) => ({
            name,
            attendances: sortBy(
              attendances,
              ({ departed }) => departed?.timestamp ?? Infinity
            )
          })
        ),
        (attendance) => attendance.name
      ),
    [extraAttendances]
  )

  const [modalStaffAttendance, setModalStaffAttendance] = useState<
    Result<StaffAttendanceResponse>
  >(Loading.of())
  const [modalAttendance, setModalAttendance] = useState<
    Result<UnitAttendanceReservations>
  >(Loading.of())
  const loadModalStaffAttendance = useRestApi(
    getStaffAttendances,
    setModalStaffAttendance
  )
  const loadModalAttendance = useRestApi(
    getUnitAttendanceReservations,
    setModalAttendance
  )

  const modalOperationalDays = useMemo(
    () => modalAttendance.getOrElse(undefined)?.operationalDays,
    [modalAttendance]
  )

  const changeDate = useCallback(
    async (getNearestDay: GetNearestDayFn, newStartOfWeek: LocalDate) => {
      if (!detailsModal) return

      const nearestNextDate =
        (modalOperationalDays &&
          getNearestDay(modalOperationalDays, detailsModal.date)) ??
        getNearestDay(operationalDays, detailsModal.date)

      if (!nearestNextDate) {
        const nextWeekRange = new FiniteDateRange(
          newStartOfWeek,
          newStartOfWeek.addDays(6)
        )

        const [, attendance] = await Promise.all([
          loadModalStaffAttendance(unitId, nextWeekRange),
          loadModalAttendance(unitId, nextWeekRange)
        ])

        const newOperationalDays =
          attendance.getOrElse(undefined)?.operationalDays

        if (!newOperationalDays) return

        const newPreviousDay = getNearestDay(
          newOperationalDays,
          detailsModal.date
        )

        if (!newPreviousDay) return

        setDetailsModal({
          ...detailsModal,
          date: newPreviousDay.date
        })
        return
      }

      setDetailsModal({
        ...detailsModal,
        date: nearestNextDate.date
      })
    },
    [
      detailsModal,
      loadModalAttendance,
      loadModalStaffAttendance,
      modalOperationalDays,
      operationalDays,
      unitId
    ]
  )

  const personCountSums = useMemo(
    () =>
      mapValues(
        groupBy(
          staffRows
            .flatMap(({ attendances, employeeId }) =>
              uniqBy(
                attendances
                  .filter(
                    ({ type, groupId }) =>
                      type !== 'OTHER_WORK' &&
                      type !== 'TRAINING' &&
                      groupFilter(groupId)
                  )
                  .flatMap(({ departed, arrived }) =>
                    [arrived.toLocalDate()].concat(
                      departed?.toLocalDate() ?? []
                    )
                  ),
                ({ date }) => date
              ).map((date) => ({
                date,
                employeeId
              }))
            )
            .concat(
              extraAttendances
                .filter(
                  ({ type, groupId }) =>
                    type !== 'OTHER_WORK' &&
                    type !== 'TRAINING' &&
                    groupFilter(groupId)
                )
                .flatMap(({ departed, arrived, name }) =>
                  uniqBy(
                    [arrived.toLocalDate()].concat(
                      departed?.toLocalDate() ?? []
                    ),
                    ({ date }) => date
                  ).map((date) => ({
                    employeeId: `extra-${name}`,
                    date
                  }))
                )
            ),
          ({ date }) => date.toString()
        ),
        (rows) => uniqBy(rows, ({ employeeId }) => employeeId).length
      ),
    [extraAttendances, groupFilter, staffRows]
  )

  return (
    <>
      <Table data-qa="staff-attendances-table">
        <AttendanceTableHeader
          operationalDays={operationalDays}
          nameColumnLabel={i18n.unit.staffAttendance.staffName}
        />
        <Tbody>
          {staffRows.map((row, index) => (
            <AttendanceRow
              key={`${row.employeeId}-${index}`}
              rowIndex={index}
              isPositiveOccupancyCoefficient={
                row.currentOccupancyCoefficient > 0
              }
              name={row.name}
              employeeId={row.employeeId}
              operationalDays={operationalDays}
              attendances={row.attendances}
              saveAttendances={saveAttendances}
              deleteAttendances={deleteAttendances}
              reloadStaffAttendances={reloadStaffAttendances}
              openDetails={
                featureFlags.experimental?.staffAttendanceTypes
                  ? setDetailsModal
                  : undefined
              }
              groupFilter={groupFilter}
              selectedGroup={selectedGroup}
              weekSavingFns={weekSavingFns}
              hasFutureAttendances={row.hasFutureAttendances}
              plannedAttendances={row.plannedAttendances}
            />
          ))}
          {extraRowsGroupedByName.map((row, index) => (
            <AttendanceRow
              key={`${row.name}-${index}`}
              rowIndex={index}
              isPositiveOccupancyCoefficient={
                row.attendances[0].occupancyCoefficient > 0
              }
              name={row.name}
              operationalDays={operationalDays}
              attendances={row.attendances}
              saveAttendances={saveAttendances}
              deleteAttendances={deleteAttendances}
              reloadStaffAttendances={reloadStaffAttendances}
              groupFilter={groupFilter}
              selectedGroup={selectedGroup}
              weekSavingFns={weekSavingFns}
              hasFutureAttendances={row.attendances[0].hasFutureAttendances}
            />
          ))}
        </Tbody>
        <tfoot>
          <BottomSumTr>
            <BottomSumTd>{i18n.unit.staffAttendance.personCount}</BottomSumTd>
            {operationalDays.map(({ date }) => (
              <BottomSumTd
                centered
                key={date.toString()}
                data-qa="person-count-sum"
              >
                {personCountSums[date.toString()] ?? '–'}{' '}
                {i18n.unit.staffAttendance.personCountAbbr}
              </BottomSumTd>
            ))}
            <BottomSumTd />
          </BottomSumTr>
        </tfoot>
      </Table>
      {detailsModal && (
        <StaffAttendanceDetailsModal
          unitId={unitId}
          employeeId={detailsModal.employeeId}
          date={detailsModal.date}
          attendances={staffAttendances.concat(
            modalStaffAttendance.getOrElse(undefined)?.staff ?? []
          )}
          close={closeModal}
          reloadStaffAttendances={() => {
            void reloadStaffAttendances()

            if (
              !operationalDays.some(({ date }) =>
                date.isEqual(detailsModal.date)
              )
            ) {
              const startOfWeek = detailsModal.date.startOfWeek()
              void loadModalStaffAttendance(
                unitId,
                new FiniteDateRange(startOfWeek, startOfWeek.addDays(6))
              )
            }
          }}
          groups={groups}
          onPreviousDate={() =>
            changeDate(
              getNearestPreviousDay,
              detailsModal.date.startOfWeek().subWeeks(1)
            )
          }
          onNextDate={() =>
            changeDate(
              getNearestNextDay,
              detailsModal.date.startOfWeek().addWeeks(1)
            )
          }
        />
      )}
    </>
  )
})

type GetNearestDayFn = (
  days: OperationalDay[],
  targetDate: LocalDate
) => OperationalDay | undefined

const getNearestPreviousDay: GetNearestDayFn = (days, targetDate) =>
  maxBy(
    days.filter(({ date }) => date.isBefore(targetDate)),
    ({ date }) => date.differenceInDays(targetDate)
  )

const getNearestNextDay: GetNearestDayFn = (days, targetDate) =>
  minBy(
    days.filter(({ date }) => date.isAfter(targetDate)),
    ({ date }) => date.differenceInDays(targetDate)
  )

const BottomSumTr = styled.tr`
  background-color: ${(p) => p.theme.colors.grayscale.g4};
  font-weight: ${fontWeights.semibold};
`

const BottomSumTd = styled.td<{ centered?: boolean }>`
  padding: ${defaultMargins.xs} ${defaultMargins.s};
  text-align: ${(p) => (p.centered ? 'center' : 'left')};
`
const OvernightAwareTimeRangeEditor = React.memo(
  function OvernightAwareTimeRangeEditor({
    attendance: { arrivalDate, departureDate, startTime, endTime },
    update,
    date,
    splitOvernight,
    errors,
    departureLocked
  }: {
    attendance: FormAttendance
    update: (v: Partial<FormAttendance>) => void
    date: LocalDate
    splitOvernight: (side: 'arrival' | 'departure') => void
    errors?: {
      startTime: boolean
      endTime: boolean
    }
    departureLocked: boolean
  }) {
    const { i18n } = useTranslation()

    return (
      <TimeEditor data-qa="time-range-editor">
        {departureLocked ? (
          <div data-qa="departure-lock">–</div>
        ) : arrivalDate.isEqual(date) ? (
          <TimeInputWithoutPadding
            value={startTime}
            onChange={(value) => update({ startTime: value })}
            info={
              errors?.startTime ? { status: 'warning', text: '' } : undefined
            }
            data-qa="input-start-time"
          />
        ) : (
          <IconButton
            icon={faClock}
            onClick={() => splitOvernight('arrival')}
            aria-label={i18n.unit.staffAttendance.unlinkOvernight}
          />
        )}
        {!departureDate || departureDate.isEqual(date) ? (
          <TimeInputWithoutPadding
            value={endTime}
            onChange={(value) => update({ endTime: value })}
            info={errors?.endTime ? { status: 'warning', text: '' } : undefined}
            data-qa="input-end-time"
          />
        ) : (
          <IconButton
            icon={faClock}
            onClick={() => splitOvernight('departure')}
            aria-label={i18n.unit.staffAttendance.unlinkOvernight}
          />
        )}
      </TimeEditor>
    )
  }
)

const TimeEditor = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  justify-content: space-evenly;
  gap: ${defaultMargins.xs};
  width: 100%;
`

interface AttendanceRowProps extends BaseProps {
  rowIndex: number
  isPositiveOccupancyCoefficient: boolean
  name: string
  employeeId?: string
  operationalDays: OperationalDay[]
  attendances: Attendance[]
  saveAttendances: (
    body: UpsertStaffAndExternalAttendanceRequest
  ) => Promise<Result<void>>
  deleteAttendances: (
    staffAttendanceIds: UUID[],
    externalStaffAttendanceIds: UUID[]
  ) => Promise<Result<void>[]>
  reloadStaffAttendances: () => Promise<void>
  openDetails?: (v: { employeeId: string; date: LocalDate }) => void
  groupFilter: (id: UUID) => boolean
  selectedGroup: UUID | null // for new attendances
  weekSavingFns: MutableRefObject<Map<string, () => void>>
  hasFutureAttendances: boolean
  plannedAttendances?: PlannedStaffAttendance[]
}

interface FormAttendance {
  groupId: UUID | null
  startTime: string
  endTime: string
  attendanceId: UUID | null
  /**
   * The tracking ID is used internally in this component for referencing
   * attendances not yet in the database (e.g., empty placeholders).
   * If the attendance has been added to the database, the tracking ID will
   * equal the real attendance ID.
   */
  trackingId: string
  arrivalDate: LocalDate
  departureDate: LocalDate | null
  wasDeleted?: boolean
}

let trackingIdCounter = 1
const emptyAttendanceOn = (date: LocalDate): FormAttendance => ({
  groupId: null,
  startTime: '',
  endTime: '',
  attendanceId: null,
  trackingId: (trackingIdCounter++).toString(),
  arrivalDate: date,
  departureDate: date
})

const mergeExistingFormAttendance = (
  existing: FormAttendance,
  current: FormAttendance
): FormAttendance => ({
  startTime:
    current.startTime.length > 0 ? current.startTime : existing.startTime,
  endTime: current.endTime.length > 0 ? current.endTime : existing.endTime,
  departureDate: existing.departureDate ?? current.departureDate,
  arrivalDate: existing.arrivalDate ?? current.arrivalDate,
  groupId: existing.groupId ?? current.groupId,
  trackingId: existing.trackingId ?? current.trackingId,
  attendanceId: existing.attendanceId ?? current.attendanceId
})

type QueueExecutionFn = () => Promise<unknown>

const AttendanceRow = React.memo(function AttendanceRow({
  rowIndex,
  isPositiveOccupancyCoefficient,
  name,
  employeeId,
  operationalDays,
  attendances,
  saveAttendances,
  deleteAttendances: _deleteAttendances,
  reloadStaffAttendances,
  openDetails,
  groupFilter,
  selectedGroup,
  weekSavingFns,
  hasFutureAttendances: _hasFutureAttendances,
  plannedAttendances
}: AttendanceRowProps) {
  const { i18n } = useTranslation()

  const [editing, setEditing] = useState<boolean>(false)

  const [savingQueue, setSavingQueue] = useState<QueueExecutionFn[]>([])
  const [saveStatus, setSaveStatus] = useState<'loading' | 'idle'>('idle')

  const processQueue = useCallback(() => {
    setSavingQueue((queue) => {
      if (queue[0]) {
        setSaveStatus('loading')
        void queue[0]().then(() => processQueue())
        return queue.slice(1)
      } else {
        setSaveStatus('idle')
        return []
      }
    })
  }, [])

  const addToQueue = useCallback(
    (fn: QueueExecutionFn) => {
      setSavingQueue([...savingQueue, fn])
      if (savingQueue.length === 0) {
        processQueue()
      }
    },
    [processQueue, savingQueue]
  )

  const [form, setForm] = useState<FormAttendance[]>()
  const [hasFutureAttendances, setHasFutureAttendances] = useState(false)

  const [hasHiddenDailyAttendances, setHasHiddenDailyAttendances] =
    useState(false)

  useEffect(() => {
    // this effect converts existing attendances into editable form
    // attendances, and creates empty attendances for dates without
    // existing attendances

    const [shownDailyAttendances, hiddenDailyAttendances] = partition(
      attendances,
      ({ groupId, type }) =>
        (groupId === undefined || groupFilter(groupId)) &&
        (type === undefined || type === 'PRESENT')
    )

    setHasHiddenDailyAttendances(hiddenDailyAttendances.length > 0)

    const formAttendances = shownDailyAttendances.map(
      ({ groupId, arrived, departed, id }) => ({
        groupId,
        startTime: arrived.toLocalTime().format('HH:mm'),
        endTime: departed?.toLocalTime().format('HH:mm') ?? '',
        attendanceId: id,
        trackingId: id,
        arrivalDate: arrived.toLocalDate(),
        departureDate: departed?.toLocalDate() ?? arrived.toLocalDate()
      })
    )

    if (!editing) {
      const ranges = formAttendances.map(
        ({ arrivalDate, departureDate }) =>
          new FiniteDateRange(arrivalDate, departureDate)
      )

      const newEmptyAttendances = operationalDays
        .filter(({ date }) => !ranges.some((range) => range.includes(date)))
        .map(({ date }) => emptyAttendanceOn(date))

      setForm([...formAttendances, ...newEmptyAttendances])
      setHasFutureAttendances(_hasFutureAttendances)
      return
    }

    // the parent component may update data even after the initial load
    // and after the user may have changed values, so the existing data
    // needs to be combined with the new data (but not when view-only)
    setForm((formValue) => {
      const restoredAttendances = formAttendances.map((newAttendance) => {
        const existingFormValue =
          newAttendance.attendanceId &&
          formValue?.find(
            (value) =>
              value.attendanceId &&
              value.attendanceId === newAttendance.attendanceId
          )

        return existingFormValue && !existingFormValue.wasDeleted
          ? mergeExistingFormAttendance(existingFormValue, newAttendance)
          : newAttendance
      })

      const ranges = restoredAttendances
        .map(
          ({ arrivalDate, departureDate }) =>
            departureDate && new FiniteDateRange(arrivalDate, departureDate)
        )
        .filter((range): range is FiniteDateRange => !!range)

      const newEmptyAttendances = operationalDays
        .filter(({ date }) => !ranges.some((range) => range.includes(date)))
        .map(({ date }) => emptyAttendanceOn(date))
        .map((newAttendance) => {
          const existingFormValue = formValue?.find(
            (value) =>
              value.arrivalDate.isEqual(newAttendance.arrivalDate) &&
              !value.attendanceId
          )

          return existingFormValue && !existingFormValue.wasDeleted
            ? mergeExistingFormAttendance(existingFormValue, newAttendance)
            : newAttendance
        })

      return [...restoredAttendances, ...newEmptyAttendances]
    })
    setHasFutureAttendances(_hasFutureAttendances)
  }, [
    groupFilter,
    attendances,
    operationalDays,
    editing,
    _hasFutureAttendances
  ])

  const createAttendance = useCallback(
    (date: LocalDate, data: Partial<FormAttendance>) =>
      setForm((formValue) => [
        ...(formValue ?? []),
        {
          ...emptyAttendanceOn(date),
          ...data
        }
      ]),
    []
  )

  const renderTime = useCallback((time: string, sameDay: boolean) => {
    if (!sameDay) return '→'
    if (time === '') return '–'
    return time
  }, [])

  const updateAttendance = useCallback(
    (trackingId: string, updatedValue: Partial<FormAttendance>) =>
      setForm((formValue) =>
        formValue?.map((value) =>
          value.trackingId === trackingId
            ? {
                ...value,
                ...updatedValue
              }
            : value
        )
      ),
    []
  )

  const deleteAttendances = useCallback(
    (ids: string[]) =>
      employeeId ? _deleteAttendances(ids, []) : _deleteAttendances([], ids),
    [_deleteAttendances, employeeId]
  )

  const removeAttendances = useCallback(
    (trackingIds: string[]) => {
      setForm((formValue) => {
        const [filteredValues, removedValues] = partition(
          formValue,
          (value) => !trackingIds.includes(value.trackingId)
        )

        const deletedAttendances = removedValues.filter(
          (val): val is FormAttendance & { attendanceId: string } =>
            !!val.attendanceId
        )

        if (deletedAttendances.length > 0) {
          addToQueue(() =>
            deleteAttendances(
              deletedAttendances.map(({ attendanceId }) => attendanceId)
            )
          )
        }

        return filteredValues
      })
    },
    [deleteAttendances, addToQueue]
  )

  // if there is an attendance with a missing departure time, a departure must
  // be filled in before another attendance arrival can be made
  const departureLock = useMemo(() => {
    const lockingAttendance = sortBy(form, (value) => value.arrivalDate).find(
      ({ departureDate, endTime, startTime }) =>
        !departureDate || (endTime.length === 0 && startTime.length > 0)
    )

    return (
      lockingAttendance && {
        attendance: lockingAttendance,
        since: lockingAttendance.arrivalDate.addDays(1)
      }
    )
  }, [form])

  // when there is a departure lock, there is a technically viable ending
  // departure time in the future for an open attendance but that (other)
  // date has an arrival time too, so it is not logical to use this
  // departure time; this should only happen mid-editing
  const departureLockError = useMemo(() => {
    // this memo also combines overnight attendances into one, or
    // breaks them apart if the attendance's departure time was emptied

    if (departureLock) {
      const sorted = sortBy(form, (value) => value.arrivalDate)
      const departureLockIndex = sorted.findIndex(
        ({ trackingId }) => trackingId === departureLock.attendance.trackingId
      )

      if (departureLockIndex === -1) return false

      const firstViableDepartureDay = sorted
        .slice(departureLockIndex)
        .find(({ endTime }) => endTime.length > 0)

      if (
        firstViableDepartureDay?.startTime &&
        firstViableDepartureDay.trackingId !==
          departureLock.attendance.trackingId
      ) {
        return true
      }

      if (firstViableDepartureDay?.departureDate) {
        updateAttendance(departureLock.attendance.trackingId, {
          endTime: firstViableDepartureDay.endTime,
          departureDate: firstViableDepartureDay.arrivalDate
        })

        if (form) {
          for (const overlappingDate of new FiniteDateRange(
            departureLock.attendance.arrivalDate.addDays(1),
            firstViableDepartureDay.departureDate
          ).dates()) {
            removeAttendances(
              form
                .filter(({ arrivalDate }) =>
                  arrivalDate.isEqual(overlappingDate)
                )
                .map(({ trackingId }) => trackingId)
            )
          }
        }
      } else if (
        departureLock.attendance.departureDate &&
        !departureLock.attendance.departureDate.isEqual(
          departureLock.attendance.arrivalDate
        )
      ) {
        createAttendance(departureLock.attendance.arrivalDate, {
          startTime: departureLock.attendance.startTime
        })

        if (
          departureLock.attendance.departureDate
            .subDays(1)
            .isAfter(departureLock.attendance.arrivalDate.addDays(1))
        ) {
          for (const fillerDate of new FiniteDateRange(
            departureLock.attendance.arrivalDate.addDays(1),
            departureLock.attendance.departureDate.subDays(1)
          ).dates()) {
            createAttendance(fillerDate, {})
          }
        }

        updateAttendance(departureLock.attendance.trackingId, {
          arrivalDate: departureLock.attendance.departureDate,
          startTime: ''
        })
      }
    }

    return hasFutureAttendances
  }, [
    form,
    departureLock,
    updateAttendance,
    removeAttendances,
    createAttendance,
    hasFutureAttendances
  ])

  const { formErrors, validatedForm } = useMemo(() => {
    if (!form) {
      return {
        formErrors: {} as Record<string, undefined>,
        validatedForm: undefined
      }
    }

    const hasLockError = (trackingId: string) =>
      departureLockError && departureLock?.attendance.trackingId === trackingId

    const [invalidAttendances, validatedAttendances] = partition(
      form.map((attendance) => ({
        attendance,
        parsedTimes: {
          startTime: LocalTime.tryParse(attendance.startTime, 'HH:mm'),
          endTime: LocalTime.tryParse(attendance.endTime, 'HH:mm')
        }
      })) ?? [],
      ({ parsedTimes, attendance }) =>
        // likely mid-edit with other existing future attendances
        hasLockError(attendance.trackingId) ||
        // must have a start time, multi-day attendances are collapsed onto one
        // so there are no end-time–only attendances
        !parsedTimes.startTime ||
        // in some cases, the departing time may be empty (e.g., when the day
        // isn't over yet); departure lock above handles other edge cases,
        // so only the format is validated
        (!parsedTimes.endTime && attendance.endTime.length > 0) ||
        // arrival and departure time must be linear, unless they are on different dates
        ((!attendance.departureDate ||
          attendance.arrivalDate.isEqual(attendance.departureDate)) &&
          parsedTimes.endTime &&
          parsedTimes.startTime.isAfter(parsedTimes.endTime))
    )

    // attendances that are (no longer) valid need to be deleted from
    // the database and marked as such internally
    const deletableAttendances = invalidAttendances
      .map(({ attendance }) => attendance)
      .filter(
        (attendance): attendance is FormAttendance & { attendanceId: UUID } =>
          !!attendance.attendanceId
      )

    if (deletableAttendances.length > 0) {
      addToQueue(() =>
        deleteAttendances(
          deletableAttendances.map(({ attendanceId }) => attendanceId)
        )
      )

      for (const invalidAttendance of deletableAttendances) {
        updateAttendance(invalidAttendance.trackingId, {
          attendanceId: null,
          wasDeleted: true
        })
      }
    }

    return {
      validatedForm: validatedAttendances as {
        attendance: FormAttendance
        parsedTimes: {
          startTime: LocalTime
          endTime: LocalTime | null
        }
      }[],
      formErrors: Object.fromEntries(
        invalidAttendances
          .filter(
            ({ attendance }) =>
              hasLockError(attendance.trackingId) ||
              attendance.startTime.length > 0 ||
              attendance.endTime.length > 0
          )
          .map(({ attendance, parsedTimes }) => [
            attendance.trackingId,
            {
              startTime:
                (!parsedTimes.startTime ||
                  (parsedTimes.endTime &&
                    parsedTimes.startTime.isAfter(parsedTimes.endTime))) ??
                false,
              endTime:
                hasLockError(attendance.trackingId) ||
                ((!parsedTimes.endTime ||
                  (parsedTimes.startTime &&
                    parsedTimes.startTime.isAfter(parsedTimes.endTime))) ??
                  false)
            }
          ])
      )
    }
  }, [
    deleteAttendances,
    departureLock?.attendance.trackingId,
    departureLockError,
    addToQueue,
    form,
    updateAttendance
  ])

  const baseAttendances = useMemo(
    () =>
      validatedForm
        ?.map((row) => ({
          attendanceId: row.attendance.attendanceId,
          type: 'PRESENT',
          groupId: row.attendance.groupId ?? selectedGroup,
          arrived: HelsinkiDateTime.fromLocal(
            row.attendance.arrivalDate,
            row.parsedTimes.startTime
          ),
          departed:
            row.parsedTimes.endTime &&
            row.attendance.departureDate &&
            HelsinkiDateTime.fromLocal(
              row.attendance.departureDate,
              row.parsedTimes.endTime
            )
        }))
        .filter(
          (row): row is Omit<UpsertStaffAttendance, 'employeeId'> =>
            !!row.groupId
        ),
    [selectedGroup, validatedForm]
  )

  const [lastSavedForm, setLastSavedForm] = useState<{
    form: Omit<UpsertStaffAttendance, 'employeeId'>[]
    employeeId?: UUID
    name?: string
  }>()

  useEffect(() => {
    setLastSavedForm((lsf) => {
      if (
        baseAttendances &&
        (!lsf ||
          (employeeId && lsf.employeeId !== employeeId) ||
          (name && lsf.name !== name))
      ) {
        return {
          form: baseAttendances,
          employeeId,
          name
        }
      }

      return lsf
    })
  }, [employeeId, name, baseAttendances])

  const saveForm = useCallback(
    async (savePartials: boolean, isClosingEditor: boolean) => {
      if (!baseAttendances) return

      const updatedBaseAttendances = lastSavedForm
        ? baseAttendances.filter(
            (attendance) =>
              // if the user is mid-edit, partial attendances shouldn't be saved
              // because it is possible it is rejected (due to conflicts) in the
              // future, but if the user is exiting the editor/etc., we should try
              (savePartials || !!attendance.departed) &&
              // only new attendances (i.e., without an attendanceId) or changed ones
              // should be saved
              (!attendance.attendanceId ||
                !isEqual(
                  lastSavedForm.form.find(
                    (formRow) =>
                      formRow.attendanceId === attendance.attendanceId
                  ),
                  attendance
                ))
          )
        : baseAttendances

      if (updatedBaseAttendances.length === 0) {
        if (isClosingEditor) {
          await reloadStaffAttendances()
        }

        return
      }

      setLastSavedForm({ form: baseAttendances, employeeId, name })

      if (employeeId) {
        await saveAttendances({
          staffAttendances: updatedBaseAttendances.map((base) => ({
            ...base,
            employeeId
          })),
          externalAttendances: []
        })
      } else if (name) {
        await saveAttendances({
          staffAttendances: [],
          externalAttendances: updatedBaseAttendances.map((base) => ({
            ...base,
            name
          }))
        })
      }

      // reload only if closing the editor, or if new attendances were inserted
      if (
        isClosingEditor ||
        updatedBaseAttendances.some(({ attendanceId }) => !attendanceId)
      ) {
        await reloadStaffAttendances()
      }
    },
    [
      lastSavedForm,
      baseAttendances,
      employeeId,
      name,
      reloadStaffAttendances,
      saveAttendances
    ]
  )

  useEffect(() => {
    const fnMap = weekSavingFns.current

    const key = JSON.stringify([employeeId, name])

    fnMap.delete(key)

    if (editing) {
      fnMap.set(key, () => saveForm(true, false))
    }

    return () => {
      fnMap.delete(key)
    }
  }, [editing, employeeId, name, saveForm, weekSavingFns])

  const [ignoreFormError, setIgnoreFormError] = useState(false)

  useEffect(() => {
    setIgnoreFormError(false)
  }, [validatedForm])

  const plannedAttendancesForDate = useCallback(
    (date: LocalDate): PlannedStaffAttendance[] => {
      const matchingPlannedAttendances =
        plannedAttendances &&
        plannedAttendances.filter(
          (plannedAttendance) =>
            plannedAttendance.start.toLocalDate().isEqual(date) ||
            plannedAttendance.end.toLocalDate().isEqual(date)
        )
      return matchingPlannedAttendances || []
    },
    [plannedAttendances]
  )

  return (
    <DayTr data-qa={`attendance-row-${rowIndex}`}>
      <NameTd partialRow={false} rowIndex={rowIndex}>
        <FixedSpaceRow spacing="xs">
          <Tooltip
            tooltip={
              isPositiveOccupancyCoefficient
                ? i18n.unit.attendanceReservations.affectsOccupancy
                : i18n.unit.attendanceReservations.doesNotAffectOccupancy
            }
            position="bottom"
            width="large"
          >
            <RoundIcon
              content="K"
              active={isPositiveOccupancyCoefficient}
              color={colors.accents.a3emerald}
              size="s"
              data-qa={
                isPositiveOccupancyCoefficient
                  ? 'icon-occupancy-coefficient-pos'
                  : 'icon-occupancy-coefficient'
              }
            />
          </Tooltip>
          <NameWrapper data-qa="staff-attendance-name">{name}</NameWrapper>
        </FixedSpaceRow>
      </NameTd>
      {form &&
        operationalDays
          .map(({ date }) => ({
            date,
            attendances: form.filter(
              ({ arrivalDate, departureDate }) =>
                (departureDate &&
                  new DateRange(arrivalDate, departureDate).includes(date)) ||
                arrivalDate.isEqual(date)
            )
          }))
          .map(({ date, attendances }) => (
            <DayTd
              key={date.formatIso()}
              className={classNames({ 'is-today': date.isToday() })}
              partialRow={false}
              rowIndex={rowIndex}
              data-qa={`day-cell-${employeeId ?? ''}-${date.formatIso()}`}
            >
              <DayCell data-qa={`attendance-${date.formatIso()}-${rowIndex}`}>
                <PlannedAttendanceTimes data-qa="planned-attendance-day">
                  {plannedAttendancesForDate(date).length > 0 ? (
                    plannedAttendancesForDate(date).map(
                      (plannedAttendance, i) => (
                        <AttendanceCell key={i}>
                          <>
                            <AttendanceTime data-qa="planned-attendance-start">
                              {renderTime(
                                plannedAttendance.start
                                  .toLocalTime()
                                  .format('HH:mm'),
                                plannedAttendance.start
                                  .toLocalDate()
                                  .isEqual(date)
                              )}
                            </AttendanceTime>
                            <AttendanceTime data-qa="planned-attendance-end">
                              {renderTime(
                                plannedAttendance.end
                                  .toLocalTime()
                                  .format('HH:mm'),
                                plannedAttendance.end
                                  .toLocalDate()
                                  .isEqual(date)
                              )}
                            </AttendanceTime>
                          </>
                        </AttendanceCell>
                      )
                    )
                  ) : (
                    <AttendanceCell>
                      <>
                        <AttendanceTime data-qa="planned-arrival-time">
                          {renderTime('', true)}
                        </AttendanceTime>
                        <AttendanceTime data-qa="planned-departure-time">
                          {renderTime('', true)}
                        </AttendanceTime>
                      </>
                    </AttendanceCell>
                  )}
                </PlannedAttendanceTimes>
                <AttendanceTimes data-qa="attendance-day">
                  {attendances.map((attendance, i) => (
                    <AttendanceCell key={i}>
                      {editing && (attendance.groupId || selectedGroup) ? (
                        <OvernightAwareTimeRangeEditor
                          attendance={attendance}
                          date={date}
                          update={(updatedValue) => {
                            updateAttendance(
                              attendance.trackingId,
                              updatedValue
                            )
                          }}
                          splitOvernight={(side) => {
                            if (!attendance.departureDate) return

                            if (side === 'arrival') {
                              createAttendance(date, {
                                startTime: '00:00',
                                endTime: attendance.endTime,
                                arrivalDate: date,
                                departureDate: attendance.departureDate
                              })
                              updateAttendance(attendance.trackingId, {
                                departureDate: date.subDays(1),
                                endTime: '23:59'
                              })
                            } else if (side === 'departure') {
                              createAttendance(date, {
                                endTime: '23:59',
                                startTime: attendance.startTime,
                                departureDate: date,
                                arrivalDate: attendance.arrivalDate
                              })
                              updateAttendance(attendance.trackingId, {
                                arrivalDate: date.addDays(1),
                                startTime: '00:00'
                              })
                            }
                          }}
                          errors={formErrors[attendance.trackingId]}
                          departureLocked={
                            departureLock && !departureLockError
                              ? date.isEqualOrAfter(departureLock.since)
                              : false
                          }
                        />
                      ) : (
                        <>
                          <AttendanceTime data-qa="arrival-time">
                            {renderTime(
                              attendance.startTime,
                              attendance.arrivalDate.isEqual(date)
                            )}
                          </AttendanceTime>
                          <AttendanceTime data-qa="departure-time">
                            {renderTime(
                              attendance.endTime,
                              attendance.departureDate?.isEqual(date) ?? true
                            )}
                          </AttendanceTime>
                        </>
                      )}
                    </AttendanceCell>
                  ))}
                </AttendanceTimes>
                {!!employeeId && openDetails && !editing && (
                  <DetailsToggle showAlways={hasHiddenDailyAttendances}>
                    <IconButton
                      icon={faCircleEllipsis}
                      onClick={() => openDetails({ employeeId, date })}
                      data-qa={`open-details-${employeeId}-${date.formatIso()}`}
                      aria-label={i18n.common.open}
                    />
                  </DetailsToggle>
                )}
              </DayCell>
            </DayTd>
          ))}
      <StyledTd partialRow={false} rowIndex={rowIndex} rowSpan={1}>
        {editing ? (
          !ignoreFormError &&
          Object.values(formErrors).some(
            (error) => error?.endTime || error?.startTime
          ) ? (
            <FormErrorWarning onIgnore={() => setIgnoreFormError(true)} />
          ) : (
            <SaveRowButton
              loading={saveStatus === 'loading'}
              save={() =>
                addToQueue(() =>
                  saveForm(true, true).then(() => setEditing(false))
                )
              }
            />
          )
        ) : (
          <RowMenu onEdit={() => setEditing(true)} />
        )}
      </StyledTd>
    </DayTr>
  )
})

export const SaveRowButton = React.memo(function SaveRowButton({
  loading,
  save,
  'data-qa': dataQa
}: {
  loading: boolean
  save: () => void
  'data-qa'?: string
}) {
  const { i18n } = useTranslation()

  if (loading) {
    return <SpinnerSegment size="m" margin="zero" data-qa={dataQa} />
  }

  return (
    <IconButton
      icon={faCheck}
      onClick={save}
      disabled={loading}
      data-qa="inline-editor-state-button"
      aria-label={i18n.common.save}
    />
  )
})

export const FormErrorWarning = React.memo(function FormErrorWarning({
  onIgnore
}: {
  onIgnore: () => void
}) {
  const { i18n } = useTranslation()

  return (
    <Tooltip tooltip={i18n.unit.staffAttendance.formErrorWarning}>
      <IconButton
        icon={faExclamationTriangle}
        color={colors.status.warning}
        onClick={onIgnore}
        data-qa="form-error-warning"
        aria-label={i18n.unit.staffAttendance.formErrorWarning}
      />
    </Tooltip>
  )
})

const DetailsToggle = styled.div<{ showAlways: boolean }>`
  display: flex;
  align-items: center;
  padding: ${defaultMargins.xxs};
  margin-left: -${defaultMargins.s};
  visibility: ${({ showAlways }) => (showAlways ? 'visible' : 'hidden')};
  position: absolute;
  bottom: 0;
  right: 0;
  margin-bottom: 3px;
`

const DayCell = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;

  &:hover {
    ${DetailsToggle} {
      visibility: visible;
    }
  }
`

const AttendanceTimes = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  background-color: ${colors.grayscale.g4};
  width: 100%;
  padding: 0px 15px 0px 0px;
`

const PlannedAttendanceTimes = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  padding: 0px 15px 0px 0px;
`

const AttendanceCell = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  justify-content: space-evenly;
  padding: ${defaultMargins.xs};
  gap: ${defaultMargins.xs};
`

const AttendanceTime = styled.span`
  font-weight: ${fontWeights.semibold};
  flex: 1 0 54px;
  text-align: center;
  white-space: nowrap;
`

type RowMenuProps = {
  onEdit: () => void
}
const RowMenu = React.memo(function RowMenu({ onEdit }: RowMenuProps) {
  const { i18n } = useTranslation()
  return (
    <EllipsisMenu
      items={[
        {
          id: 'edit-row',
          label: i18n.unit.attendanceReservations.editRow,
          onClick: onEdit
        }
      ]}
      data-qa="row-menu"
    />
  )
})
