// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { faReply } from '@fortawesome/free-solid-svg-icons'
import React, {
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import styled, { css } from 'styled-components'
import { useLocation } from 'wouter'

import { useBoolean } from 'lib-common/form/hooks'
import type {
  ChildMessageAccountAccess,
  CitizenMessageThread,
  Message,
  MessageAccount,
  MessageAccountWithPresence
} from 'lib-common/generated/api-types/messaging'
import type { MessageAccountId } from 'lib-common/generated/api-types/shared'
import { scrollRefIntoView } from 'lib-common/utils/scrolling'
import { NotificationsContext } from 'lib-components/Notifications'
import { StaticChip } from 'lib-components/atoms/Chip'
import HorizontalLine from 'lib-components/atoms/HorizontalLine'
import Linkify from 'lib-components/atoms/Linkify'
import { ScreenReaderOnly } from 'lib-components/atoms/ScreenReaderOnly'
import { Button } from 'lib-components/atoms/buttons/Button'
import { MutateButton } from 'lib-components/atoms/buttons/MutateButton'
import { desktopMin } from 'lib-components/breakpoints'
import {
  FixedSpaceColumn,
  FixedSpaceFlexWrap,
  FixedSpaceRow
} from 'lib-components/layout/flex-helpers'
import {
  Desktop,
  MobileAndTablet
} from 'lib-components/layout/responsive-layout'
import { MessageCharacteristics } from 'lib-components/messages/MessageCharacteristics'
import MessageReplyEditor from 'lib-components/messages/MessageReplyEditor'
import { ThreadContainer } from 'lib-components/messages/ThreadListItem'
import FileDownloadButton from 'lib-components/molecules/FileDownloadButton'
import { PersonName } from 'lib-components/molecules/PersonNames'
import { ScreenReaderButton } from 'lib-components/molecules/ScreenReaderButton'
import { fontWeights, H2, InformationText } from 'lib-components/typography'
import { useRecipients } from 'lib-components/utils/useReplyRecipients'
import { defaultMargins, Gap } from 'lib-components/white-space'
import colors, { theme } from 'lib-customizations/common'
import { faTrash, faEnvelope } from 'lib-icons'

import { getAttachmentUrl } from '../attachments/attachments'
import type { Translations } from '../localization'
import { useTranslation } from '../localization'

import { ConfirmDeleteThread } from './ConfirmDeleteThread'
import {
  markLastReceivedMessageInThreadUnreadMutation,
  replyToThreadMutation
} from './queries'
import { MessageContext } from './state'
import { isPrimaryRecipient } from './utils'

const TitleRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;

  & + & {
    margin-top: ${defaultMargins.L};
  }
`

export const ThreadTitleRow = styled.div`
  background-color: ${colors.grayscale.g0};
  max-height: 215px; // fits roughly 5 rows of heading text with the chip and paddings
  overflow: auto;

  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${defaultMargins.xs};
  padding: ${defaultMargins.s};

  @media screen and (min-width: ${desktopMin}) {
    flex-direction: row-reverse;
    gap: ${defaultMargins.s};
    padding: ${defaultMargins.L};
  }

  margin: ${defaultMargins.xxs};

  & + & {
    margin-top: ${defaultMargins.L};
  }
`

const MessageList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`

const SenderName = styled.div`
  font-weight: ${fontWeights.semibold};
`

const MessageContent = styled.div`
  padding-top: ${defaultMargins.s};
  white-space: pre-line;
  word-break: break-word;
`

const ActionRow = styled(FixedSpaceRow)`
  margin: 0 28px 0 28px;
`

const messageContainerStyles = css`
  background-color: ${colors.grayscale.g0};
  padding: ${defaultMargins.s};

  @media (min-width: ${desktopMin}) {
    padding: ${defaultMargins.L};
  }

  margin: ${defaultMargins.xxs} ${defaultMargins.xxs} ${defaultMargins.s}
    ${defaultMargins.xxs};
`

export const MessageContainer = styled.li`
  ${messageContainerStyles}
  h2 {
    margin: 0;
  }
`

const StyledReplyEditorContainer = styled.div`
  ${messageContainerStyles}
`

const ReplyEditorContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function ReplyEditorContainer(props, ref) {
  return <StyledReplyEditorContainer ref={ref} {...props} />
})

const formatMessageAccountName = (
  account: MessageAccount,
  i18n: Translations
) =>
  account.type === 'GROUP'
    ? `${account.name} (${i18n.messages.staffAnnotation})`
    : account.name

