// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useMemo, useState } from 'react'
import { Link } from 'react-router'
import styled from 'styled-components'

import type { Failure } from 'lib-common/api'
import DateRange from 'lib-common/date-range'
import { localDateRange } from 'lib-common/form/fields'
import { mapped, object, required, value } from 'lib-common/form/form'
import { useBoolean, useForm, useFormFields } from 'lib-common/form/hooks'
import type { StateOf } from 'lib-common/form/types'
import type { AbsenceType } from 'lib-common/generated/api-types/absence'
import type { HolidayPeriod } from 'lib-common/generated/api-types/holidayperiod'
import type { PlacementType } from 'lib-common/generated/api-types/placement'
import type {
  AbsenceRequest,
  ReservationChild,
  ReservationsResponse
} from 'lib-common/generated/api-types/reservations'
import LocalDate from 'lib-common/local-date'
import { formatFirstName } from 'lib-common/names'
import { scrollIntoViewSoftKeyboard } from 'lib-common/utils/scrolling'
import { SelectionChip } from 'lib-components/atoms/Chip'
import HorizontalLine from 'lib-components/atoms/HorizontalLine'
import { LegacyButton } from 'lib-components/atoms/buttons/LegacyButton'
import {
  MutateButton,
  cancelMutation
} from 'lib-components/atoms/buttons/MutateButton'
import { FixedSpaceFlexWrap } from 'lib-components/layout/flex-helpers'
import { TabletAndDesktop } from 'lib-components/layout/responsive-layout'
import { AlertBox } from 'lib-components/molecules/MessageBoxes'
import { DateRangePickerF } from 'lib-components/molecules/date-picker/DateRangePicker'
import {
  ModalHeader,
  PlainModal
} from 'lib-components/molecules/modals/BaseModal'
import { H1, H2, P } from 'lib-components/typography'
import { defaultMargins, Gap } from 'lib-components/white-space'
import { featureFlags } from 'lib-customizations/citizen'
import { faTimes } from 'lib-icons'

import ModalAccessibilityWrapper from '../ModalAccessibilityWrapper'
import { useLang, useTranslation } from '../localization'

import { BottomFooterContainer } from './BottomFooterContainer'
import {
  CalendarModalBackground,
  CalendarModalButtons,
  CalendarModalCloseButton,
  CalendarModalSection
} from './CalendarModal'
import ChildSelector from './ChildSelector'
import { postAbsencesMutation } from './queries'
import { nonEmptyArray } from './reservation-modal/form'

const tooManyAbsencesErrorThresholdInDays = 7

const preschoolTypes: PlacementType[] = [
  'PRESCHOOL',
  'PRESCHOOL_DAYCARE',
  'PRESCHOOL_DAYCARE_ONLY',
  'PRESCHOOL_CLUB',
  'PREPARATORY',
  'PREPARATORY_DAYCARE',
  'PREPARATORY_DAYCARE_ONLY'
]

const absenceForm = mapped(
  object({
    selectedChildren: nonEmptyArray<ReservationChild>(),
    range: required(localDateRange()),
    absenceType: required(value<AbsenceType | undefined>())
  }),
  (output): AbsenceRequest => ({
    childIds: output.selectedChildren.map((child) => child.id),
    dateRange: output.range,
    absenceType: output.absenceType
  })
)

function initialFormState(
  initialDate: LocalDate | undefined,
  availableChildren: ReservationChild[],
  maxDate: LocalDate
): StateOf<typeof absenceForm> {
  const selectedChildren =
    availableChildren.length === 1 ? [availableChildren[0]] : []
  const range =
    initialDate !== undefined
      ? { startDate: initialDate, endDate: initialDate }
      : { startDate: LocalDate.todayInSystemTz(), endDate: null }
  return {
    range: localDateRange.fromDates(range.startDate, range.endDate, {
      minDate: LocalDate.todayInSystemTz(),
      maxDate
    }),
    selectedChildren,
    absenceType: undefined
  }
}

interface Props {
  close: () => void
  onReturn: () => void
  reservationsResponse: ReservationsResponse
  initialDate: LocalDate | undefined
  holidayPeriods: HolidayPeriod[]
}

