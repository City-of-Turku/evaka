// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { differenceInSeconds } from 'date-fns'
import React, { useCallback, useContext, useEffect, useState } from 'react'

import { wrapResult } from 'lib-common/api'
import HelsinkiDateTime from 'lib-common/helsinki-date-time'
import { Button } from 'lib-components/atoms/buttons/Button'
import { FixedSpaceColumn } from 'lib-components/layout/flex-helpers'
import { faRedo } from 'lib-icons'

import { undoMessage, undoReply } from '../../generated/api-clients/messaging'
import { useTranslation } from '../../state/i18n'

import { CancelableMessage, MessageContext } from './MessageContext'

const undoMessageResult = wrapResult(undoMessage)
const undoReplyResult = wrapResult(undoReply)

export const UndoMessage = React.memo(function UndoMessageToast({
  message,
  close
}: {
  message: CancelableMessage
  close: () => void
}) {
  const { i18n } = useTranslation()
  const { refreshMessages, selectThread } = useContext(MessageContext)
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    getSecondsLeft(message.sentAt)
  )
  const [cancelling, setCancelling] = useState(false)

  const cancelMessage = useCallback(() => {
    if (!message) {
      return
    }

    const request =
      'contentId' in message
        ? undoMessageResult({
            accountId: message.accountId,
            contentId: message.contentId
          })
        : undoReplyResult({
            accountId: message.accountId,
            messageId: message.messageId
          })

    setCancelling(true)
    void request
      .then((result) => {
        if (result.isSuccess) {
          close()
          refreshMessages(message.accountId)
          if ('contentId' in message) {
            selectThread(undefined)
          }
        }
      })
      .finally(() => setCancelling(false))
  }, [close, message, refreshMessages, selectThread])

  useEffect(() => {
    const timeoutId = setTimeout(
      () => (secondsLeft > 0 ? setSecondsLeft(secondsLeft - 1) : close()),
      1000
    )
    return () => clearTimeout(timeoutId)
  }, [close, secondsLeft])

  return (
    <FixedSpaceColumn spacing="xs">
      <div>{i18n.messages.undo.info}</div>
      <Button
        appearance="inline"
        icon={faRedo}
        text={`${i18n.common.cancel} (${i18n.messages.undo.secondsLeft(
          secondsLeft
        )})`}
        onClick={cancelMessage}
        disabled={cancelling}
        data-qa="cancel-message"
      />
    </FixedSpaceColumn>
  )
})

function getSecondsLeft(sentAt: HelsinkiDateTime) {
  return differenceInSeconds(
    sentAt.addSeconds(11).toSystemTzDate(),
    HelsinkiDateTime.now().toSystemTzDate()
  )
}
