// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import add from 'lodash/add'
import mergeWith from 'lodash/mergeWith'
import sortBy from 'lodash/sortBy'
import React, { useMemo, useState } from 'react'
import { Link } from 'react-router'
import styled from 'styled-components'

import {
  DaycareAssistanceLevel,
  OtherAssistanceMeasureType,
  PreschoolAssistanceLevel
} from 'lib-common/generated/api-types/assistance'
import { AssistanceActionOption } from 'lib-common/generated/api-types/assistanceaction'
import {
  AssistanceNeedsAndActionsReport,
  AssistanceNeedsAndActionsReportByChild,
  AssistanceNeedsAndActionsReportRow,
  AssistanceNeedsAndActionsReportRowByChild
} from 'lib-common/generated/api-types/reports'
import LocalDate from 'lib-common/local-date'
import { constantQuery, useQueryResult } from 'lib-common/query'
import Title from 'lib-components/atoms/Title'
import ReturnButton from 'lib-components/atoms/buttons/ReturnButton'
import Combobox from 'lib-components/atoms/dropdowns/Combobox'
import Checkbox from 'lib-components/atoms/form/Checkbox'
import MultiSelect from 'lib-components/atoms/form/MultiSelect'
import { Container, ContentArea } from 'lib-components/layout/Container'
import { Tbody, Td, Th, Thead, Tr } from 'lib-components/layout/Table'
import DatePicker from 'lib-components/molecules/date-picker/DatePicker'
import {
  daycareAssistanceLevels,
  featureFlags,
  otherAssistanceMeasureTypes,
  preschoolAssistanceLevels
} from 'lib-customizations/employee'
import { faChevronDown, faChevronUp } from 'lib-icons'

import ReportDownload from '../../components/reports/ReportDownload'
import { areasQuery } from '../../queries'
import { useTranslation } from '../../state/i18n'
import { reducePropertySum } from '../../utils'
import { renderResult } from '../async-rendering'
import { daycaresQuery } from '../unit/queries'

import { FilterLabel, FilterRow, TableFooter, TableScrollable } from './common'
import {
  assistanceNeedsAndActionsReportByChildQuery,
  assistanceNeedsAndActionsReportQuery,
  permittedReportsQuery
} from './queries'

type AssistanceNeedsAndActionsReportFilters = {
  date: LocalDate | null
  daycareAssistanceLevels: DaycareAssistanceLevel[]
  preschoolAssistanceLevels: PreschoolAssistanceLevel[]
  otherAssistanceMeasureTypes: OtherAssistanceMeasureType[]
}

const types = ['DAYCARE', 'PRESCHOOL'] as const
type Type = (typeof types)[number]

type GroupingType = 'NO_GROUPING' | 'AREA' | 'UNIT'

const daycareColumns = [
  ...daycareAssistanceLevels,
  ...otherAssistanceMeasureTypes
]
const preschoolColumns = [
  ...preschoolAssistanceLevels,
  ...otherAssistanceMeasureTypes
]

interface RowFilters {
  careArea: string
  unit: string
  showZeroRows: boolean
}

const emptyRowFilters: RowFilters = {
  careArea: '',
  unit: '',
  showZeroRows: true
}

interface ColumnFilters {
  type: Type
}

const emptyColumnFilters: ColumnFilters = {
  type: 'DAYCARE'
}

const Wrapper = styled.div`
  width: 100%;
`

const rowFilter =
  (
    filters: AssistanceNeedsAndActionsReportFilters,
    rowFilters: RowFilters,
    columnFilters: ColumnFilters
  ) =>
  (
    row:
      | AssistanceNeedsAndActionsReportRow
      | AssistanceNeedsAndActionsReportRowByChild
  ): boolean =>
    !(rowFilters.careArea && row.careAreaName !== rowFilters.careArea) &&
    !(rowFilters.unit && row.unitName !== rowFilters.unit) &&
    (rowFilters.showZeroRows ||
      (columnFilters.type === 'DAYCARE' &&
        Object.entries(row.daycareAssistanceCounts)
          .filter(
            ([level]) =>
              filters.daycareAssistanceLevels.length === 0 ||
              filters.daycareAssistanceLevels.includes(
                level as DaycareAssistanceLevel
              )
          )
          .some(([_, count]) => count > 0)) ||
      (columnFilters.type === 'PRESCHOOL' &&
        Object.entries(row.preschoolAssistanceCounts)
          .filter(
            ([level]) =>
              filters.preschoolAssistanceLevels.length === 0 ||
              filters.preschoolAssistanceLevels.includes(
                level as PreschoolAssistanceLevel
              )
          )
          .some(([_, count]) => count > 0)) ||
      Object.entries(row.otherAssistanceMeasureCounts)
        .filter(
          ([type]) =>
            filters.otherAssistanceMeasureTypes.length === 0 ||
            filters.otherAssistanceMeasureTypes.includes(
              type as OtherAssistanceMeasureType
            )
        )
        .some(([_, count]) => count > 0))

interface GroupingDataByGroup {
  name: string
  rows: AssistanceNeedsAndActionsReportRow[]
  daycareAssistanceCounts: Record<DaycareAssistanceLevel, number>
  preschoolAssistanceCounts: Record<PreschoolAssistanceLevel, number>
  otherAssistanceMeasureCounts: Record<OtherAssistanceMeasureType, number>
  actionCounts: Record<string, number>
  otherActionCount: number
  noActionCount: number
  assistanceNeedVoucherCoefficientCount: number
}

