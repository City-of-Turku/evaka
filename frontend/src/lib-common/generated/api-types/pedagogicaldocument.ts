// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

// GENERATED FILE: no manual modifications
/* eslint-disable import/order, prettier/prettier, @typescript-eslint/no-namespace, @typescript-eslint/no-redundant-type-constituents */

import HelsinkiDateTime from '../../helsinki-date-time'
import { JsonOf } from '../../json'
import { UUID } from '../../types'

/**
* Generated from fi.espoo.evaka.pedagogicaldocument.Attachment
*/
export interface Attachment {
  contentType: string
  id: UUID
  name: string
}

/**
* Generated from fi.espoo.evaka.pedagogicaldocument.PedagogicalDocument
*/
export interface PedagogicalDocument {
  attachments: Attachment[]
  childId: UUID
  created: HelsinkiDateTime
  description: string
  id: UUID
  updated: HelsinkiDateTime
}

/**
* Generated from fi.espoo.evaka.pedagogicaldocument.PedagogicalDocumentCitizen
*/
export interface PedagogicalDocumentCitizen {
  attachments: Attachment[]
  childId: UUID
  created: HelsinkiDateTime
  description: string
  id: UUID
  isRead: boolean
}

/**
* Generated from fi.espoo.evaka.pedagogicaldocument.PedagogicalDocumentPostBody
*/
export interface PedagogicalDocumentPostBody {
  childId: UUID
  description: string
}


export function deserializeJsonPedagogicalDocument(json: JsonOf<PedagogicalDocument>): PedagogicalDocument {
  return {
    ...json,
    created: HelsinkiDateTime.parseIso(json.created),
    updated: HelsinkiDateTime.parseIso(json.updated)
  }
}


export function deserializeJsonPedagogicalDocumentCitizen(json: JsonOf<PedagogicalDocumentCitizen>): PedagogicalDocumentCitizen {
  return {
    ...json,
    created: HelsinkiDateTime.parseIso(json.created)
  }
}
