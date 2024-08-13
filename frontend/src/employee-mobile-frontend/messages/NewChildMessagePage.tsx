// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useCallback, useContext, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import { combine } from 'lib-common/api'
import { MessageReceiver } from 'lib-common/api-types/messaging'
import { AttendanceChild } from 'lib-common/generated/api-types/attendance'
import { AuthorizedMessageAccount } from 'lib-common/generated/api-types/messaging'
import { useQueryResult } from 'lib-common/query'
import { UUID } from 'lib-common/types'
import useRouteParams from 'lib-common/useRouteParams'
import { ContentArea } from 'lib-components/layout/Container'
import { defaultMargins } from 'lib-components/white-space'
import { faArrowLeft } from 'lib-icons'

import { renderResult } from '../async-rendering'
import { childrenQuery } from '../child-attendance/queries'
import { useChild } from '../child-attendance/utils'
import TopBar from '../common/TopBar'
import { BackButtonInline } from '../common/components'
import { useTranslation } from '../common/i18n'

import MessageEditor from './MessageEditor'
import { recipientsQuery } from './queries'
import { MessageContext } from './state'

interface Props {
  unitId: UUID
  childGroupAccount: AuthorizedMessageAccount | undefined
  child: AttendanceChild
}

const NewChildMessagePage = React.memo(function NewChildMessagePage({
  unitId,
  childGroupAccount,
  child
}: Props) {
  const { i18n } = useTranslation()

  const navigate = useNavigate()
  const messageReceivers = useQueryResult(recipientsQuery())

  const receivers = useMemo(() => {
    const findChildReceivers = (
      receiver: MessageReceiver
    ): MessageReceiver[] =>
      receiver.type === 'CHILD' && receiver.id === child.id
        ? [receiver]
        : 'receivers' in receiver
          ? receiver.receivers.flatMap(findChildReceivers)
          : []

    return messageReceivers.map((accounts) =>
      accounts
        .map((account) => ({
          ...account,
          receivers: account.receivers.flatMap(findChildReceivers)
        }))
        .filter((account) => account.receivers.length > 0)
    )
  }, [child.id, messageReceivers])

  const onHide = useCallback(() => {
    navigate(-1)
  }, [navigate])

  return renderResult(receivers, (receivers) =>
    childGroupAccount !== undefined && receivers.length > 0 ? (
      <MessageEditor
        unitId={unitId}
        account={childGroupAccount.account}
        availableRecipients={receivers}
        draft={undefined}
        onClose={onHide}
      />
    ) : (
      <ContentArea
        opaque
        paddingVertical="zero"
        paddingHorizontal="zero"
        fullHeight={true}
        data-qa="messages-editor-content-area"
      >
        <TopBar title={i18n.messages.newMessage} unitId={unitId} />
        <PaddedContainer>
          {receivers.length === 0 ? (
            <span data-qa="info-no-receivers">{i18n.messages.noReceivers}</span>
          ) : (
            <span data-qa="no-account-access">
              {i18n.messages.noAccountAccess}
            </span>
          )}
        </PaddedContainer>
        <BackButtonInline
          onClick={() => navigate(-1)}
          icon={faArrowLeft}
          text={i18n.common.back}
        />
      </ContentArea>
    )
  )
})

export default React.memo(function MessageEditorPageWrapper({
  unitId
}: {
  unitId: UUID
}) {
  const { childId } = useRouteParams(['childId'])
  const { groupAccount } = useContext(MessageContext)
  const child = useChild(useQueryResult(childrenQuery(unitId)), childId)
  const childGroupAccount = useMemo(
    () => child.chain((c) => groupAccount(c.groupId)),
    [child, groupAccount]
  )
  return renderResult(
    combine(child, childGroupAccount),
    ([child, childGroupAccount]) => (
      <NewChildMessagePage
        unitId={unitId}
        childGroupAccount={childGroupAccount}
        child={child}
      />
    )
  )
})

const PaddedContainer = styled.div`
  padding: ${defaultMargins.m} ${defaultMargins.s};
`
