// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { Page } from '../../utils/page'

export default class MessageEditorPage {
  constructor(private readonly page: Page) {}

  noReceiversInfo = this.page.findByDataQa('info-no-receivers')
}
