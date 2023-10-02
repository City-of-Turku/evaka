// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { waitUntilTrue } from '../../utils'
import { Element, Page, TextInput, TreeDropdown } from '../../utils/page'

export default class CitizenMessagesPage {
  constructor(private readonly page: Page) {}

  replyButtonTag = 'message-reply-editor-btn'

  #messageReplyContent = new TextInput(
    this.page.find('[data-qa="message-reply-content"]')
  )
  #threadListItem = this.page.find('[data-qa="thread-list-item"]')
  #threadTitle = this.page.find('[data-qa="thread-reader-title"]')
  #inboxEmpty = this.page.find('[data-qa="inbox-empty"][data-loading="false"]')
  #threadContent = this.page.findAll('[data-qa="thread-reader-content"]')
  #threadUrgent = this.page.findByDataQa('thread-reader').findByDataQa('urgent')
  #openReplyEditorButton = this.page.find(`[data-qa="${this.replyButtonTag}"]`)
  #sendReplyButton = this.page.find('[data-qa="message-send-btn"]')
  newMessageButton = this.page.findAllByDataQa('new-message-btn').first()
  #messageEditor = this.page.findByDataQa('message-editor')

  discardMessageButton = this.page.find('[data-qa="message-discard-btn"]')

  async createNewMessage(): Promise<CitizenMessageEditor> {
    await this.newMessageButton.click()
    const editor = new CitizenMessageEditor(this.#messageEditor)
    await editor.waitUntilVisible()
    return editor
  }

  async getMessageCount() {
    return this.#threadContent.count()
  }

  async assertInboxIsEmpty() {
    await this.#inboxEmpty.waitUntilVisible()
  }

  async assertThreadContent(message: {
    title: string
    content: string
    urgent?: boolean
  }) {
    await this.#threadListItem.click()
    await this.#threadTitle.assertTextEquals(message.title)
    await this.#threadContent.only().assertTextEquals(message.content)
    if (message.urgent ?? false) {
      await this.#threadUrgent.waitUntilVisible()
    } else {
      await this.#threadUrgent.waitUntilHidden()
    }
  }

  getThreadAttachmentCount(): Promise<number> {
    return this.page.findAll('[data-qa="attachment"]').count()
  }

  async openFirstThread() {
    await this.#threadListItem.click()
  }

  async openFirstThreadReplyEditor() {
    await this.#threadListItem.click()
    await this.#openReplyEditorButton.click()
  }

  async discardReplyEditor() {
    await this.discardMessageButton.click()
  }

  async fillReplyContent(content: string) {
    await this.#messageReplyContent.fill(content)
  }

  async assertReplyContentIsEmpty() {
    return this.#messageReplyContent.assertTextEquals('')
  }

  async replyToFirstThread(content: string) {
    await this.#threadListItem.click()
    await this.#openReplyEditorButton.click()
    await this.#messageReplyContent.fill(content)
    await this.#sendReplyButton.click()
    // the content is cleared and the button is disabled once the reply has been sent
    await waitUntilTrue(() => this.#sendReplyButton.disabled)
  }

  async deleteFirstThread() {
    await this.#threadListItem.findByDataQa('delete-thread-btn').click()
  }

  async confirmThreadDeletion() {
    await this.page.findByDataQa('modal').findByDataQa('modal-okBtn').click()
  }

  async sendNewMessage(
    title: string,
    content: string,
    childIds: string[],
    recipients: string[]
  ) {
    const editor = await this.createNewMessage()
    if (childIds.length > 0) {
      await editor.selectChildren(childIds)
    }
    await editor.selectRecipients(recipients)
    await editor.fillMessage(title, content)
    await editor.sendMessage()
  }
}

export class CitizenMessageEditor extends Element {
  readonly #receiverSelection = new TreeDropdown(
    this.find('[data-qa="select-receiver"]')
  )
  readonly title = new TextInput(this.findByDataQa('input-title'))
  readonly content = new TextInput(this.findByDataQa('input-content'))
  readonly #sendMessage = this.findByDataQa('send-message-btn')

  secondaryRecipient(name: string) {
    return this.find(`[data-qa="secondary-recipient"]`, { hasText: name })
  }

  async selectChildren(childIds: string[]) {
    for (const childId of childIds) {
      await this.findByDataQa(`child-${childId}`).click()
    }
  }
  async assertChildrenSelectable(childIds: string[]) {
    for (const childId of childIds) {
      await this.findByDataQa(`child-${childId}`).waitUntilVisible()
    }

    await this.findAllByDataQa('relevant-child').assertCount(childIds.length)
  }

  async selectRecipients(recipients: string[]) {
    await this.#receiverSelection.click()
    for (const recipient of recipients) {
      await this.#receiverSelection.findTextExact(recipient).click()
    }
    await this.#receiverSelection.click()
  }

  async fillMessage(title: string, content: string) {
    await this.title.fill(title)
    await this.content.fill(content)
  }

  async sendMessage() {
    await this.#sendMessage.click()
    await this.waitUntilHidden()
  }
}