export default React.memo(function AbsenceModal({
  close,
  onReturn,
  reservationsResponse,
  initialDate,
  holidayPeriods
}: Props) {
  const i18n = useTranslation()
  const [lang] = useLang()

  const showShiftCareAbsenceType = useMemo(
    () =>
      featureFlags.citizenShiftCareAbsence
        ? reservationsResponse.days.some((day) =>
            day.children.some(({ shiftCare }) => shiftCare)
          )
        : false,
    [reservationsResponse.days]
  )

  const form = useForm(
    absenceForm,
    () =>
      initialFormState(
        initialDate,
        reservationsResponse.children,
        reservationsResponse.reservableRange.end
      ),
    i18n.validationErrors
  )
  const { selectedChildren, range, absenceType } = useFormFields(form)

  const [showAllErrors, useShowAllErrors] = useBoolean(false)

  const absencesWarning =
    range.isValid() &&
    range
      .value()
      .complement(
        new DateRange(reservationsResponse.reservableRange.start, null)
      )
      .reduce((sum, r) => sum + r.durationInDays(), 0) > 1

  const closedHolidayPeriods = range.isValid()
    ? holidayPeriods
        .filter(
          (hp) =>
            hp.period.overlaps(range.value()) &&
            hp.reservationDeadline.isBefore(LocalDate.todayInHelsinkiTz())
        )
        .map((hp) => hp.period)
    : []

  const [attendanceAlreadyExistsError, setAttendanceAlreadyExistsError] =
    useState(false)

  const tooManyAbsencesErrors =
    featureFlags.absenceApplications &&
    selectedChildren.isValid() &&
    range.isValid() &&
    range.value().durationInDays() > tooManyAbsencesErrorThresholdInDays &&
    absenceType.isValid() &&
    absenceType.value() !== 'SICKLEAVE'
      ? selectedChildren
          .value()
          .filter(
            ({ upcomingPlacementType }) =>
              upcomingPlacementType !== null &&
              preschoolTypes.includes(upcomingPlacementType)
          )
      : []

  return (
    <ModalAccessibilityWrapper>
      <PlainModal mobileFullScreen margin="auto" onEscapeKey={close}>
        <CalendarModalBackground>
          <BottomFooterContainer>
            <div>
              <CalendarModalSection>
                <Gap size="L" sizeOnMobile="zero" />
                <ModalHeader
                  headingComponent={(props) => (
                    <H1 noMargin data-qa="title" {...props}>
                      {props.children}
                    </H1>
                  )}
                >
                  {i18n.calendar.absenceModal.title}
                </ModalHeader>
              </CalendarModalSection>
              <Gap size="s" />
              <CalendarModalSection>
                <H2>{i18n.calendar.absenceModal.selectedChildren}</H2>
                <Gap size="xs" />
                <ChildSelector
                  bind={selectedChildren}
                  childItems={reservationsResponse.children.filter(
                    (child) => child.upcomingPlacementType !== null
                  )}
                />
              </CalendarModalSection>
              <Gap size="zero" sizeOnMobile="s" />
              <LineContainer>
                <TabletAndDesktop>
                  <HorizontalLine dashed slim />
                </TabletAndDesktop>
              </LineContainer>
              <CalendarModalSection>
                <H2 id="absence-daterange-label">
                  {i18n.calendar.absenceModal.dateRange}
                </H2>
                <DateRangePickerF
                  bind={range}
                  locale={lang}
                  hideErrorsBeforeTouched={!showAllErrors}
                  onFocus={(ev) => {
                    scrollIntoViewSoftKeyboard(ev.target, 'start')
                  }}
                  required
                  ariaId="absence-daterange-label"
                />
                <Gap size="s" />
                <P noMargin>{i18n.calendar.absenceModal.selectChildrenInfo}</P>
                {absencesWarning ? (
                  <AlertBox
                    title={
                      i18n.calendar.absenceModal.lockedAbsencesWarningTitle
                    }
                    message={
                      i18n.calendar.absenceModal.lockedAbsencesWarningText
                    }
                  />
                ) : closedHolidayPeriods.length > 0 ? (
                  <AlertBox
                    title={i18n.calendar.closedHolidayPeriodAbsence.title(
                      closedHolidayPeriods
                    )}
                    message={
                      i18n.calendar.closedHolidayPeriodAbsence.warningMessage
                    }
                  />
                ) : null}
                {attendanceAlreadyExistsError && (
                  <AlertBox
                    title={
                      i18n.calendar.absenceModal
                        .attendanceAlreadyExistsErrorTitle
                    }
                    message={
                      i18n.calendar.absenceModal
                        .attendanceAlreadyExistsErrorDescription
                    }
                  />
                )}
                {tooManyAbsencesErrors.map((child) => (
                  <AlertBox
                    key={child.id}
                    title={`${formatFirstName(child)} ${child.lastName}`}
                    message={
                      <>
                        {
                          i18n.calendar.absenceModal
                            .tooManyAbsencesErrorDescription
                        }
                        <br />
                        <br />
                        <Link to={`/children/${child.id}/absence-application`}>
                          {i18n.calendar.absenceModal.tooManyAbsencesErrorLink}
                        </Link>
                      </>
                    }
                    data-qa={`too-many-absences-error-${child.id}`}
                  />
                ))}
              </CalendarModalSection>
              <Gap size="zero" sizeOnMobile="s" />
              <LineContainer>
                <TabletAndDesktop>
                  <HorizontalLine dashed slim />
                </TabletAndDesktop>
              </LineContainer>
              <CalendarModalSection>
                <H2 id="absence-type-heading">
                  {i18n.calendar.absenceModal.absenceType}
                </H2>
                <FixedSpaceFlexWrap verticalSpacing="xs">
                  <SelectionChip
                    text={i18n.calendar.absenceModal.absenceTypes.SICKLEAVE}
                    selected={absenceType.state === 'SICKLEAVE'}
                    onChange={(selected) =>
                      absenceType.set(selected ? 'SICKLEAVE' : undefined)
                    }
                    data-qa="absence-SICKLEAVE"
                    hideIcon
                  />
                  <SelectionChip
                    text={i18n.calendar.absenceModal.absenceTypes.OTHER_ABSENCE}
                    selected={absenceType.state === 'OTHER_ABSENCE'}
                    onChange={(selected) =>
                      absenceType.set(selected ? 'OTHER_ABSENCE' : undefined)
                    }
                    data-qa="absence-OTHER_ABSENCE"
                    hideIcon
                  />
                  {showShiftCareAbsenceType ? (
                    <>
                      <SelectionChip
                        text={
                          i18n.calendar.absenceModal.absenceTypes
                            .PLANNED_ABSENCE
                        }
                        selected={absenceType.state === 'PLANNED_ABSENCE'}
                        onChange={(selected) =>
                          absenceType.set(
                            selected ? 'PLANNED_ABSENCE' : undefined
                          )
                        }
                        data-qa="absence-PLANNED_ABSENCE"
                        hideIcon
                      />
                    </>
                  ) : null}
                </FixedSpaceFlexWrap>
                {showAllErrors && !absenceType.isValid() ? (
                  <Warning
                    data-qa="modal-absence-type-required-error"
                    role="alert"
                    aria-labelledby="absence-type-heading"
                  >
                    {i18n.validationErrors.requiredSelection}
                  </Warning>
                ) : null}
              </CalendarModalSection>
            </div>
            <CalendarModalButtons>
              <LegacyButton
                onClick={onReturn}
                data-qa="modal-cancelBtn"
                text={i18n.common.cancel}
              />
              <MutateButton
                primary
                text={i18n.common.confirm}
                textDone={i18n.common.saveSuccess}
                disabled={
                  selectedChildren.state.length === 0 ||
                  tooManyAbsencesErrors.length > 0
                }
                mutation={postAbsencesMutation}
                onClick={() => {
                  if (!form.isValid()) {
                    useShowAllErrors.on()
                    return cancelMutation
                  }
                  return { body: form.value() }
                }}
                onSuccess={close}
                data-qa="modal-okBtn"
                onFailure={(failure: Failure<unknown>) => {
                  setAttendanceAlreadyExistsError(
                    failure.errorCode === 'ATTENDANCE_ALREADY_EXISTS'
                  )
                }}
                successTimeout={2500}
              />
            </CalendarModalButtons>
          </BottomFooterContainer>
        </CalendarModalBackground>
        <CalendarModalCloseButton
          onClick={close}
          aria-label={i18n.common.closeModal}
          icon={faTimes}
        />
      </PlainModal>
    </ModalAccessibilityWrapper>
  )
})

const Warning = styled.div`
  color: ${(p) => p.theme.colors.accents.a2orangeDark};
`

export const LineContainer = styled.div`
  padding: 0 ${defaultMargins.L};
`
