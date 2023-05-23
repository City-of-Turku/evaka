// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'

import { string } from 'lib-common/form/fields'
import { array, mapped, object, union, validated } from 'lib-common/form/form'
import { BoundForm, useFormUnion } from 'lib-common/form/hooks'
import { StateOf } from 'lib-common/form/types'
import { nonEmpty } from 'lib-common/form/validators'
import {
  DocumentTemplateContent,
  Question
} from 'lib-common/generated/api-types/document'

import CheckboxGroupQuestionDescriptor from './question-descriptors/CheckboxGroupQuestionDescriptor'
import CheckboxQuestionDescriptor from './question-descriptors/CheckboxQuestionDescriptor'
import RadioButtonGroupQuestionDescriptor from './question-descriptors/RadioButtonGroupQuestionDescriptor'
import TextQuestionDescriptor from './question-descriptors/TextQuestionDescriptor'
import { QuestionType } from './question-descriptors/types'

export const templateQuestionForm = mapped(
  union({
    TEXT: TextQuestionDescriptor.template.form,
    CHECKBOX: CheckboxQuestionDescriptor.template.form,
    CHECKBOX_GROUP: CheckboxGroupQuestionDescriptor.template.form,
    RADIO_BUTTON_GROUP: RadioButtonGroupQuestionDescriptor.template.form
  }),
  (output): Question => {
    switch (output.branch) {
      case 'TEXT':
        return {
          type: output.branch,
          ...output.value
        }
      case 'CHECKBOX':
        return {
          type: output.branch,
          ...output.value
        }
      case 'CHECKBOX_GROUP':
        return {
          type: output.branch,
          ...output.value
        }
      case 'RADIO_BUTTON_GROUP':
        return {
          type: output.branch,
          ...output.value
        }
    }
  }
)

export const templateSectionForm = object({
  id: validated(string(), nonEmpty),
  label: validated(string(), nonEmpty),
  questions: array(templateQuestionForm)
})

export const templateContentForm = object({
  sections: array(templateSectionForm)
})

export const TemplateQuestionConfigView = React.memo(
  function TemplateQuestionConfigView({
    bind
  }: {
    bind: BoundForm<typeof templateQuestionForm>
  }) {
    const { branch, form } = useFormUnion(bind)

    switch (branch) {
      case 'TEXT':
        return <TextQuestionDescriptor.template.Component bind={form} />
      case 'CHECKBOX':
        return <CheckboxQuestionDescriptor.template.Component bind={form} />
      case 'CHECKBOX_GROUP':
        return (
          <CheckboxGroupQuestionDescriptor.template.Component bind={form} />
        )
      case 'RADIO_BUTTON_GROUP':
        return (
          <RadioButtonGroupQuestionDescriptor.template.Component bind={form} />
        )
    }
  }
)

export const TemplateQuestionPreview = React.memo(
  function TemplateQuestionPreview({
    bind
  }: {
    bind: BoundForm<typeof templateQuestionForm>
  }) {
    const { branch, form } = useFormUnion(bind)

    switch (branch) {
      case 'TEXT':
        return <TextQuestionDescriptor.template.PreviewComponent bind={form} />
      case 'CHECKBOX':
        return (
          <CheckboxQuestionDescriptor.template.PreviewComponent bind={form} />
        )
      case 'CHECKBOX_GROUP':
        return (
          <CheckboxGroupQuestionDescriptor.template.PreviewComponent
            bind={form}
          />
        )
      case 'RADIO_BUTTON_GROUP':
        return (
          <RadioButtonGroupQuestionDescriptor.template.PreviewComponent
            bind={form}
          />
        )
    }
  }
)

export const getTemplateQuestionInitialState = (question: Question) => {
  switch (question.type) {
    case 'TEXT':
      return TextQuestionDescriptor.template.getInitialState(question)
    case 'CHECKBOX':
      return CheckboxQuestionDescriptor.template.getInitialState(question)
    case 'CHECKBOX_GROUP':
      return CheckboxGroupQuestionDescriptor.template.getInitialState(question)
    case 'RADIO_BUTTON_GROUP':
      return RadioButtonGroupQuestionDescriptor.template.getInitialState(
        question
      )
  }
}

export const getTemplateQuestionInitialStateByType = (type: QuestionType) => {
  switch (type) {
    case 'TEXT':
      return TextQuestionDescriptor.template.getInitialState()
    case 'CHECKBOX':
      return CheckboxQuestionDescriptor.template.getInitialState()
    case 'CHECKBOX_GROUP':
      return CheckboxGroupQuestionDescriptor.template.getInitialState()
    case 'RADIO_BUTTON_GROUP':
      return RadioButtonGroupQuestionDescriptor.template.getInitialState()
  }
}

export const getTemplateFormInitialState = (
  template: DocumentTemplateContent
): StateOf<typeof templateContentForm> => ({
  sections: template.sections.map((section) => ({
    id: section.id,
    label: section.label,
    questions: section.questions.map(getTemplateQuestionInitialState)
  }))
})