const emptyGroupingDataByGroup = (
  name: string,
  actions: AssistanceActionOption[]
): GroupingDataByGroup => ({
  name,
  rows: [],
  daycareAssistanceCounts: {
    GENERAL_SUPPORT: 0,
    GENERAL_SUPPORT_WITH_DECISION: 0,
    INTENSIFIED_SUPPORT: 0,
    SPECIAL_SUPPORT: 0
  },
  preschoolAssistanceCounts: {
    INTENSIFIED_SUPPORT: 0,
    SPECIAL_SUPPORT: 0,
    SPECIAL_SUPPORT_WITH_DECISION_LEVEL_1: 0,
    SPECIAL_SUPPORT_WITH_DECISION_LEVEL_2: 0
  },
  otherAssistanceMeasureCounts: {
    ACCULTURATION_SUPPORT: 0,
    ANOMALOUS_EDUCATION_START: 0,
    TRANSPORT_BENEFIT: 0,
    CHILD_DISCUSSION_OFFERED: 0,
    CHILD_DISCUSSION_HELD: 0,
    CHILD_DISCUSSION_COUNSELING: 0
  },
  actionCounts: actions.reduce(
    (data, action) => ({
      ...data,
      [action.value]: 0
    }),
    {}
  ),
  otherActionCount: 0,
  noActionCount: 0,
  assistanceNeedVoucherCoefficientCount: 0
})

interface GroupingDataByChild {
  name: string
  rows: AssistanceNeedsAndActionsReportRowByChild[]
  daycareAssistanceCounts: Record<DaycareAssistanceLevel, number>
  preschoolAssistanceCounts: Record<PreschoolAssistanceLevel, number>
  otherAssistanceMeasureCounts: Record<OtherAssistanceMeasureType, number>
}

const emptyGroupingDataByChild = (name: string): GroupingDataByChild => ({
  name,
  rows: [],
  daycareAssistanceCounts: {
    GENERAL_SUPPORT: 0,
    GENERAL_SUPPORT_WITH_DECISION: 0,
    INTENSIFIED_SUPPORT: 0,
    SPECIAL_SUPPORT: 0
  },
  preschoolAssistanceCounts: {
    INTENSIFIED_SUPPORT: 0,
    SPECIAL_SUPPORT: 0,
    SPECIAL_SUPPORT_WITH_DECISION_LEVEL_1: 0,
    SPECIAL_SUPPORT_WITH_DECISION_LEVEL_2: 0
  },
  otherAssistanceMeasureCounts: {
    ACCULTURATION_SUPPORT: 0,
    ANOMALOUS_EDUCATION_START: 0,
    TRANSPORT_BENEFIT: 0,
    CHILD_DISCUSSION_OFFERED: 0,
    CHILD_DISCUSSION_HELD: 0,
    CHILD_DISCUSSION_COUNSELING: 0
  }
})

const resolveGroupingType = (
  rowFilters: RowFilters
): {
  type: GroupingType
  groupKeyFn: (
    row:
      | AssistanceNeedsAndActionsReportRow
      | AssistanceNeedsAndActionsReportRowByChild
  ) => string
  groupNameFn: (
    row:
      | AssistanceNeedsAndActionsReportRow
      | AssistanceNeedsAndActionsReportRowByChild
  ) => string
} => {
  if (rowFilters.unit !== '') {
    return {
      type: 'NO_GROUPING',
      groupKeyFn: () => '',
      groupNameFn: () => ''
    }
  } else if (rowFilters.careArea === '') {
    return {
      type: 'AREA',
      groupKeyFn: (row) => row.careAreaName,
      groupNameFn: (row) => row.careAreaName
    }
  } else {
    return {
      type: 'UNIT',
      groupKeyFn: (row) => row.unitId,
      groupNameFn: (row) => row.unitName
    }
  }
}

