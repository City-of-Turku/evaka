// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useContext, useEffect, useState } from 'react'
import styled from 'styled-components'

import { Loading, Result } from 'lib-common/api'
import { UUID } from 'lib-common/types'
import { useRestApi } from 'lib-common/utils/useRestApi'
import AddButton from 'lib-components/atoms/buttons/AddButton'
import ErrorSegment from 'lib-components/atoms/state/ErrorSegment'
import { SpinnerSegment } from 'lib-components/atoms/state/Spinner'
import { FixedSpaceColumn } from 'lib-components/layout/flex-helpers'
import { defaultMargins, Gap } from 'lib-components/white-space'

import { getApplicationNotes } from '../../api/applications'
import ApplicationNoteBox from '../../components/application-page/ApplicationNoteBox'
import { useTranslation } from '../../state/i18n'
import { UserContext } from '../../state/user'
import { ApplicationNote } from '../../types/application'
import { requireRole } from '../../utils/roles'

const Sticky = styled.div`
  position: sticky;
  top: ${defaultMargins.s};
`

type Props = {
  applicationId: UUID
}

export default React.memo(function ApplicationNotes({ applicationId }: Props) {
  const { i18n } = useTranslation()
  const { roles, user } = useContext(UserContext)

  const [notes, setNotes] = useState<Result<ApplicationNote[]>>(Loading.of())
  const [editing, setEditing] = useState<UUID | null>(null)
  const [creating, setCreating] = useState<boolean>(false)

  const loadNotes = useRestApi(
    () => getApplicationNotes(applicationId),
    setNotes
  )
  useEffect(loadNotes, [loadNotes, applicationId])

  const editAllowed = (note: ApplicationNote): boolean => {
    return (
      requireRole(roles, 'ADMIN', 'SERVICE_WORKER') ||
      !!(
        requireRole(roles, 'UNIT_SUPERVISOR') &&
        user &&
        user.id &&
        user.id === note.createdBy
      )
    )
  }

  return (
    <>
      {notes.isLoading && <SpinnerSegment />}
      {notes.isFailure && <ErrorSegment />}
      {notes.isSuccess && (
        <>
          <FixedSpaceColumn>
            {notes.value.map((note) =>
              editing === note.id ? (
                <ApplicationNoteBox
                  key={note.id}
                  note={note}
                  onSave={() => {
                    setEditing(null)
                    loadNotes()
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <ApplicationNoteBox
                  key={note.id}
                  note={note}
                  editable={!creating && editing === null && editAllowed(note)}
                  onStartEdit={() => setEditing(note.id)}
                  onDelete={() => loadNotes()}
                />
              )
            )}
          </FixedSpaceColumn>

          {notes.value.length > 0 && <Gap size="s" />}

          <Sticky>
            {creating ? (
              <ApplicationNoteBox
                applicationId={applicationId}
                onSave={() => {
                  setCreating(false)
                  loadNotes()
                }}
                onCancel={() => setCreating(false)}
              />
            ) : editing ? null : (
              <AddButton
                onClick={() => setCreating(true)}
                text={i18n.application.notes.add}
                darker
                data-qa="add-note"
              />
            )}
          </Sticky>
        </>
      )}
    </>
  )
})