const SingleMessage = React.memo(
  React.forwardRef(function SingleMessage(
    {
      message
    }: {
      message: Message
    },
    ref: React.ForwardedRef<HTMLLIElement>
  ) {
    const i18n = useTranslation()
    return (
      <MessageContainer tabIndex={-1} ref={ref}>
        <TitleRow>
          <SenderName translate="no">
            <ScreenReaderOnly>{i18n.messages.thread.sender}: </ScreenReaderOnly>
            {formatMessageAccountName(message.sender, i18n)}
          </SenderName>
          <InformationText>
            <ScreenReaderOnly>{i18n.messages.thread.sentAt}:</ScreenReaderOnly>
            <time dateTime={message.sentAt.formatIso()}>
              {message.sentAt.toLocalDate().format()}
            </time>
          </InformationText>
        </TitleRow>
        <InformationText translate="no">
          <ScreenReaderOnly>
            {i18n.messages.thread.recipients}:
          </ScreenReaderOnly>
          {(message.recipientNames
            ? message.recipientNames
            : message.recipients.map((r) => formatMessageAccountName(r, i18n))
          ).join(', ')}
        </InformationText>
        <MessageContent data-qa="thread-reader-content">
          <Linkify text={message.content} />
        </MessageContent>
        {message.attachments.length > 0 && (
          <>
            <HorizontalLine slim />
            <FixedSpaceColumn spacing="xs">
              {message.attachments.map((attachment) => (
                <FileDownloadButton
                  key={attachment.id}
                  file={attachment}
                  getFileUrl={getAttachmentUrl}
                  icon
                  data-qa="attachment"
                />
              ))}
            </FixedSpaceColumn>
          </>
        )}
      </MessageContainer>
    )
  })
)

interface Props {
  accountId: MessageAccountId
  thread: CitizenMessageThread.Regular
  allowedAccounts: ChildMessageAccountAccess[]
  accountDetails: MessageAccountWithPresence[]
  closeThread: () => void
  onThreadDeleted: () => void
}

export interface ThreadViewApi {
  focusThreadTitle: () => void
}

