// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useContext, useEffect, useState } from 'react'
import { useHistory, useParams } from 'react-router-dom'
import styled from 'styled-components'

import { faArrowLeft, farStickyNote } from 'lib-icons'
import colors from 'lib-customizations/common'
import Loader from 'lib-components/atoms/Loader'
import { Gap } from 'lib-components/white-space'
import AsyncButton from 'lib-components/atoms/buttons/AsyncButton'
import Button from 'lib-components/atoms/buttons/Button'
import {
  FixedSpaceColumn,
  FixedSpaceRow
} from 'lib-components/layout/flex-helpers'
import RoundIcon from 'lib-components/atoms/RoundIcon'
import ErrorSegment from 'lib-components/atoms/state/ErrorSegment'
import { ContentArea } from 'lib-components/layout/Container'

import { TallContentArea } from '../../mobile/components'
import { ChildAttendanceContext } from '../../../state/child-attendance'
import { postFullDayAbsence } from '../../../api/attendances'
import { useTranslation } from '../../../state/i18n'
import DailyNote from '../notes/DailyNote'
import { AbsenceType } from '../../../types'
import AbsenceSelector from '../AbsenceSelector'
import {
  CustomTitle,
  Actions,
  DailyNotes,
  BackButtonInline
} from '../components'

export default React.memo(function MarkAbsent() {
  const history = useHistory()
  const { i18n } = useTranslation()

  const { attendanceResponse, reloadAttendances } = useContext(
    ChildAttendanceContext
  )

  useEffect(() => reloadAttendances(true), [reloadAttendances])

  const [selectedAbsenceType, setSelectedAbsenceType] = useState<
    AbsenceType | undefined
  >(undefined)

  const { childId, unitId, groupId } = useParams<{
    unitId: string
    groupId: string
    childId: string
  }>()

  async function postAbsence(absenceType: AbsenceType) {
    return postFullDayAbsence(unitId, childId, absenceType)
  }

  const child =
    attendanceResponse.isSuccess &&
    attendanceResponse.value.children.find((ac) => ac.id === childId)

  const groupNote =
    attendanceResponse.isSuccess &&
    attendanceResponse.value.groupNotes.find((g) => g.groupId === groupId)
      ?.dailyNote

  return (
    <>
      {attendanceResponse.isLoading && <Loader />}
      {attendanceResponse.isFailure && <ErrorSegment />}
      {attendanceResponse.isSuccess && (
        <TallContentArea
          opaque={false}
          paddingHorizontal={'zero'}
          paddingVertical={'zero'}
        >
          <BackButtonInline
            onClick={() => history.goBack()}
            icon={faArrowLeft}
            text={
              child ? `${child.firstName} ${child.lastName}` : i18n.common.back
            }
          />
          <ContentArea
            shadow
            opaque={true}
            paddingHorizontal={'s'}
            paddingVertical={'m'}
          >
            <AbsenceWrapper>
              <CustomTitle>{i18n.attendances.actions.markAbsent}</CustomTitle>
              <Gap size={'m'} />
              <FixedSpaceColumn spacing={'s'}>
                <AbsenceSelector
                  selectedAbsenceType={selectedAbsenceType}
                  setSelectedAbsenceType={setSelectedAbsenceType}
                />
              </FixedSpaceColumn>
            </AbsenceWrapper>
            <Gap size={'m'} />
            <Actions>
              <FixedSpaceRow fullWidth>
                <Button
                  text={i18n.common.cancel}
                  onClick={() => history.goBack()}
                />
                {selectedAbsenceType ? (
                  <AsyncButton
                    primary
                    text={i18n.common.confirm}
                    onClick={() => postAbsence(selectedAbsenceType)}
                    onSuccess={() => {
                      reloadAttendances()
                      history.goBack()
                    }}
                    data-qa="mark-absent-btn"
                  />
                ) : (
                  <Button primary text={i18n.common.confirm} disabled={true} />
                )}
              </FixedSpaceRow>
            </Actions>
          </ContentArea>
          <Gap size={'s'} />
          <ContentArea
            shadow
            opaque={true}
            paddingHorizontal={'s'}
            paddingVertical={'s'}
            blue
          >
            <DailyNotes>
              <span>
                <RoundIcon
                  content={farStickyNote}
                  color={colors.blues.medium}
                  size={'m'}
                />
              </span>
              <DailyNote
                child={child ? child : undefined}
                groupNote={groupNote ? groupNote : undefined}
              />
            </DailyNotes>
          </ContentArea>
        </TallContentArea>
      )}
    </>
  )
})

const AbsenceWrapper = styled.div`
  display: flex;
  flex-direction: column;
`
