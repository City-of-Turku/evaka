// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later
import React, { Fragment, useContext } from 'react'

import {
  AttendanceChild,
  getDaycareAttendances,
  returnToComing
} from '../../api/attendances'
import { AttendanceUIContext } from '../../state/attendance-ui'
import { useTranslation } from '../../state/i18n'
import { InlineWideAsyncButton } from './components'

interface Props {
  child: AttendanceChild
  unitId: string
}

export default React.memo(function AttendanceChildAbsent({
  child,
  unitId
}: Props) {
  const { i18n } = useTranslation()
  const { setAttendanceResponse } = useContext(AttendanceUIContext)

  function returnToComingCall() {
    return returnToComing(unitId, child.id)
  }

  return (
    <Fragment>
      <InlineWideAsyncButton
        text={i18n.attendances.actions.returnToComing}
        onClick={() => returnToComingCall()}
        onSuccess={async () => {
          await getDaycareAttendances(unitId).then(setAttendanceResponse)
        }}
        data-qa="delete-attendance"
      />
    </Fragment>
  )
})