export default React.memo(
  React.forwardRef<ThreadViewApi, Props>(function ThreadView(
    {
      accountId,
      thread: {
        id: threadId,
        messages,
        title,
        messageType,
        urgent,
        sensitive,
        children,
        applicationStatus
      },
      allowedAccounts,
      accountDetails,
      closeThread,
      onThreadDeleted
    }: Props,
    ref
  ) {
    const i18n = useTranslation()
    const [, navigate] = useLocation()
    const { setReplyContent, getReplyContent } = useContext(MessageContext)
    const { addTimedNotification } = useContext(NotificationsContext)

    const { onToggleRecipient, recipients } = useRecipients(
      messages,
      accountId,
      accountDetails
    )
    const [replyEditorVisible, useReplyEditorVisible] = useBoolean(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const hideReplyEditor = useReplyEditorVisible.off
    useEffect(() => hideReplyEditor(), [hideReplyEditor, threadId])

    const autoScrollRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
      scrollRefIntoView(autoScrollRef, undefined, 'end')
    }, [replyEditorVisible])

    const titleRowRef = useRef<HTMLDivElement>(null)

    const focusThreadTitle = () => {
      titleRowRef.current?.focus()
    }

    useEffect(() => {
      focusThreadTitle()
    }, [threadId])

    useImperativeHandle(ref, () => ({
      focusThreadTitle
    }))

    const lastMessageRef = useRef<HTMLLIElement>(null)

    const onUpdateContent = useCallback(
      (content: string) => setReplyContent(threadId, content),
      [setReplyContent, threadId]
    )

    const onDiscard = useCallback(() => {
      setReplyContent(threadId, '')
      hideReplyEditor()
    }, [setReplyContent, hideReplyEditor, threadId])

    const replyContent = getReplyContent(threadId)
    const sendEnabled =
      !!replyContent &&
      recipients.some((r) => r.selected && isPrimaryRecipient(r))

    const allowReply = useMemo(() => {
      if (applicationStatus) {
        return !['REJECTED', 'ACTIVE', 'CANCELLED'].includes(applicationStatus)
      }

      const allowedReplyAccounts = new Set(
        children.flatMap(
          (c) =>
            allowedAccounts.find((a) => a.childId === c.childId)?.reply ?? []
        )
      )
      allowedAccounts
        .filter((a) => a.childId === null)
        .forEach((a) => a.reply.forEach((am) => allowedReplyAccounts.add(am)))
      return recipients.every((r) => allowedReplyAccounts.has(r.id))
    }, [allowedAccounts, applicationStatus, children, recipients])

    const hasReceivedMessages = useMemo(() => {
      return messages.some((m) => m.sender.type !== 'CITIZEN')
    }, [messages])

    return (
      <ThreadContainer data-qa="thread-reader">
        <ThreadTitleRow tabIndex={-1} ref={titleRowRef}>
          <FixedSpaceFlexWrap>
            <MessageCharacteristics type={messageType} urgent={urgent} />
            {children.length > 0 ? (
              <>
                <ScreenReaderOnly>
                  {i18n.messages.thread.children}:
                </ScreenReaderOnly>
                {children.map((child) => (
                  <StaticChip
                    data-qa="thread-child"
                    key={child.childId}
                    color={theme.colors.main.m2}
                  >
                    <PersonName person={child} format="FirstFirst" />
                  </StaticChip>
                ))}
              </>
            ) : null}
          </FixedSpaceFlexWrap>
          <H2 noMargin data-qa="thread-reader-title">
            <ScreenReaderOnly>{i18n.messages.thread.title}:</ScreenReaderOnly>
            {title}
            {sensitive && ` (${i18n.messages.sensitive})`}
          </H2>
          <ScreenReaderButton
            data-qa="jump-to-end"
            onClick={() => lastMessageRef.current?.focus()}
            text={i18n.messages.thread.jumpToLastMessage}
          />
        </ThreadTitleRow>
        <Gap size="s" />
        <MessageList>
          {messages.map((message, i) => (
            <SingleMessage
              key={message.id}
              message={message}
              ref={i === messages.length - 1 ? lastMessageRef : undefined}
            />
          ))}
        </MessageList>
        {replyEditorVisible ? (
          <ReplyEditorContainer ref={autoScrollRef}>
            <MessageReplyEditor
              mutation={replyToThreadMutation}
              onSubmit={() => ({
                messageId: messages.slice(-1)[0].id,
                body: {
                  content: replyContent,
                  recipientAccountIds: recipients
                    .filter((r) => r.selected)
                    .map((r) => r.id)
                }
              })}
              onUpdateContent={onUpdateContent}
              onDiscard={onDiscard}
              onSuccess={() => {
                hideReplyEditor()
                addTimedNotification({
                  children: i18n.messages.messageEditor.messageSentNotification,
                  dataQa: 'message-sent-notification'
                })
              }}
              recipients={recipients}
              onToggleRecipient={onToggleRecipient}
              replyContent={replyContent}
              sendEnabled={sendEnabled}
              messageThreadSensitive={sensitive}
            />
          </ReplyEditorContainer>
        ) : (
          messages.length > 0 && (
            <>
              <Gap size="s" />
              <MobileAndTablet data-qa="message-thread-actions-mobile">
                <FixedSpaceColumn alignItems="center">
                  {messageType === 'MESSAGE' && allowReply ? (
                    <Button
                      appearance="button"
                      primary
                      onClick={useReplyEditorVisible.on}
                      data-qa="message-reply-editor-btn"
                      text={i18n.messages.thread.reply}
                    />
                  ) : (
                    <div data-qa="message-reply-editor-btn-hidden" />
                  )}
                  <ScreenReaderButton
                    onClick={focusThreadTitle}
                    text={i18n.messages.thread.jumpToBeginning}
                  />
                  <ScreenReaderButton
                    onClick={closeThread}
                    text={i18n.messages.thread.close}
                  />
                  {hasReceivedMessages && (
                    <MutateButton
                      appearance="inline"
                      icon={faEnvelope}
                      text={i18n.messages.markUnread}
                      data-qa="mark-unread-btn"
                      mutation={markLastReceivedMessageInThreadUnreadMutation}
                      onClick={() => ({ threadId })}
                      onSuccess={() => navigate('/messages')}
                    />
                  )}
                  <Button
                    appearance="inline"
                    icon={faTrash}
                    data-qa="delete-thread-btn"
                    className="delete-btn"
                    onClick={() => setConfirmDelete(true)}
                    text={i18n.messages.deleteThread}
                  />
                </FixedSpaceColumn>
              </MobileAndTablet>
              <Desktop data-qa="message-thread-actions-desktop">
                <ActionRow justifyContent="space-between">
                  {messageType === 'MESSAGE' && allowReply ? (
                    <Button
                      appearance="inline"
                      icon={faReply}
                      onClick={useReplyEditorVisible.on}
                      data-qa="message-reply-editor-btn"
                      text={i18n.messages.thread.reply}
                    />
                  ) : (
                    <div data-qa="message-reply-editor-btn-hidden" />
                  )}
                  <ScreenReaderButton
                    onClick={focusThreadTitle}
                    text={i18n.messages.thread.jumpToBeginning}
                  />
                  <ScreenReaderButton
                    onClick={closeThread}
                    text={i18n.messages.thread.close}
                  />
                  <FixedSpaceRow>
                    {hasReceivedMessages && (
                      <MutateButton
                        appearance="inline"
                        icon={faEnvelope}
                        text={i18n.messages.markUnread}
                        data-qa="mark-unread-btn"
                        mutation={markLastReceivedMessageInThreadUnreadMutation}
                        onClick={() => ({ threadId })}
                        onSuccess={() => navigate('/messages')}
                      />
                    )}
                    <Button
                      appearance="inline"
                      icon={faTrash}
                      data-qa="delete-thread-btn"
                      className="delete-btn"
                      onClick={() => setConfirmDelete(true)}
                      text={i18n.messages.deleteThread}
                    />
                  </FixedSpaceRow>
                </ActionRow>
              </Desktop>
              <Gap size="m" />
            </>
          )
        )}
        {confirmDelete && (
          <ConfirmDeleteThread
            threadId={threadId}
            onClose={() => setConfirmDelete(false)}
            onSuccess={() => {
              setConfirmDelete(false)
              onThreadDeleted()
            }}
          />
        )}
      </ThreadContainer>
    )
  })
)
