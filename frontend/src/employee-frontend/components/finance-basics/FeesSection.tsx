// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import { Loading, Result } from 'lib-common/api'
import LocalDate from 'lib-common/local-date'
import { formatCents } from 'lib-common/money'
import { useRestApi } from 'lib-common/utils/useRestApi'
import { AddButtonRow } from 'lib-components/atoms/buttons/AddButton'
import IconButton from 'lib-components/atoms/buttons/IconButton'
import ErrorSegment from 'lib-components/atoms/state/ErrorSegment'
import Spinner from 'lib-components/atoms/state/Spinner'
import { CollapsibleContentArea } from 'lib-components/layout/Container'
import { Table, Tbody, Th, Thead, Td, Tr } from 'lib-components/layout/Table'
import {
  FixedSpaceColumn,
  FixedSpaceRow
} from 'lib-components/layout/flex-helpers'
import ExpandingInfo from 'lib-components/molecules/ExpandingInfo'
import InfoModal from 'lib-components/molecules/modals/InfoModal'
import { H2, H3, H4, Label } from 'lib-components/typography'
import { defaultMargins } from 'lib-components/white-space'
import { faCopy, faPen, faQuestion } from 'lib-icons'
import { getFeeThresholds } from '../../api/finance-basics'
import { Translations, useTranslation } from '../../state/i18n'
import {
  familySizes,
  FeeThresholds,
  FeeThresholdsWithId
} from '../../types/finance-basics'
import { UnwrapResult } from '../async-rendering'
import StatusLabel from '../common/StatusLabel'
import FeeThresholdsEditor from './FeeThresholdsEditor'

export default React.memo(function FeesSection() {
  const { i18n } = useTranslation()

  const [open, setOpen] = useState(true)
  const toggleOpen = useCallback(() => setOpen((isOpen) => !isOpen), [setOpen])

  const [data, setData] = useState<Result<FeeThresholdsWithId[]>>(Loading.of())
  const loadData = useRestApi(getFeeThresholds, setData)
  useEffect(() => {
    void loadData()
  }, [loadData])

  const [modal, setModal] = useState<{
    type: 'editRetroactive' | 'saveRetroactive'
    resolve: () => void
    reject?: () => void
  }>()

  const toggleEditRetroactiveWarning = useCallback(
    (resolve: () => void) => {
      setModal({
        type: 'editRetroactive',
        resolve
      })
    },
    [setModal]
  )

  const toggleSaveRetroactiveWarning = useCallback(
    ({ resolve, reject }: { resolve: () => void; reject: () => void }) => {
      setModal({
        type: 'saveRetroactive',
        resolve,
        reject
      })
    },
    [setModal]
  )

  const [editorState, setEditorState] = useState<EditorState>({})
  const closeEditor = useCallback(() => setEditorState({}), [setEditorState])

  const lastThresholdsEndDate = useMemo(
    () =>
      data
        .map((ps) => ps[0]?.thresholds.validDuring.end ?? undefined)
        .getOrElse(undefined),
    [data]
  )

  const createNewThresholds = useCallback(
    () =>
      setEditorState({
        editing: 'new',
        form: emptyForm(lastThresholdsEndDate)
      }),
    [setEditorState, lastThresholdsEndDate]
  )

  const copyThresholds = useCallback(
    (item: FeeThresholds) =>
      setEditorState({
        editing: 'new',
        form: {
          ...copyForm(item),
          validFrom: lastThresholdsEndDate?.format() ?? '',
          validTo: ''
        }
      }),
    [setEditorState, lastThresholdsEndDate]
  )

  const editThresholds = useCallback(
    (id: string, item: FeeThresholds) =>
      setEditorState({ editing: id, form: copyForm(item) }),
    [setEditorState]
  )

  return (
    <CollapsibleContentArea
      opaque
      title={<H2 noMargin>{i18n.financeBasics.fees.title}</H2>}
      open={open}
      toggleOpen={toggleOpen}
      data-qa="fees-section"
    >
      <AddButtonRow
        onClick={createNewThresholds}
        text={i18n.financeBasics.fees.add}
        disabled={'editing' in editorState}
        data-qa="create-new-fee-thresholds"
      />
      {editorState.editing === 'new' ? (
        <FeeThresholdsEditor
          i18n={i18n}
          id={undefined}
          initialState={editorState.form}
          close={closeEditor}
          reloadData={loadData}
          toggleSaveRetroactiveWarning={toggleSaveRetroactiveWarning}
          existingThresholds={data}
        />
      ) : null}
      <UnwrapResult
        result={data}
        loading={() => <Spinner data-qa="fees-section-spinner" />}
        failure={() => <ErrorSegment title={i18n.common.error.unknown} />}
      >
        {(feeThresholdsList) => (
          <>
            {feeThresholdsList.map((feeThresholds, index) =>
              editorState.editing === feeThresholds.id ? (
                <FeeThresholdsEditor
                  key={feeThresholds.id}
                  i18n={i18n}
                  id={feeThresholds.id}
                  initialState={editorState.form}
                  close={closeEditor}
                  reloadData={loadData}
                  toggleSaveRetroactiveWarning={toggleSaveRetroactiveWarning}
                  existingThresholds={data}
                />
              ) : (
                <FeeThresholdsItem
                  key={feeThresholds.id}
                  i18n={i18n}
                  id={feeThresholds.id}
                  feeThresholds={feeThresholds.thresholds}
                  copyThresholds={copyThresholds}
                  editThresholds={editThresholds}
                  editing={!!editorState.editing}
                  toggleEditRetroactiveWarning={toggleEditRetroactiveWarning}
                  data-qa={`fee-thresholds-item-${index}`}
                />
              )
            )}
          </>
        )}
      </UnwrapResult>
      {modal ? (
        <InfoModal
          icon={faQuestion}
          iconColor="red"
          title={i18n.financeBasics.fees.modals[modal.type].title}
          text={i18n.financeBasics.fees.modals[modal.type].text}
          reject={{
            action: () => {
              setModal(undefined)
              modal.reject?.()
            },
            label: i18n.financeBasics.fees.modals[modal.type].reject
          }}
          resolve={{
            action: () => {
              setModal(undefined)
              modal.resolve()
            },
            label: i18n.financeBasics.fees.modals[modal.type].resolve
          }}
        />
      ) : null}
    </CollapsibleContentArea>
  )
})

