// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useEffect } from 'react'
import styled from 'styled-components'

import Footer from 'citizen-frontend/Footer'
import { renderResult } from 'citizen-frontend/async-rendering'
import { useTranslation } from 'citizen-frontend/localization'
import { useBoolean, useForm } from 'lib-common/form/hooks'
import { ChildDocumentCitizenDetails } from 'lib-common/generated/api-types/document'
import { ChildDocumentId } from 'lib-common/generated/api-types/shared'
import { useMutation, useQueryResult } from 'lib-common/query'
import { useIdRouteParam } from 'lib-common/useRouteParams'
import { Button } from 'lib-components/atoms/buttons/Button'
import { MutateButton } from 'lib-components/atoms/buttons/MutateButton'
import ReturnButton from 'lib-components/atoms/buttons/ReturnButton'
import { tabletMin } from 'lib-components/breakpoints'
import { ChildDocumentStateChip } from 'lib-components/document-templates/ChildDocumentStateChip'
import DocumentView from 'lib-components/document-templates/DocumentView'
import {
  documentForm,
  getDocumentFormInitialState
} from 'lib-components/document-templates/documents'
import Content, {
  Container,
  ContentArea
} from 'lib-components/layout/Container'
import {
  AlignRight,
  FixedSpaceColumn,
  FixedSpaceRow
} from 'lib-components/layout/flex-helpers'
import { H1, H2, Label } from 'lib-components/typography'
import { defaultMargins, Gap } from 'lib-components/white-space'
import { faArrowDownToLine, faPrint } from 'lib-icons'

import { downloadChildDocument } from '../generated/api-clients/document'

import {
  childDocumentDetailsQuery,
  childDocumentReadMutation,
  updateChildDocumentMutation
} from './queries'

const TopButtonRow = styled(FixedSpaceRow)`
  @media (max-width: ${tabletMin}) {
    margin-right: ${defaultMargins.s};
  }

  @media print {
    display: none;
  }
`

export default React.memo(function ChildDocumentPage() {
  const id = useIdRouteParam<ChildDocumentId>('id')

  const childDocument = useQueryResult(
    childDocumentDetailsQuery({ documentId: id })
  )
  const i18n = useTranslation()

  return (
    <>
      <Content>
        <Gap size="s" />
        <TopButtonRow justifyContent="space-between">
          <ReturnButton label={i18n.common.return} />
          <FixedSpaceRow>
            <Button
              appearance="inline"
              onClick={() => window.print()}
              icon={faPrint}
              text={i18n.common.print}
            />
            {childDocument.map((d) => d.downloadable).getOrElse(false) && (
              <Button
                appearance="inline"
                icon={faArrowDownToLine}
                text={i18n.common.download}
                onClick={() => {
                  window.open(
                    downloadChildDocument({ documentId: id }).url.toString(),
                    '_blank',
                    'noopener,noreferrer'
                  )
                }}
              />
            )}
          </FixedSpaceRow>
        </TopButtonRow>
        <Gap size="s" />

        {renderResult(childDocument, (document) => (
          <ChildDocumentView document={document} />
        ))}

        <Gap size="s" />
      </Content>
      <Footer />
    </>
  )
})

const ChildDocumentView = React.memo(function ChildDocumentView({
  document
}: {
  document: ChildDocumentCitizenDetails
}) {
  const i18n = useTranslation()

  const { mutateAsync: markRead } = useMutation(childDocumentReadMutation)
  useEffect(() => {
    void markRead({ documentId: document.id })
  }, [markRead, document.id])

  const bind = useForm(
    documentForm,
    () =>
      getDocumentFormInitialState(document.template.content, document.content),
    i18n.validationErrors
  )

  const [readOnly, { on: readOnlyOn, off: readOnlyOff }] = useBoolean(true)

  return (
    <>
      <Container>
        <ContentArea opaque>
          <FixedSpaceRow justifyContent="space-between">
            <FixedSpaceColumn>
              <H1 noMargin>{document.template.name}</H1>
              <H2 noMargin translate="no">
                {document.child.firstName} {document.child.lastName}
                {document.child.dateOfBirth
                  ? ` (${document.child.dateOfBirth.format()})`
                  : ''}
              </H2>
            </FixedSpaceColumn>
            <FixedSpaceColumn spacing="xs">
              <ChildDocumentStateChip status={document.status} />
              {document.template.confidentiality !== null && (
                <Label>{i18n.children.childDocuments.confidential}</Label>
              )}
              <span>{document.template.legalBasis}</span>
            </FixedSpaceColumn>
          </FixedSpaceRow>
          <Gap />
          <DocumentView bind={bind} readOnly={readOnly} />
        </ContentArea>
      </Container>
      <Gap size="m" />
      <FixedSpaceRow
        justifyContent="space-between"
        alignItems="center"
        gap={defaultMargins.m}
      >
        <ReturnButton label={i18n.common.return} data-qa="return-button" />
        {document.status === 'CITIZEN_DRAFT' && (
          <>
            {readOnly && (
              <Button
                text={i18n.common.edit}
                onClick={readOnlyOff}
                data-qa="edit-button"
              />
            )}
            <AlignRight>
              {readOnly ? (
                <MutateButton
                  mutation={updateChildDocumentMutation}
                  onClick={() => ({
                    documentId: document.id,
                    body: {
                      status: 'COMPLETED' as const,
                      content: bind.value()
                    }
                  })}
                  text={i18n.children.childDocuments.send}
                  primary
                  disabled={!bind.isValid()}
                  data-qa="send-button"
                />
              ) : (
                <Button
                  text={i18n.children.childDocuments.preview}
                  onClick={readOnlyOn}
                  primary
                  data-qa="preview-button"
                />
              )}
            </AlignRight>
          </>
        )}
      </FixedSpaceRow>
    </>
  )
})