export default React.memo(function AssistanceNeedsAndActions() {
  const { i18n } = useTranslation()
  const permittedReports = useQueryResult(permittedReportsQuery())
  const [filters, setFilters] =
    useState<AssistanceNeedsAndActionsReportFilters>({
      date: LocalDate.todayInSystemTz(),
      daycareAssistanceLevels: [],
      preschoolAssistanceLevels: [],
      otherAssistanceMeasureTypes: []
    })
  const areasResult = useQueryResult(areasQuery())
  const sortedAreas = useMemo(
    () => areasResult.map((areas) => sortBy(areas, (area) => area.name)),
    [areasResult]
  )
  const unitsResult = useQueryResult(daycaresQuery({ includeClosed: true }))
  const sortedUnits = useMemo(
    () => unitsResult.map((units) => sortBy(units, (unit) => unit.name)),
    [unitsResult]
  )

  const [rowFilters, setRowFilters] = useState<RowFilters>(emptyRowFilters)
  const [columnFilters, setColumnFilters] =
    useState<ColumnFilters>(emptyColumnFilters)

  const selectedDaycareColumns = useMemo(
    () =>
      columnFilters.type === 'DAYCARE'
        ? filters.daycareAssistanceLevels.length === 0 &&
          filters.otherAssistanceMeasureTypes.length === 0
          ? daycareAssistanceLevels
          : daycareAssistanceLevels.filter((level) =>
              filters.daycareAssistanceLevels.includes(level)
            )
        : [],
    [
      columnFilters.type,
      filters.daycareAssistanceLevels,
      filters.otherAssistanceMeasureTypes.length
    ]
  )
  const selectedPreschoolColumns = useMemo(
    () =>
      columnFilters.type === 'PRESCHOOL'
        ? filters.preschoolAssistanceLevels.length === 0 &&
          filters.otherAssistanceMeasureTypes.length === 0
          ? preschoolAssistanceLevels
          : preschoolAssistanceLevels.filter((level) =>
              filters.preschoolAssistanceLevels.includes(level)
            )
        : [],
    [
      columnFilters.type,
      filters.preschoolAssistanceLevels,
      filters.otherAssistanceMeasureTypes.length
    ]
  )
  const selectedOtherColumns = useMemo(
    () =>
      ((columnFilters.type === 'DAYCARE' &&
        filters.daycareAssistanceLevels.length === 0) ||
        (columnFilters.type === 'PRESCHOOL' &&
          filters.preschoolAssistanceLevels.length === 0)) &&
      filters.otherAssistanceMeasureTypes.length === 0
        ? otherAssistanceMeasureTypes
        : otherAssistanceMeasureTypes.filter((level) =>
            filters.otherAssistanceMeasureTypes.includes(level)
          ),
    [
      columnFilters.type,
      filters.daycareAssistanceLevels.length,
      filters.otherAssistanceMeasureTypes,
      filters.preschoolAssistanceLevels.length
    ]
  )

  const daycareColumnTexts = {
    ...i18n.childInformation.assistance.types.daycareAssistanceLevel,
    ...i18n.childInformation.assistance.types.otherAssistanceMeasureType
  }
  const preschoolColumnTexts = {
    ...i18n.childInformation.assistance.types.preschoolAssistanceLevel,
    ...i18n.childInformation.assistance.types.otherAssistanceMeasureType
  }

  const reportByChildPermitted = permittedReports
    .map((permitted) =>
      permitted.includes('ASSISTANCE_NEEDS_AND_ACTIONS_BY_CHILD')
    )
    .getOrElse(false)
  const reportByChild =
    (rowFilters.careArea !== '' || rowFilters.unit !== '') &&
    reportByChildPermitted

  return (
    <Container>
      <ReturnButton label={i18n.common.goBack} />
      <ContentArea opaque>
        <Title size={1}>{i18n.reports.assistanceNeedsAndActions.title}</Title>
        <FilterRow>
          <FilterLabel>{i18n.reports.common.date}</FilterLabel>
          <DatePicker
            date={filters.date}
            onChange={(date) => {
              setFilters({ ...filters, date })
              setRowFilters(emptyRowFilters)
            }}
            locale="fi"
          />
        </FilterRow>

        <FilterRow>
          <FilterLabel>{i18n.reports.common.careAreaName}</FilterLabel>
          <Wrapper>
            {renderResult(sortedAreas, (areas) => (
              <Combobox
                items={[
                  { value: '', label: i18n.common.all },
                  ...areas.map((area) => ({
                    value: area.name,
                    label: area.name
                  }))
                ]}
                onChange={(option) =>
                  option
                    ? setRowFilters({
                        ...rowFilters,
                        careArea: option.value
                      })
                    : undefined
                }
                selectedItem={
                  rowFilters.careArea !== ''
                    ? {
                        label: rowFilters.careArea,
                        value: rowFilters.careArea
                      }
                    : {
                        label: i18n.common.all,
                        value: ''
                      }
                }
                placeholder={i18n.reports.occupancies.filters.areaPlaceholder}
                getItemLabel={(item) => item.label}
                data-qa="care-area-filter"
              />
            ))}
          </Wrapper>
        </FilterRow>

        <FilterRow>
          <FilterLabel>{i18n.reports.common.unitName}</FilterLabel>
          <Wrapper>
            {renderResult(sortedUnits, (units) => (
              <Combobox
                items={[
                  { value: '', label: i18n.common.all },
                  ...units.map((unit) => ({
                    value: unit.name,
                    label: unit.name
                  }))
                ]}
                onChange={(option) =>
                  option
                    ? setRowFilters({
                        ...rowFilters,
                        unit: option.value
                      })
                    : undefined
                }
                selectedItem={
                  rowFilters.unit !== ''
                    ? {
                        label: rowFilters.unit,
                        value: rowFilters.unit
                      }
                    : {
                        label: i18n.common.all,
                        value: ''
                      }
                }
                getItemLabel={(item) => item.label}
                data-qa="unit-filter"
              />
            ))}
          </Wrapper>
        </FilterRow>

        <FilterRow>
          <FilterLabel>
            {i18n.reports.assistanceNeedsAndActions.type}
          </FilterLabel>
          <Wrapper>
            <Combobox
              items={types}
              onChange={(option) =>
                option
                  ? setColumnFilters({
                      ...columnFilters,
                      type: option
                    })
                  : undefined
              }
              selectedItem={columnFilters.type}
              getItemLabel={(item) =>
                i18n.reports.assistanceNeedsAndActions.types[item]
              }
              data-qa="type-filter"
            />
          </Wrapper>
        </FilterRow>

        {columnFilters.type === 'DAYCARE' && (
          <FilterRow>
            <FilterLabel>
              {i18n.reports.assistanceNeedsAndActions.level}
            </FilterLabel>
            <Wrapper>
              <MultiSelect
                options={daycareColumns}
                onChange={(selectedItems) =>
                  setFilters({
                    ...filters,
                    daycareAssistanceLevels: selectedItems.filter(
                      (item): item is DaycareAssistanceLevel =>
                        daycareAssistanceLevels.includes(
                          item as DaycareAssistanceLevel
                        )
                    ),
                    otherAssistanceMeasureTypes: selectedItems.filter(
                      (item): item is OtherAssistanceMeasureType =>
                        otherAssistanceMeasureTypes.includes(
                          item as OtherAssistanceMeasureType
                        )
                    )
                  })
                }
                value={[
                  ...filters.daycareAssistanceLevels,
                  ...filters.otherAssistanceMeasureTypes
                ]}
                getOptionId={(level) => level}
                getOptionLabel={(level) => daycareColumnTexts[level]}
                placeholder={i18n.common.all}
                data-qa="daycare-assistance-level-filter"
              />
            </Wrapper>
          </FilterRow>
        )}

        {columnFilters.type === 'PRESCHOOL' && (
          <FilterRow>
            <FilterLabel>
              {i18n.reports.assistanceNeedsAndActions.level}
            </FilterLabel>
            <Wrapper>
              <MultiSelect
                options={preschoolColumns}
                onChange={(selectedItems) =>
                  setFilters({
                    ...filters,
                    preschoolAssistanceLevels: selectedItems.filter(
                      (item): item is PreschoolAssistanceLevel =>
                        preschoolAssistanceLevels.includes(
                          item as PreschoolAssistanceLevel
                        )
                    ),
                    otherAssistanceMeasureTypes: selectedItems.filter(
                      (item): item is OtherAssistanceMeasureType =>
                        otherAssistanceMeasureTypes.includes(
                          item as OtherAssistanceMeasureType
                        )
                    )
                  })
                }
                value={[
                  ...filters.preschoolAssistanceLevels,
                  ...filters.otherAssistanceMeasureTypes
                ]}
                getOptionId={(level) => level}
                getOptionLabel={(level) => preschoolColumnTexts[level]}
                placeholder={i18n.common.all}
                data-qa="preschool-assistance-level-filter"
              />
            </Wrapper>
          </FilterRow>
        )}

        <FilterRow>
          <FilterLabel />
          <Wrapper>
            <Checkbox
              label={i18n.reports.assistanceNeedsAndActions.showZeroRows}
              checked={rowFilters.showZeroRows}
              onChange={(showZeroRows) =>
                setRowFilters({ ...rowFilters, showZeroRows })
              }
            />
          </Wrapper>
        </FilterRow>

        {!reportByChild ? (
          <ReportByGroup
            filters={filters}
            rowFilters={rowFilters}
            columnFilters={columnFilters}
            selectedDaycareColumns={selectedDaycareColumns}
            selectedPreschoolColumns={selectedPreschoolColumns}
            selectedOtherColumns={selectedOtherColumns}
          />
        ) : (
          <ReportByChild
            filters={filters}
            rowFilters={rowFilters}
            columnFilters={columnFilters}
            selectedDaycareColumns={selectedDaycareColumns}
            selectedPreschoolColumns={selectedPreschoolColumns}
            selectedOtherColumns={selectedOtherColumns}
          />
        )}
      </ContentArea>
    </Container>
  )
})

