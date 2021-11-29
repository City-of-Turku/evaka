// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useContext, useEffect, Fragment, useCallback } from 'react'
import LocalDate from 'lib-common/local-date'
import {
  AreaFilter,
  Filters,
  InvoiceStatusFilter,
  UnitFilter,
  InvoiceDistinctionsFilter,
  InvoiceDateFilter
} from '../common/Filters'
import { InvoicingUiContext } from '../../state/invoicing-ui'
import { getAreas, getUnits } from '../../api/daycare'
import { InvoiceStatus, InvoiceDistinctiveDetails } from '../../types/invoicing'
import { Gap } from 'lib-components/white-space'
import { useTranslation } from '../../state/i18n'

function InvoiceFilters() {
  const {
    invoices: {
      searchFilters,
      setSearchFilters,
      searchTerms,
      setSearchTerms,
      clearSearchFilters
    },
    shared: { units, setUnits, availableAreas, setAvailableAreas }
  } = useContext(InvoicingUiContext)

  const { i18n } = useTranslation()

  useEffect(() => {
    void getAreas().then(setAvailableAreas)
  }, [setAvailableAreas])

  useEffect(() => {
    void getUnits([], 'DAYCARE').then(setUnits)
  }, [setUnits])

  // remove selected unit filter if the unit is not included in the selected areas
  useEffect(() => {
    if (
      searchFilters.unit &&
      units.isSuccess &&
      !units.value.map(({ id }) => id).includes(searchFilters.unit)
    ) {
      setSearchFilters({ ...searchFilters, unit: undefined })
    }
  }, [units]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleArea = useCallback(
    (code: string) => () => {
      setSearchFilters((old) =>
        old.area.includes(code)
          ? {
              ...old,
              area: old.area.filter((v) => v !== code)
            }
          : {
              ...old,
              area: [...old.area, code]
            }
      )
    },
    [setSearchFilters]
  )

  const selectUnit = useCallback(
    (unit?: string) => setSearchFilters((old) => ({ ...old, unit })),
    [setSearchFilters]
  )

  const toggleStatus = useCallback(
    (status: InvoiceStatus) => () =>
      setSearchFilters((old) => ({ ...old, status })),
    [setSearchFilters]
  )

  const toggleServiceNeed = useCallback(
    (id: InvoiceDistinctiveDetails) => () =>
      setSearchFilters((old) =>
        old.distinctiveDetails.includes(id)
          ? {
              ...old,
              distinctiveDetails: old.distinctiveDetails.filter((v) => v !== id)
            }
          : {
              ...old,
              distinctiveDetails: [...old.distinctiveDetails, id]
            }
      ),
    [setSearchFilters]
  )

  const setStartDate = useCallback(
    (startDate: LocalDate | undefined) =>
      setSearchFilters((old) => ({ ...old, startDate })),
    [setSearchFilters]
  )

  const setEndDate = useCallback(
    (endDate: LocalDate | undefined) =>
      setSearchFilters((old) => ({ ...old, endDate })),
    [setSearchFilters]
  )

  const setUseCustomDatesForInvoiceSending = useCallback(
    (useCustomDatesForInvoiceSending: boolean) =>
      setSearchFilters((old) => ({ ...old, useCustomDatesForInvoiceSending })),
    [setSearchFilters]
  )

  return (
    <Filters
      searchPlaceholder={i18n.filters.freeTextPlaceholder}
      freeText={searchTerms}
      setFreeText={setSearchTerms}
      clearFilters={clearSearchFilters}
      column1={
        <>
          <AreaFilter
            areas={availableAreas.getOrElse([])}
            toggled={searchFilters.area}
            toggle={toggleArea}
          />
          <Gap size="L" />
          <UnitFilter
            units={units
              .map((us) => us.map(({ id, name }) => ({ id, label: name })))
              .getOrElse([])}
            selected={units
              .map(
                (us) =>
                  us
                    .map(({ id, name }) => ({ id, label: name }))
                    .filter((unit) => unit.id === searchFilters.unit)[0]
              )
              .getOrElse(undefined)}
            select={selectUnit}
          />
        </>
      }
      column2={
        <Fragment>
          <InvoiceDistinctionsFilter
            toggled={searchFilters.distinctiveDetails}
            toggle={toggleServiceNeed}
          />
        </Fragment>
      }
      column3={
        <Fragment>
          <InvoiceStatusFilter
            toggled={searchFilters.status}
            toggle={toggleStatus}
          />
          <Gap size="L" />
          <InvoiceDateFilter
            startDate={searchFilters.startDate}
            setStartDate={setStartDate}
            endDate={searchFilters.endDate}
            setEndDate={setEndDate}
            searchByStartDate={searchFilters.useCustomDatesForInvoiceSending}
            setUseCustomDatesForInvoiceSending={
              setUseCustomDatesForInvoiceSending
            }
          />
        </Fragment>
      }
    />
  )
}

export default React.memo(InvoiceFilters)