const FeeThresholdsItem = React.memo(function FeeThresholdsItem({
  i18n,
  id,
  feeThresholds,
  copyThresholds,
  editThresholds,
  editing,
  toggleEditRetroactiveWarning,
  ...props
}: {
  i18n: Translations
  id: string
  feeThresholds: FeeThresholds
  copyThresholds: (feeThresholds: FeeThresholds) => void
  editThresholds: (id: string, feeThresholds: FeeThresholds) => void
  editing: boolean
  toggleEditRetroactiveWarning: (resolve: () => void) => void
  ['data-qa']: string
}) {
  return (
    <>
      <div className="separator large" />
      <div data-qa={props['data-qa']}>
        <TitleContainer>
          <H3>
            {i18n.financeBasics.fees.validDuring}{' '}
            <span data-qa="validDuring">
              {feeThresholds.validDuring.format()}
            </span>
          </H3>
          <FixedSpaceRow>
            <IconButton
              icon={faCopy}
              onClick={() => copyThresholds(feeThresholds)}
              disabled={editing}
              data-qa="copy"
            />
            <IconButton
              icon={faPen}
              onClick={() => {
                if (
                  feeThresholds.validDuring.start.isAfter(LocalDate.today())
                ) {
                  editThresholds(id, feeThresholds)
                } else {
                  toggleEditRetroactiveWarning(() =>
                    editThresholds(id, feeThresholds)
                  )
                }
              }}
              disabled={editing}
              data-qa="edit"
            />
            <StatusLabel dateRange={feeThresholds.validDuring} />
          </FixedSpaceRow>
        </TitleContainer>
        <H4>{i18n.financeBasics.fees.thresholds} </H4>
        <RowWithMargin spacing="XL">
          <FixedSpaceColumn>
            <Label>{i18n.financeBasics.fees.maxFee}</Label>
            <Indent data-qa="maxFee">
              {formatCents(feeThresholds.maxFee)} €
            </Indent>
          </FixedSpaceColumn>
          <FixedSpaceColumn>
            <Label>{i18n.financeBasics.fees.minFee}</Label>
            <Indent data-qa="minFee">
              {formatCents(feeThresholds.minFee)} €
            </Indent>
          </FixedSpaceColumn>
        </RowWithMargin>
        <TableWithMargin>
          <Thead>
            <Tr>
              <Th>{i18n.financeBasics.fees.familySize}</Th>
              <Th>{i18n.financeBasics.fees.minThreshold}</Th>
              <Th>{i18n.financeBasics.fees.multiplier}</Th>
              <Th>{i18n.financeBasics.fees.maxThreshold}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {familySizes.map((n) => {
              return (
                <Tr key={n}>
                  <Td>{n}</Td>
                  <Td data-qa={`minIncomeThreshold${n}`}>
                    {formatCents(feeThresholds[`minIncomeThreshold${n}`])} €
                  </Td>
                  <Td data-qa={`incomeMultiplier${n}`}>
                    {feeThresholds[`incomeMultiplier${n}`] * 100} %
                  </Td>
                  <Td data-qa={`maxIncomeThreshold${n}`}>
                    {formatCents(feeThresholds[`maxIncomeThreshold${n}`])} €
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </TableWithMargin>
        <ColumnWithMargin>
          <ExpandingInfo
            info={i18n.financeBasics.fees.thresholdIncreaseInfo}
            ariaLabel={i18n.common.openExpandingInfo}
          >
            <Label>{i18n.financeBasics.fees.thresholdIncrease}</Label>
          </ExpandingInfo>
          <Indent data-qa="incomeThresholdIncrease6Plus">
            {formatCents(feeThresholds.incomeThresholdIncrease6Plus)} €
          </Indent>
        </ColumnWithMargin>
        <H4>{i18n.financeBasics.fees.siblingDiscounts}</H4>
        <RowWithMargin spacing="XL">
          <FixedSpaceColumn>
            <Label>{i18n.financeBasics.fees.siblingDiscount2}</Label>
            <Indent data-qa="siblingDiscount2">
              {feeThresholds.siblingDiscount2 * 100} %
            </Indent>
          </FixedSpaceColumn>
          <FixedSpaceColumn>
            <Label>{i18n.financeBasics.fees.siblingDiscount2Plus}</Label>
            <Indent data-qa="siblingDiscount2Plus">
              {feeThresholds.siblingDiscount2Plus * 100} %
            </Indent>
          </FixedSpaceColumn>
        </RowWithMargin>
      </div>
    </>
  )
})

const TitleContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`

const TableWithMargin = styled(Table)`
  margin: ${defaultMargins.m} 0;
`

const ColumnWithMargin = styled(FixedSpaceColumn)`
  margin: ${defaultMargins.s} 0;
`

const RowWithMargin = styled(FixedSpaceRow)`
  margin: ${defaultMargins.s} 0;
`

const Indent = styled.span`
  margin-left: ${defaultMargins.s};
`

type EditorState =
  | Record<string, never>
  | {
      editing: string
      form: FormState
    }

export type FormState = {
  [k in keyof Omit<FeeThresholds, 'validDuring'>]: string
} & {
  validFrom: string
  validTo: string
}

const emptyForm = (latestEndDate?: LocalDate): FormState => ({
  validFrom: latestEndDate?.addDays(1).format() ?? '',
  validTo: '',
  maxFee: '',
  minFee: '',
  minIncomeThreshold2: '',
  minIncomeThreshold3: '',
  minIncomeThreshold4: '',
  minIncomeThreshold5: '',
  minIncomeThreshold6: '',
  maxIncomeThreshold2: '',
  maxIncomeThreshold3: '',
  maxIncomeThreshold4: '',
  maxIncomeThreshold5: '',
  maxIncomeThreshold6: '',
  incomeMultiplier2: '',
  incomeMultiplier3: '',
  incomeMultiplier4: '',
  incomeMultiplier5: '',
  incomeMultiplier6: '',
  incomeThresholdIncrease6Plus: '',
  siblingDiscount2: '',
  siblingDiscount2Plus: ''
})

const formatMulti = (multi: number) =>
  (multi * 100).toString().replace('.', ',')

const copyForm = (feeThresholds: FeeThresholds): FormState => ({
  validFrom: feeThresholds.validDuring.start.format() ?? '',
  validTo: feeThresholds.validDuring.end?.format() ?? '',
  maxFee: formatCents(feeThresholds.maxFee) ?? '',
  minFee: formatCents(feeThresholds.minFee) ?? '',
  minIncomeThreshold2: formatCents(feeThresholds.minIncomeThreshold2) ?? '',
  minIncomeThreshold3: formatCents(feeThresholds.minIncomeThreshold3) ?? '',
  minIncomeThreshold4: formatCents(feeThresholds.minIncomeThreshold4) ?? '',
  minIncomeThreshold5: formatCents(feeThresholds.minIncomeThreshold5) ?? '',
  minIncomeThreshold6: formatCents(feeThresholds.minIncomeThreshold6) ?? '',
  maxIncomeThreshold2: formatCents(feeThresholds.maxIncomeThreshold2) ?? '',
  maxIncomeThreshold3: formatCents(feeThresholds.maxIncomeThreshold3) ?? '',
  maxIncomeThreshold4: formatCents(feeThresholds.maxIncomeThreshold4) ?? '',
  maxIncomeThreshold5: formatCents(feeThresholds.maxIncomeThreshold5) ?? '',
  maxIncomeThreshold6: formatCents(feeThresholds.maxIncomeThreshold6) ?? '',
  incomeMultiplier2: formatMulti(feeThresholds.incomeMultiplier2),
  incomeMultiplier3: formatMulti(feeThresholds.incomeMultiplier3),
  incomeMultiplier4: formatMulti(feeThresholds.incomeMultiplier4),
  incomeMultiplier5: formatMulti(feeThresholds.incomeMultiplier5),
  incomeMultiplier6: formatMulti(feeThresholds.incomeMultiplier6),
  incomeThresholdIncrease6Plus:
    formatCents(feeThresholds.incomeThresholdIncrease6Plus) ?? '',
  siblingDiscount2: formatMulti(feeThresholds.siblingDiscount2),
  siblingDiscount2Plus: formatMulti(feeThresholds.siblingDiscount2Plus)
})