const ReportByGroup = (props: {
  filters: AssistanceNeedsAndActionsReportFilters
  rowFilters: RowFilters
  columnFilters: ColumnFilters
  selectedDaycareColumns: DaycareAssistanceLevel[]
  selectedPreschoolColumns: PreschoolAssistanceLevel[]
  selectedOtherColumns: OtherAssistanceMeasureType[]
}) => {
  const result = useQueryResult(
    props.filters.date !== null
      ? assistanceNeedsAndActionsReportQuery({
          date: props.filters.date,
          daycareAssistanceLevels:
            props.columnFilters.type === 'DAYCARE'
              ? props.selectedDaycareColumns
              : undefined,
          preschoolAssistanceLevels:
            props.columnFilters.type === 'PRESCHOOL'
              ? props.selectedPreschoolColumns
              : undefined,
          otherAssistanceMeasureTypes: props.selectedOtherColumns
        })
      : constantQuery(null)
  )
  return (
    <>
      {renderResult(result, (report) =>
        report !== null ? (
          <ReportByGroupTable
            {...props}
            report={report}
            filename={`Lapsien tuentarpeet ja tukitoimet yksiköissä ${props.filters.date?.formatIso()}.csv`}
          />
        ) : null
      )}
    </>
  )
}

const ReportByGroupTable = ({
  filters,
  rowFilters,
  columnFilters,
  selectedDaycareColumns,
  selectedPreschoolColumns,
  selectedOtherColumns,
  report,
  filename
}: {
  filters: AssistanceNeedsAndActionsReportFilters
  rowFilters: RowFilters
  columnFilters: ColumnFilters
  selectedDaycareColumns: DaycareAssistanceLevel[]
  selectedPreschoolColumns: PreschoolAssistanceLevel[]
  selectedOtherColumns: OtherAssistanceMeasureType[]
  report: AssistanceNeedsAndActionsReport
  filename: string
}) => {
  const { i18n } = useTranslation()
  const [groupsOpen, setGroupsOpen] = useState<Record<string, boolean>>({})

  const { filteredRows, groupData, groupKeyFn } = useMemo(() => {
    const filteredRows = report.rows.filter(
      rowFilter(filters, rowFilters, columnFilters)
    )
    const { type, groupKeyFn, groupNameFn } = resolveGroupingType(rowFilters)
    const groupData = {
      type,
      data: filteredRows.reduce<Record<string, GroupingDataByGroup>>(
        (data, row) => {
          const key = groupKeyFn(row)
          const groupData =
            data[key] ??
            emptyGroupingDataByGroup(groupNameFn(row), report.actions)
          groupData.rows.push(row)
          data[key] = {
            ...groupData,
            daycareAssistanceCounts: mergeWith(
              groupData.daycareAssistanceCounts,
              row.daycareAssistanceCounts,
              add
            ),
            preschoolAssistanceCounts: mergeWith(
              groupData.preschoolAssistanceCounts,
              row.preschoolAssistanceCounts,
              add
            ),
            otherAssistanceMeasureCounts: mergeWith(
              groupData.otherAssistanceMeasureCounts,
              row.otherAssistanceMeasureCounts,
              add
            ),
            actionCounts: mergeWith(
              groupData.actionCounts,
              row.actionCounts,
              add
            ),
            otherActionCount: groupData.otherActionCount + row.otherActionCount,
            noActionCount: groupData.noActionCount + row.noActionCount,
            assistanceNeedVoucherCoefficientCount:
              groupData.assistanceNeedVoucherCoefficientCount +
              row.assistanceNeedVoucherCoefficientCount
          }
          return data
        },
        {}
      )
    }
    return {
      filteredRows,
      groupData,
      groupKeyFn
    }
  }, [report, filters, rowFilters, columnFilters])

  return (
    <>
      <ReportDownload
        data={filteredRows}
        columns={[
          {
            label: i18n.reports.common.careAreaName,
            value: (row) => row.careAreaName
          },
          {
            label: i18n.reports.common.unitName,
            value: (row) => row.unitName
          },
          {
            label: i18n.reports.common.groupName,
            value: (row) => row.groupName
          },
          ...selectedDaycareColumns.map((level) => ({
            label:
              i18n.childInformation.assistance.types.daycareAssistanceLevel[
                level
              ],
            value: (row: AssistanceNeedsAndActionsReportRow) =>
              row.daycareAssistanceCounts[level] ?? 0
          })),
          ...selectedPreschoolColumns.map((level) => ({
            label:
              i18n.childInformation.assistance.types.preschoolAssistanceLevel[
                level
              ],
            value: (row: AssistanceNeedsAndActionsReportRow) =>
              row.preschoolAssistanceCounts[level] ?? 0
          })),
          ...selectedOtherColumns.map((type) => ({
            label:
              i18n.childInformation.assistance.types.otherAssistanceMeasureType[
                type
              ],
            value: (row: AssistanceNeedsAndActionsReportRow) =>
              row.otherAssistanceMeasureCounts[type] ?? 0
          })),
          ...report.actions.map((action) => ({
            label: action.nameFi,
            value: (row: AssistanceNeedsAndActionsReportRow) =>
              row.actionCounts[action.value] ?? 0
          })),
          {
            label:
              i18n.childInformation.assistanceAction.fields.actionTypes.OTHER,
            value: (row) => row.otherActionCount,
            exclude: !featureFlags.assistanceActionOther
          },
          {
            label: i18n.reports.assistanceNeedsAndActions.actionMissing,
            value: (row) => row.noActionCount
          }
        ]}
        filename={filename}
      />
      <TableScrollable data-qa="assistance-needs-and-actions-table">
        <Thead>
          <Tr>
            {groupData.type !== 'NO_GROUPING' && (
              <Th>
                {
                  i18n.reports.assistanceNeedsAndActions.groupingTypes[
                    groupData.type
                  ]
                }
              </Th>
            )}
            <Th>{i18n.reports.common.groupName}</Th>
            {selectedDaycareColumns.map((level) => (
              <Th key={level}>
                {
                  i18n.childInformation.assistance.types.daycareAssistanceLevel[
                    level
                  ]
                }
              </Th>
            ))}
            {selectedPreschoolColumns.map((level) => (
              <Th key={level}>
                {
                  i18n.childInformation.assistance.types
                    .preschoolAssistanceLevel[level]
                }
              </Th>
            ))}
            {selectedOtherColumns.map((type) => (
              <Th key={type}>
                {
                  i18n.childInformation.assistance.types
                    .otherAssistanceMeasureType[type]
                }
              </Th>
            ))}
            {report.actions.map((action) => (
              <Th key={action.value}>{action.nameFi}</Th>
            ))}
            {featureFlags.assistanceActionOther && (
              <Th>
                {
                  i18n.childInformation.assistanceAction.fields.actionTypes
                    .OTHER
                }
              </Th>
            )}
            <Th>{i18n.reports.assistanceNeedsAndActions.actionMissing}</Th>
            {report.showAssistanceNeedVoucherCoefficient && (
              <Th>
                {
                  i18n.reports.assistanceNeedsAndActions
                    .assistanceNeedVoucherCoefficient
                }
              </Th>
            )}
          </Tr>
        </Thead>
        <Tbody>
          {Object.entries(groupData.data).map(([groupingKey, data]) => (
            <React.Fragment key={`${groupData.type}-${groupingKey}`}>
              {groupData.type !== 'NO_GROUPING' && (
                <Tr data-qa="assistance-needs-and-actions-row">
                  <Td>
                    <div
                      data-qa={`area-${data.name}`}
                      onClick={() =>
                        setGroupsOpen({
                          ...groupsOpen,
                          [groupingKey]: !(groupsOpen[groupingKey] ?? false)
                        })
                      }
                    >
                      <AccordionIcon
                        icon={
                          groupsOpen[groupingKey] ? faChevronUp : faChevronDown
                        }
                      />
                      {data.name}
                    </div>
                  </Td>
                  <Td />
                  {selectedDaycareColumns.map((level) => (
                    <Td key={level}>
                      {data.daycareAssistanceCounts[level] ?? 0}
                    </Td>
                  ))}
                  {selectedPreschoolColumns.map((level) => (
                    <Td key={level}>
                      {data.preschoolAssistanceCounts[level] ?? 0}
                    </Td>
                  ))}
                  {selectedOtherColumns.map((type) => (
                    <Td key={type}>
                      {data.otherAssistanceMeasureCounts[type] ?? 0}
                    </Td>
                  ))}
                  {report.actions.map((action) => (
                    <Td key={action.value}>
                      {data.actionCounts[action.value] ?? 0}
                    </Td>
                  ))}
                  {featureFlags.assistanceActionOther && (
                    <Td>{data.otherActionCount}</Td>
                  )}
                  <Td>{data.noActionCount}</Td>
                  {report.showAssistanceNeedVoucherCoefficient && (
                    <Td>{data.assistanceNeedVoucherCoefficientCount}</Td>
                  )}
                </Tr>
              )}
              {data.rows
                .filter(
                  (row) =>
                    groupData.type === 'NO_GROUPING' ||
                    groupsOpen[groupKeyFn(row)]
                )
                .map((row: AssistanceNeedsAndActionsReportRow) => (
                  <Tr key={`${row.unitId}:${row.groupId}`}>
                    {groupData.type !== 'NO_GROUPING' && (
                      <Td>
                        <Link to={`/units/${row.unitId}`}>{row.unitName}</Link>
                      </Td>
                    )}
                    <Td>{row.groupName}</Td>
                    {selectedDaycareColumns.map((level) => (
                      <Td key={level}>
                        {row.daycareAssistanceCounts[level] ?? 0}
                      </Td>
                    ))}
                    {selectedPreschoolColumns.map((level) => (
                      <Td key={level}>
                        {row.preschoolAssistanceCounts[level] ?? 0}
                      </Td>
                    ))}
                    {selectedOtherColumns.map((type) => (
                      <Td key={type}>
                        {row.otherAssistanceMeasureCounts[type] ?? 0}
                      </Td>
                    ))}
                    {report.actions.map((action) => (
                      <Td key={action.value}>
                        {row.actionCounts[action.value] ?? 0}
                      </Td>
                    ))}
                    {featureFlags.assistanceActionOther && (
                      <Td>{row.otherActionCount}</Td>
                    )}
                    <Td>{row.noActionCount}</Td>
                    {report.showAssistanceNeedVoucherCoefficient && (
                      <Td>{row.assistanceNeedVoucherCoefficientCount}</Td>
                    )}
                  </Tr>
                ))}
            </React.Fragment>
          ))}
        </Tbody>
        <TableFooter>
          <Tr>
            <Td className="bold">{i18n.reports.common.total}</Td>
            {groupData.type !== 'NO_GROUPING' && <Td />}
            {selectedDaycareColumns.map((level) => (
              <Td key={level}>
                {reducePropertySum(
                  filteredRows,
                  (r) => r.daycareAssistanceCounts[level] ?? 0
                )}
              </Td>
            ))}
            {selectedPreschoolColumns.map((level) => (
              <Td key={level}>
                {reducePropertySum(
                  filteredRows,
                  (r) => r.preschoolAssistanceCounts[level] ?? 0
                )}
              </Td>
            ))}
            {selectedOtherColumns.map((type) => (
              <Td key={type}>
                {reducePropertySum(
                  filteredRows,
                  (r) => r.otherAssistanceMeasureCounts[type] ?? 0
                )}
              </Td>
            ))}
            {report.actions.map((action) => (
              <Td key={action.value}>
                {reducePropertySum(
                  filteredRows,
                  (r) => r.actionCounts[action.value] ?? 0
                )}
              </Td>
            ))}
            {featureFlags.assistanceActionOther && (
              <Td>
                {reducePropertySum(filteredRows, (r) => r.otherActionCount)}
              </Td>
            )}
            <Td>{reducePropertySum(filteredRows, (r) => r.noActionCount)}</Td>
            {report.showAssistanceNeedVoucherCoefficient && (
              <Td>
                {reducePropertySum(
                  filteredRows,
                  (r) => r.assistanceNeedVoucherCoefficientCount
                )}
              </Td>
            )}
          </Tr>
        </TableFooter>
      </TableScrollable>
    </>
  )
}

