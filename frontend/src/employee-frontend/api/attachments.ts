// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { Failure, Result, Success } from 'lib-common/api'
import { UUID } from 'lib-common/types'
import { client } from './client'
import { AttachmentType } from 'lib-common/generated/enums'

export async function saveAttachment(
  applicationId: UUID,
  file: File,
  type: AttachmentType,
  onUploadProgress: (progressEvent: ProgressEvent) => void
): Promise<Result<UUID>> {
  const formData = new FormData()
  formData.append('file', file)

  try {
    const { data } = await client.post<UUID>(
      `/attachments/applications/${applicationId}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { type },
        onUploadProgress
      }
    )
    return Success.of(data)
  } catch (e) {
    return Failure.fromError(e)
  }
}

export const deleteAttachment = (id: UUID): Promise<Result<void>> =>
  client
    .delete(`/attachments/${id}`)
    .then(() => Success.of(void 0))
    .catch((e) => Failure.fromError(e))
