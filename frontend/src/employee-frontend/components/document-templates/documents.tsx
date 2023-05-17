// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'

import { string } from 'lib-common/form/fields'
import { array, mapped, object, union } from 'lib-common/form/form'
import { BoundForm, useFormUnion } from 'lib-common/form/hooks'
import { StateOf } from 'lib-common/form/types'
import {
  DocumentContent,
  DocumentTemplateContent,
  Question
} from 'lib-common/generated/api-types/document'

import CheckboxGroupQuestionDescriptor from './question-descriptors/CheckboxGroupQuestionDescriptor'
import CheckboxQuestionDescriptor from './question-descriptors/CheckboxQuestionDescriptor'
import TextQuestionDescriptor from './question-descriptors/TextQuestionDescriptor'

export const documentQuestionForm = union({
  TEXT: TextQuestionDescriptor.document.form,
  CHECKBOX: CheckboxQuestionDescriptor.document.form,
  CHECKBOX_GROUP: CheckboxGroupQuestionDescriptor.document.form
})

export const documentSectionForm = mapped(
  object({
    id: string(),
    label: string(),
    questions: array(documentQuestionForm)
  }),
  (output): DocumentContent => ({
    answers: output.questions.map((it) => it.value)
  })
)

export const documentForm = mapped(
  array(documentSectionForm),
  (output): DocumentContent => ({
    answers: output.flatMap((section) => section.answers)
  })
)

export const DocumentQuestionView = React.memo(function DocumentQuestionView({
  bind,
  readOnly
}: {
  bind: BoundForm<typeof documentQuestionForm>
  readOnly: boolean
}) {
  const { branch, form } = useFormUnion(bind)

  switch (branch) {
    case 'TEXT':
      return (
        <TextQuestionDescriptor.document.Component
          bind={form}
          readOnly={readOnly}
        />
      )
    case 'CHECKBOX':
      return (
        <CheckboxQuestionDescriptor.document.Component
          bind={form}
          readOnly={readOnly}
        />
      )
    case 'CHECKBOX_GROUP':
      return (
        <CheckboxGroupQuestionDescriptor.document.Component
          bind={form}
          readOnly={readOnly}
        />
      )
  }
})

export const getDocumentQuestionInitialState = (question: Question) => {
  switch (question.type) {
    case 'TEXT':
      return TextQuestionDescriptor.document.getInitialState(question)
    case 'CHECKBOX':
      return CheckboxQuestionDescriptor.document.getInitialState(question)
    case 'CHECKBOX_GROUP':
      return CheckboxGroupQuestionDescriptor.document.getInitialState(question)
  }
}

export const getDocumentFormInitialState = (
  templateContent: DocumentTemplateContent
): StateOf<typeof documentForm> =>
  templateContent.sections.map((section) => ({
    id: section.id,
    label: section.label,
    questions: section.questions.map(getDocumentQuestionInitialState)
  }))
