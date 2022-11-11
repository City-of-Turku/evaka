// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import orderBy from 'lodash/orderBy'
import React, { useContext, useMemo } from 'react'

import useNonNullableParams from 'lib-common/useNonNullableParams'
import ErrorSegment from 'lib-components/atoms/state/ErrorSegment'
import { FixedSpaceColumn } from 'lib-components/layout/flex-helpers'
import { Label } from 'lib-components/typography'
import { featureFlags } from 'lib-customizations/employeeMobile'

import { useTranslation } from '../../state/i18n'
import { StaffAttendanceContext } from '../../state/staff-attendance'
import { UnwrapResult } from '../async-rendering'
import { WideLinkButton } from '../mobile/components'

import { EmployeeCardBackground } from './components/EmployeeCardBackground'
import { StaffMemberPageContainer } from './components/StaffMemberPageContainer'
import { TimeInfo } from './components/staff-components'
import { toStaff } from './staff'

export default React.memo(function StaffMemberPage() {
  const { unitId, groupId, employeeId } = useNonNullableParams<{
    unitId: string
    groupId: string
    employeeId: string
  }>()
  const { i18n } = useTranslation()

  const { staffAttendanceResponse } = useContext(StaffAttendanceContext)

  const staffMember = useMemo(
    () =>
      staffAttendanceResponse.map((res) =>
        res.staff.find((s) => s.employeeId === employeeId)
      ),
    [employeeId, staffAttendanceResponse]
  )

  return (
    <StaffMemberPageContainer>
      <UnwrapResult result={staffMember}>
        {(staffMember) =>
          staffMember === undefined ? (
            <ErrorSegment
              title={i18n.attendances.staff.errors.employeeNotFound}
            />
          ) : (
            <>
              <EmployeeCardBackground staff={toStaff(staffMember)} />
              <FixedSpaceColumn>
                {featureFlags.experimental?.staffAttendanceTypes ? (
                  <>
                    {staffMember.spanningPlan && (
                      <TimeInfo data-qa="shift-time">
                        <span>
                          {i18n.attendances.staff.plannedAttendance}{' '}
                          {staffMember.spanningPlan.start
                            .toLocalTime()
                            .format()}
                          –{staffMember.spanningPlan.end.toLocalTime().format()}
                        </span>
                      </TimeInfo>
                    )}
                    {staffMember.attendances.length > 0 &&
                      orderBy(staffMember.attendances, ({ arrived }) =>
                        arrived.formatIso()
                      ).map(({ arrived, departed, type }) => (
                        <TimeInfo
                          key={arrived.formatIso()}
                          data-qa="attendance-time"
                        >
                          <Label>{i18n.attendances.staffTypes[type]}</Label>{' '}
                          <span>
                            {arrived.toLocalTime().format()}–
                            {departed?.toLocalTime().format() ?? ''}
                          </span>
                        </TimeInfo>
                      ))}
                  </>
                ) : (
                  staffMember.latestCurrentDayAttendance && (
                    <>
                      <TimeInfo>
                        <Label>{i18n.attendances.arrivalTime}</Label>{' '}
                        <span data-qa="arrival-time">
                          {staffMember.latestCurrentDayAttendance.arrived
                            .toLocalTime()
                            .format()}
                        </span>
                      </TimeInfo>
                      {staffMember.latestCurrentDayAttendance.departed && (
                        <TimeInfo>
                          <Label>{i18n.attendances.departureTime}</Label>{' '}
                          <span data-qa="departure-time">
                            {staffMember.latestCurrentDayAttendance.departed
                              ?.toLocalTime()
                              .format()}
                          </span>
                        </TimeInfo>
                      )}
                    </>
                  )
                )}
                {staffMember.present ? (
                  <WideLinkButton
                    $primary
                    data-qa="mark-departed-link"
                    to={`/units/${unitId}/groups/${groupId}/staff-attendance/${staffMember.employeeId}/mark-departed`}
                  >
                    {i18n.attendances.staff.markDeparted}
                  </WideLinkButton>
                ) : (
                  <WideLinkButton
                    $primary
                    data-qa="mark-arrived-link"
                    to={`/units/${unitId}/groups/${groupId}/staff-attendance/${staffMember.employeeId}/mark-arrived`}
                  >
                    {i18n.attendances.staff.markArrived}
                  </WideLinkButton>
                )}
              </FixedSpaceColumn>
            </>
          )
        }
      </UnwrapResult>
    </StaffMemberPageContainer>
  )
})
