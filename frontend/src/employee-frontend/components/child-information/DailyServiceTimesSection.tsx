// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import orderBy from 'lodash/orderBy'
import React, { useContext, useState } from 'react'

import { ChildContext, ChildState } from 'employee-frontend/state/child'
import {
  ChildId,
  DailyServiceTimeId
} from 'lib-common/generated/api-types/shared'
import { useMutationResult, useQueryResult } from 'lib-common/query'
import HorizontalLine from 'lib-components/atoms/HorizontalLine'
import AddButton from 'lib-components/atoms/buttons/AddButton'
import { CollapsibleContentArea } from 'lib-components/layout/Container'
import { Table, Tbody } from 'lib-components/layout/Table'
import { FixedSpaceRow } from 'lib-components/layout/flex-helpers'
import InfoModal from 'lib-components/molecules/modals/InfoModal'
import { H2, H4, P } from 'lib-components/typography'
import { Gap } from 'lib-components/white-space'
import { faQuestion } from 'lib-icons'

import { useTranslation } from '../../state/i18n'
import { renderResult } from '../async-rendering'

import { DailyServiceTimesCreationForm } from './daily-service-times/DailyServiceTimesForms'
import DailyServiceTimesRow from './daily-service-times/DailyServiceTimesRow'
import {
  deleteDailyServiceTimesMutation,
  getDailyServiceTimesQuery
} from './queries'

interface Props {
  childId: ChildId
  startOpen: boolean
}

export default React.memo(function DailyServiceTimesSection({
  childId,
  startOpen
}: Props) {
  const { i18n } = useTranslation()
  const { permittedActions } = useContext<ChildState>(ChildContext)

  const [open, setOpen] = useState(startOpen)

  const apiData = useQueryResult(getDailyServiceTimesQuery({ childId }))

  const [creationFormOpen, setCreationFormOpen] = useState(false)

  const [uiMode, setUIMode] = useState<{
    type: 'delete' | 'modify'
    id: DailyServiceTimeId
  }>()

  return (
    <>
      {uiMode?.type === 'delete' && (
        <DeleteDailyServiceTimesModal
          childId={childId}
          dailyServiceTimesId={uiMode.id}
          onClose={() => {
            setUIMode(undefined)
          }}
        />
      )}
      <CollapsibleContentArea
        title={
          <H2 noMargin>{i18n.childInformation.dailyServiceTimes.title}</H2>
        }
        open={open}
        toggleOpen={() => setOpen(!open)}
        opaque
        paddingVertical="L"
        data-qa="child-daily-service-times-collapsible"
      >
        <P>
          {i18n.childInformation.dailyServiceTimes.info}
          <br />
          {i18n.childInformation.dailyServiceTimes.info2}
          <br />
          {i18n.childInformation.dailyServiceTimes.info3}
        </P>

        {permittedActions.has('CREATE_DAILY_SERVICE_TIME') && (
          <FixedSpaceRow justifyContent="flex-end">
            <AddButton
              flipped
              text={i18n.childInformation.dailyServiceTimes.create}
              onClick={() => {
                setCreationFormOpen(true)
              }}
              disabled={creationFormOpen}
              data-qa="create-daily-service-times"
            />
          </FixedSpaceRow>
        )}

        {creationFormOpen && (
          <>
            <HorizontalLine slim dashed />
            <H4>{i18n.childInformation.dailyServiceTimes.createNewTimes}</H4>
            <DailyServiceTimesCreationForm
              onClose={() => {
                setCreationFormOpen(false)
              }}
              childId={childId}
            />
          </>
        )}

        <Gap size="m" />

        {renderResult(apiData, (dailyServiceTimesList) => (
          <Table>
            <Tbody>
              {orderBy(
                dailyServiceTimesList,
                ({ dailyServiceTimes: { times } }) =>
                  times.validityPeriod.start,
                ['desc']
              ).map(
                ({ permittedActions, dailyServiceTimes: { id, times } }) => (
                  <DailyServiceTimesRow
                    key={id}
                    childId={childId}
                    times={times}
                    permittedActions={permittedActions}
                    onDelete={() => setUIMode({ type: 'delete', id })}
                    onEdit={(open) =>
                      setUIMode(open ? { type: 'modify', id } : undefined)
                    }
                    isEditing={uiMode?.id === id && uiMode?.type === 'modify'}
                    id={id}
                  />
                )
              )}
            </Tbody>
          </Table>
        ))}
      </CollapsibleContentArea>
    </>
  )
})

const DeleteDailyServiceTimesModal = React.memo(
  function DeleteDailyServiceTimesModal({
    childId,
    dailyServiceTimesId,
    onClose
  }: {
    childId: ChildId
    dailyServiceTimesId: DailyServiceTimeId
    onClose: () => void
  }) {
    const { i18n } = useTranslation()

    const { mutateAsync: deleteDailyServiceTimes } = useMutationResult(
      deleteDailyServiceTimesMutation
    )
    return (
      <InfoModal
        type="warning"
        title={i18n.childInformation.dailyServiceTimes.deleteModal.title}
        text={i18n.childInformation.dailyServiceTimes.deleteModal.description}
        icon={faQuestion}
        reject={{
          action: () => onClose(),
          label: i18n.common.cancel
        }}
        resolve={{
          async action() {
            await deleteDailyServiceTimes({ childId, id: dailyServiceTimesId })
            onClose()
          },
          label: i18n.childInformation.dailyServiceTimes.deleteModal.deleteBtn
        }}
      />
    )
  }
)