const ReportByChild = (props: {
  filters: AssistanceNeedsAndActionsReportFilters
  rowFilters: RowFilters
  columnFilters: ColumnFilters
  selectedDaycareColumns: DaycareAssistanceLevel[]
  selectedPreschoolColumns: PreschoolAssistanceLevel[]
  selectedOtherColumns: OtherAssistanceMeasureType[]
}) => {
  const result = useQueryResult(
    props.filters.date !== null
      ? assistanceNeedsAndActionsReportByChildQuery({
          date: props.filters.date,
          daycareAssistanceLevels:
            props.columnFilters.type === 'DAYCARE'
              ? props.selectedDaycareColumns
              : undefined,
          preschoolAssistanceLevels:
            props.columnFilters.type === 'PRESCHOOL'
              ? props.selectedPreschoolColumns
              : undefined,
          otherAssistanceMeasureTypes: props.selectedOtherColumns
        })
      : constantQuery(null)
  )
  return (
    <>
      {renderResult(result, (report) =>
        report !== null ? (
          <ReportByChildTable
            {...props}
            report={report}
            filename={`Lapsien tuentarpeet ja tukitoimet yksiköissä ${props.filters.date?.formatIso()}.csv`}
          />
        ) : null
      )}
    </>
  )
}

const ReportByChildTable = ({
  filters,
  rowFilters,
  columnFilters,
  selectedDaycareColumns,
  selectedPreschoolColumns,
  selectedOtherColumns,
  report,
  filename
}: {
  filters: AssistanceNeedsAndActionsReportFilters
  rowFilters: RowFilters
  columnFilters: ColumnFilters
  selectedDaycareColumns: DaycareAssistanceLevel[]
  selectedPreschoolColumns: PreschoolAssistanceLevel[]
  selectedOtherColumns: OtherAssistanceMeasureType[]
  report: AssistanceNeedsAndActionsReportByChild
  filename: string
}) => {
  const { i18n } = useTranslation()
  const [groupsOpen, setGroupsOpen] = useState<Record<string, boolean>>({})

  const { filteredRows, groupData, groupKeyFn } = useMemo(() => {
    const filteredRows = report.rows.filter(
      rowFilter(filters, rowFilters, columnFilters)
    )
    const { type, groupKeyFn, groupNameFn } = resolveGroupingType(rowFilters)
    const groupData = {
      type,
      data: filteredRows.reduce<Record<string, GroupingDataByChild>>(
        (data, row) => {
          const key = groupKeyFn(row)
          const groupData =
            data[key] ?? emptyGroupingDataByChild(groupNameFn(row))
          groupData.rows.push(row)
          data[key] = {
            ...groupData,
            daycareAssistanceCounts: mergeWith(
              groupData.daycareAssistanceCounts,
              row.daycareAssistanceCounts,
              add
            ),
            preschoolAssistanceCounts: mergeWith(
              groupData.preschoolAssistanceCounts,
              row.preschoolAssistanceCounts,
              add
            ),
            otherAssistanceMeasureCounts: mergeWith(
              groupData.otherAssistanceMeasureCounts,
              row.otherAssistanceMeasureCounts,
              add
            )
          }
          return data
        },
        {}
      )
    }
    return {
      filteredRows,
      groupData,
      groupKeyFn
    }
  }, [report, filters, rowFilters, columnFilters])

  return (
    <>
      <ReportDownload
        data={filteredRows}
        columns={[
          {
            label: i18n.reports.common.careAreaName,
            value: (row) => row.careAreaName
          },
          {
            label: i18n.reports.common.unitName,
            value: (row) => row.unitName
          },
          {
            label: i18n.reports.common.firstName,
            value: (row) => row.childFirstName
          },
          {
            label: i18n.reports.common.lastName,
            value: (row) => row.childLastName
          },
          {
            label: i18n.reports.common.groupName,
            value: (row) => row.groupName
          },
          {
            label: i18n.reports.common.age,
            value: (row) => row.childAge
          },
          ...selectedDaycareColumns.map((level) => ({
            label:
              i18n.childInformation.assistance.types.daycareAssistanceLevel[
                level
              ],
            value: (row: AssistanceNeedsAndActionsReportRowByChild) =>
              row.daycareAssistanceCounts[level] ?? 0
          })),
          ...selectedPreschoolColumns.map((level) => ({
            label:
              i18n.childInformation.assistance.types.preschoolAssistanceLevel[
                level
              ],
            value: (row: AssistanceNeedsAndActionsReportRowByChild) =>
              row.preschoolAssistanceCounts[level] ?? 0
          })),
          ...selectedOtherColumns.map((type) => ({
            label:
              i18n.childInformation.assistance.types.otherAssistanceMeasureType[
                type
              ],
            value: (row: AssistanceNeedsAndActionsReportRowByChild) =>
              row.otherAssistanceMeasureCounts[type] ?? 0
          })),
          ...report.actions.map((action) => ({
            label: action.nameFi,
            value: (row: AssistanceNeedsAndActionsReportRowByChild) =>
              row.actions.includes(action.value) ? 1 : 0
          })),
          {
            label:
              i18n.childInformation.assistanceAction.fields.actionTypes.OTHER,
            value: (row) => row.otherAction,
            exclude: !featureFlags.assistanceActionOther
          },
          {
            label:
              i18n.reports.assistanceNeedsAndActions
                .assistanceNeedVoucherCoefficient,
            value: (row) => row.assistanceNeedVoucherCoefficient,
            exclude: !report.showAssistanceNeedVoucherCoefficient
          }
        ]}
        filename={filename}
      />
      <TableScrollable>
        <Thead>
          <Tr>
            <Th>
              {
                i18n.reports.assistanceNeedsAndActions.groupingTypes[
                  groupData.type
                ]
              }
            </Th>
            <Th>{i18n.reports.common.groupName}</Th>
            <Th>{i18n.reports.common.age}</Th>
            {selectedDaycareColumns.map((level) => (
              <Th key={level}>
                {
                  i18n.childInformation.assistance.types.daycareAssistanceLevel[
                    level
                  ]
                }
              </Th>
            ))}
            {selectedPreschoolColumns.map((level) => (
              <Th key={level}>
                {
                  i18n.childInformation.assistance.types
                    .preschoolAssistanceLevel[level]
                }
              </Th>
            ))}
            {selectedOtherColumns.map((type) => (
              <Th key={type}>
                {
                  i18n.childInformation.assistance.types
                    .otherAssistanceMeasureType[type]
                }
              </Th>
            ))}
            <Th>{i18n.reports.assistanceNeedsAndActions.action}</Th>
            {report.showAssistanceNeedVoucherCoefficient && (
              <Th>
                {
                  i18n.reports.assistanceNeedsAndActions
                    .assistanceNeedVoucherCoefficient
                }
              </Th>
            )}
          </Tr>
        </Thead>
        <Tbody>
          {Object.entries(groupData.data).map(([groupingKey, data]) => (
            <React.Fragment key={`${groupData.type}-${groupingKey}`}>
              {groupData.type !== 'NO_GROUPING' && (
                <Tr data-qa="assistance-needs-and-actions-row">
                  <Td>
                    <div
                      data-qa={`unit-${data.name}`}
                      onClick={() =>
                        setGroupsOpen({
                          ...groupsOpen,
                          [groupingKey]: !(groupsOpen[groupingKey] ?? false)
                        })
                      }
                    >
                      <AccordionIcon
                        icon={
                          groupsOpen[groupingKey] ? faChevronUp : faChevronDown
                        }
                      />
                      {data.name}
                    </div>
                  </Td>
                  <Td>
                    {/*This is to add an empty Ikä column to daycare row */}
                  </Td>
                  <Td />
                  {selectedDaycareColumns.map((level) => (
                    <Td key={level}>
                      {data.daycareAssistanceCounts[level] ?? 0}
                    </Td>
                  ))}
                  {selectedPreschoolColumns.map((level) => (
                    <Td key={level}>
                      {data.preschoolAssistanceCounts[level] ?? 0}
                    </Td>
                  ))}
                  {selectedOtherColumns.map((type) => (
                    <Td key={type}>
                      {data.otherAssistanceMeasureCounts[type] ?? 0}
                    </Td>
                  ))}
                  <Td />
                  {report.showAssistanceNeedVoucherCoefficient && <Td />}
                </Tr>
              )}
              {data.rows
                .filter(
                  (row) =>
                    groupData.type === 'NO_GROUPING' ||
                    groupsOpen[groupKeyFn(row)]
                )
                .map((row: AssistanceNeedsAndActionsReportRowByChild) => (
                  <Tr
                    key={`${row.unitId}:${row.groupId}.${row.childId}`}
                    data-qa="child-row"
                  >
                    <Td>
                      {groupData.type === 'AREA' ? (
                        row.careAreaName
                      ) : (
                        <Link to={`/child-information/${row.childId}`}>
                          {row.childFirstName} {row.childLastName}
                        </Link>
                      )}
                    </Td>
                    <Td>{row.groupName}</Td>
                    <Td>{row.childAge}</Td>
                    {selectedDaycareColumns.map((level) => (
                      <Td key={level}>
                        {row.daycareAssistanceCounts[level] ?? 0}
                      </Td>
                    ))}
                    {selectedPreschoolColumns.map((level) => (
                      <Td key={level}>
                        {row.preschoolAssistanceCounts[level] ?? 0}
                      </Td>
                    ))}
                    {selectedOtherColumns.map((type) => (
                      <Td key={type}>
                        {row.otherAssistanceMeasureCounts[type] ?? 0}
                      </Td>
                    ))}
                    <Td>
                      {report.actions
                        .filter((action) => row.actions.includes(action.value))
                        .map((action, index) => (
                          <span key={action.value}>
                            {index !== 0 && <ActionSeparator />}
                            {action.nameFi}
                          </span>
                        ))}
                      {featureFlags.assistanceActionOther &&
                        row.otherAction !== '' && (
                          <span>
                            {row.actions.length > 0 && <ActionSeparator />}
                            {row.otherAction}
                          </span>
                        )}
                    </Td>

                    {report.showAssistanceNeedVoucherCoefficient && (
                      <Td>{row.assistanceNeedVoucherCoefficient}</Td>
                    )}
                  </Tr>
                ))}
            </React.Fragment>
          ))}
        </Tbody>
        <TableFooter>
          <Tr>
            <Td className="bold">{i18n.reports.common.total}</Td>
            <Td />
            <Td />
            {selectedDaycareColumns.map((level) => (
              <Td key={level}>
                {reducePropertySum(
                  filteredRows,
                  (r) => r.daycareAssistanceCounts[level] ?? 0
                )}
              </Td>
            ))}
            {selectedPreschoolColumns.map((level) => (
              <Td key={level}>
                {reducePropertySum(
                  filteredRows,
                  (r) => r.preschoolAssistanceCounts[level] ?? 0
                )}
              </Td>
            ))}
            {selectedOtherColumns.map((type) => (
              <Td key={type}>
                {reducePropertySum(
                  filteredRows,
                  (r) => r.otherAssistanceMeasureCounts[type] ?? 0
                )}
              </Td>
            ))}
            <Td />
            {report.showAssistanceNeedVoucherCoefficient && (
              <Td>
                {reducePropertySum(
                  filteredRows,
                  (r) => r.assistanceNeedVoucherCoefficient
                )}
              </Td>
            )}
          </Tr>
        </TableFooter>
      </TableScrollable>
    </>
  )
}

const ActionSeparator = () => (
  <>
    ,<br />
  </>
)

const AccordionIcon = styled(FontAwesomeIcon)`
  cursor: pointer;
  color: ${(p) => p.theme.colors.grayscale.g70};
  padding-right: 1em;
`
