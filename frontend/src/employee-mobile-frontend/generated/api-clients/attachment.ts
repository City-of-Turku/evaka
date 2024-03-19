// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

// GENERATED FILE: no manual modifications

import { JsonOf } from 'lib-common/json'
import { UUID } from 'lib-common/types'
import { client } from '../../client'
import { uri } from 'lib-common/uri'


/**
* Generated from fi.espoo.evaka.attachment.AttachmentsController.deleteAttachmentHandler
*/
export async function deleteAttachmentHandler(
  request: {
    attachmentId: UUID
  }
): Promise<void> {
  const { data: json } = await client.request<JsonOf<void>>({
    url: uri`/attachments/${request.attachmentId}`.toString(),
    method: 'DELETE'
  })
  return json
}
