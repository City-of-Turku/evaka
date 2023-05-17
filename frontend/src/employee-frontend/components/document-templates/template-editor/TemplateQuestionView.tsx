// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { faArrowDown, faArrowUp, faPen, faTrash } from 'Icons'
import React, { useState } from 'react'
import styled from 'styled-components'

import { BoundForm } from 'lib-common/form/hooks'
import IconButton from 'lib-components/atoms/buttons/IconButton'
import { FixedSpaceRow } from 'lib-components/layout/flex-helpers'
import colors from 'lib-customizations/common'

import { useTranslation } from '../../../state/i18n'
import { templateQuestionForm, TemplateQuestionPreview } from '../templates'

import TemplateQuestionModal from './TemplateQuestionModal'

const Wrapper = styled.div<{ $readOnly: boolean }>`
  .question-actions {
    display: none;
  }

  border-style: dashed;
  border-width: 1px;
  border-color: transparent;
  &:hover {
    border-color: ${(p) =>
      p.$readOnly ? 'transparent' : colors.grayscale.g35};
    ${(p) => (p.$readOnly ? '' : `border: ${colors.grayscale.g35} 1px dashed;`)}

    .question-actions {
      display: flex;
    }
  }
`

interface Props {
  bind: BoundForm<typeof templateQuestionForm>
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  first: boolean
  last: boolean
  readOnly: boolean
}

export default React.memo(function TemplateQuestionView({
  bind,
  onMoveUp,
  onMoveDown,
  onDelete,
  first,
  last,
  readOnly
}: Props) {
  const { i18n } = useTranslation()
  const [editing, setEditing] = useState(false)

  return (
    <Wrapper $readOnly={readOnly}>
      <FixedSpaceRow justifyContent="space-between" alignItems="start">
        <TemplateQuestionPreview bind={bind} />

        {!readOnly && (
          <FixedSpaceRow className="question-actions">
            <IconButton
              icon={faPen}
              aria-label={i18n.common.edit}
              onClick={() => setEditing(true)}
            />
            <IconButton
              icon={faArrowUp}
              aria-label={i18n.documentTemplates.templateEditor.moveUp}
              disabled={first}
              onClick={onMoveUp}
            />
            <IconButton
              icon={faArrowDown}
              aria-label={i18n.documentTemplates.templateEditor.moveDown}
              disabled={last}
              onClick={onMoveDown}
            />
            <IconButton
              icon={faTrash}
              aria-label={i18n.common.remove}
              onClick={onDelete}
            />
          </FixedSpaceRow>
        )}
        {editing && (
          <TemplateQuestionModal
            initialState={bind.state}
            onSave={(q) => {
              bind.set(q)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        )}
      </FixedSpaceRow>
    </Wrapper>
  )
})
