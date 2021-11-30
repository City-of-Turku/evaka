// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later
import { Page } from 'playwright'
import { RawElementDEPRECATED, RawTextInput } from '../../utils/element'

export class EmployeePinPage {
  constructor(private readonly page: Page) {}

  readonly pinInput = new RawTextInput(this.page, '[data-qa="pin-code-input"]')
  readonly inputInfo = new RawElementDEPRECATED(
    this.page,
    '[data-qa="pin-code-input-info"]'
  )
  readonly pinLockedAlertBox = new RawElementDEPRECATED(
    this.page,
    '[data-qa="pin-locked-alert-box"]'
  )

  readonly pinSendButton = new RawElementDEPRECATED(
    this.page,
    '[data-qa="send-pin-button"]'
  )
}
