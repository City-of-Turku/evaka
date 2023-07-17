// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import HelsinkiDateTime from 'lib-common/helsinki-date-time'
import LocalTime from 'lib-common/local-time'
import { useQueryResult } from 'lib-common/query'
import useNonNullableParams from 'lib-common/useNonNullableParams'
import MutateButton, {
  cancelMutation
} from 'lib-components/atoms/buttons/MutateButton'
import TimeInput from 'lib-components/atoms/form/TimeInput'
import ErrorSegment from 'lib-components/atoms/state/ErrorSegment'
import { FixedSpaceColumn } from 'lib-components/layout/flex-helpers'
import { Label } from 'lib-components/typography'

import { renderResult } from '../async-rendering'
import { useTranslation } from '../common/i18n'

import { EmployeeCardBackground } from './components/EmployeeCardBackground'
import { StaffMemberPageContainer } from './components/StaffMemberPageContainer'
import { TimeInfo } from './components/staff-components'
import { externalStaffDepartureMutation, staffAttendanceQuery } from './queries'
import { toStaff } from './utils'

export default React.memo(function ExternalStaffMemberPage() {
  const navigate = useNavigate()
  const { unitId, attendanceId } = useNonNullableParams<{
    unitId: string
    attendanceId: string
  }>()
  const { i18n } = useTranslation()

  const staffAttendanceResponse = useQueryResult(staffAttendanceQuery(unitId))

  const attendance = useMemo(
    () =>
      staffAttendanceResponse.map((res) =>
        res.extraAttendances.find((s) => s.id === attendanceId)
      ),
    [attendanceId, staffAttendanceResponse]
  )

  const [time, setTime] = useState(() =>
    HelsinkiDateTime.now().toLocalTime().format()
  )
  const parsedTime = useMemo(() => LocalTime.tryParse(time), [time])

  return renderResult(attendance, (ext) => (
    <StaffMemberPageContainer>
      {!ext ? (
        <ErrorSegment title={i18n.attendances.staff.errors.employeeNotFound} />
      ) : (
        <>
          <EmployeeCardBackground staff={toStaff(ext)} />
          <FixedSpaceColumn>
            <TimeInfo>
              <Label>{i18n.attendances.arrivalTime}</Label>{' '}
              <span data-qa="arrival-time">
                {ext.arrived.toLocalTime().format()}
              </span>
            </TimeInfo>

            <TimeInfo>
              <Label htmlFor="time-input">
                {i18n.attendances.departureTime}
              </Label>
              <TimeInput
                id="time-input"
                data-qa="departure-time-input"
                value={time}
                onChange={(val) => setTime(val)}
              />
            </TimeInfo>

            <MutateButton
              primary
              text={i18n.attendances.actions.markDeparted}
              data-qa="mark-departed-btn"
              disabled={!parsedTime}
              mutation={externalStaffDepartureMutation}
              onClick={() =>
                parsedTime !== undefined
                  ? { unitId, request: { attendanceId, time: parsedTime } }
                  : cancelMutation
              }
              onSuccess={() => {
                navigate(-1)
              }}
            />
          </FixedSpaceColumn>
        </>
      )}
    </StaffMemberPageContainer>
  ))
})
