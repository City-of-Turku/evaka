// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useCallback, useContext } from 'react'

import { formatDateOrTime } from 'lib-common/date'
import { MessageThread } from 'lib-common/generated/api-types/messaging'
import HelsinkiDateTime from 'lib-common/helsinki-date-time'
import { useMutation, usePagedInfiniteQueryResult } from 'lib-common/query'
import { UUID } from 'lib-common/types'
import { OnEnterView } from 'lib-components/OnEnterView'
import HorizontalLine from 'lib-components/atoms/HorizontalLine'
import { SpinnerSegment } from 'lib-components/atoms/state/Spinner'
import { FixedSpaceColumn } from 'lib-components/layout/flex-helpers'
import EmptyMessageFolder from 'lib-components/messages/EmptyMessageFolder'
import { MessageCharacteristics } from 'lib-components/messages/MessageCharacteristics'
import {
  Container,
  Header,
  TitleAndDate,
  Truncated
} from 'lib-components/messages/ThreadListItem'
import colors from 'lib-customizations/common'

import { renderResult } from '../async-rendering'
import { useTranslation } from '../common/i18n'

import { markThreadReadMutation, receivedMessagesQuery } from './queries'
import { MessageContext } from './state'

interface Props {
  onSelectThread: (threadId: UUID) => void
}

export default React.memo(function ReceivedThreadsList({
  onSelectThread
}: Props) {
  const { i18n } = useTranslation()
  const { groupAccounts, selectedAccount } = useContext(MessageContext)

  const {
    data: threads,
    hasNextPage,
    fetchNextPage,
    transform
  } = usePagedInfiniteQueryResult(
    receivedMessagesQuery(selectedAccount?.account.id ?? ''),
    {
      enabled: selectedAccount !== undefined
    }
  )

  const { mutate: markThreadRead } = useMutation(markThreadReadMutation)

  const selectThread = useCallback(
    (thread: MessageThread) => {
      onSelectThread(thread.id)

      if (!selectedAccount) throw new Error('Should never happen')
      const { id: accountId } = selectedAccount.account

      const hasUnreadMessages = thread.messages.some(
        (m) => !m.readAt && m.sender.id !== accountId
      )
      if (hasUnreadMessages) {
        markThreadRead({ accountId, id: thread.id })
        transform((t) => markMatchingThreadRead(t, thread.id))
      }
    },
    [markThreadRead, onSelectThread, selectedAccount, transform]
  )

  return renderResult(threads, (threads, isReloading) =>
    threads.length > 0 ? (
      <div>
        {threads.map((thread) => (
          <MessagePreview
            key={thread.id}
            thread={thread}
            hasUnreadMessages={thread.messages.some(
              (item) =>
                !item.readAt &&
                item.sender.id !== selectedAccount?.account.id &&
                !groupAccounts.some((ga) => ga.account.id === item.sender.id)
            )}
            onClick={() => selectThread(thread)}
          />
        ))}
        {hasNextPage && (
          <>
            <OnEnterView onEnter={fetchNextPage} />
            <HorizontalLine />
            <SpinnerSegment />
          </>
        )}
      </div>
    ) : (
      <EmptyMessageFolder
        loading={isReloading}
        iconColor={colors.grayscale.g35}
        text={i18n.messages.emptyInbox}
      />
    )
  )
})

const markMatchingThreadRead = (t: MessageThread, id: UUID): MessageThread =>
  t.id === id
    ? {
        ...t,
        messages: t.messages.map((m) => ({
          ...m,
          readAt: m.readAt ?? HelsinkiDateTime.now()
        }))
      }
    : t

const MessagePreview = React.memo(function MessagePreview({
  thread,
  hasUnreadMessages,
  onClick
}: {
  thread: MessageThread
  hasUnreadMessages: boolean
  onClick: () => void
}) {
  const lastMessage = thread.messages[thread.messages.length - 1]
  const participants = [...new Set(thread.messages.map((t) => t.sender.name))]
  return (
    <Container
      isRead={!hasUnreadMessages}
      active={false}
      data-qa="message-preview"
      onClick={onClick}
    >
      <FixedSpaceColumn>
        <Header isRead={!hasUnreadMessages}>
          <Truncated data-qa="message-participants">
            {participants.join(', ')}
          </Truncated>
          <MessageCharacteristics
            type={thread.type}
            urgent={thread.urgent}
            sensitive={false}
          />
        </Header>
        <TitleAndDate isRead={!hasUnreadMessages}>
          <Truncated data-qa="message-preview-title">{thread.title}</Truncated>
          <span>{formatDateOrTime(lastMessage.sentAt)}</span>
        </TitleAndDate>
        <Truncated>
          {lastMessage.content
            .substring(0, 200)
            .replace(new RegExp('\\n', 'g'), ' ')}
        </Truncated>
      </FixedSpaceColumn>
    </Container>
  )
})
