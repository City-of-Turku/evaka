// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { Dispatch, SetStateAction, useCallback } from 'react'
import styled from 'styled-components'
import { isLoading, Result, Success } from 'lib-common/api'
import { PublicUnit } from 'lib-common/generated/api-types/daycare'
import { OccupancyResponseSpeculated } from 'lib-common/generated/api-types/occupancy'
import LocalDate from 'lib-common/local-date'
import { UUID } from 'lib-common/types'
import { useApiState } from 'lib-common/utils/useRestApi'
import { SelectionChip } from 'lib-components/atoms/Chip'
import ExternalLink from 'lib-components/atoms/ExternalLink'
import UnderRowStatusIcon from 'lib-components/atoms/StatusIcon'
import CrossIconButton from 'lib-components/atoms/buttons/CrossIconButton'
import { Bold, H2, InformationText, Title } from 'lib-components/typography'
import { defaultMargins, Gap } from 'lib-components/white-space'
import colors from 'lib-customizations/common'
import { useTranslation } from '../../state/i18n'
import { DaycarePlacementPlan } from '../../types/placementdraft'
import { renderResult } from '../async-rendering'

const Numbers = styled.div`
  display: flex;
  gap: ${defaultMargins.s};
  justify-content: space-evenly;
`

const Number = styled(H2)`
  margin: 0;
  color: ${colors.main.primary};
`
const formatPercentage = (num?: number | null) =>
  num ? `${num.toFixed(1).replace('.', ',')} %` : '–'

interface OccupancyNumbersProps {
  title: string
  num3?: number | null
  num6?: number | null
}

function OccupancyNumbers({ title, num3, num6 }: OccupancyNumbersProps) {
  const { i18n } = useTranslation()
  return (
    <>
      <Bold>{title}</Bold>
      <Gap size="xs" />
      <Numbers>
        <div>
          <InformationText>
            3 {i18n.common.datetime.monthShort.toLowerCase()}
          </InformationText>
          <Number>{formatPercentage(num3)}</Number>
        </div>
        <div>
          <InformationText>
            6 {i18n.common.datetime.monthShort.toLowerCase()}
          </InformationText>
          <Number>{formatPercentage(num6)}</Number>
        </div>
      </Numbers>
    </>
  )
}

const Card = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${defaultMargins.s};

  border: 2px solid ${colors.main.primary};
  border-radius: 4px;
  background: ${colors.greyscale.white};
  box-shadow: 0 4px 4px 0 ${colors.greyscale.darkest}26; // 26 = 15 % opacity
  padding: ${defaultMargins.L};
  flex: 1 0 30%;
  max-width: calc(33% - 1.5rem);
  position: relative;
  text-align: center;
`

const RemoveBtn = styled.div`
  position: absolute;
  top: 0;
  right: 0;
`

const OccupancyContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
`

async function getUnitOccupancies(
  unitId: UUID,
  startDate: LocalDate,
  endDate: LocalDate
): Promise<Result<OccupancyResponseSpeculated>> {
  const occupancyStartDate = startDate.isBefore(LocalDate.today())
    ? LocalDate.today()
    : startDate
  const maxDate = occupancyStartDate.addYears(1)
  const _occupancyEndDate = endDate.isAfter(maxDate) ? maxDate : endDate
  // TODO api call
  return Promise.resolve(
    Success.of({
      max3Months: {
        caretakers: 5,
        headcount: 25,
        percentage: 99,
        sum: 0
      },
      max3MonthsSpeculated: {
        caretakers: 5,
        headcount: 26,
        percentage: 102.3,
        sum: 0
      },
      max6Months: {
        caretakers: 6,
        headcount: 22,
        percentage: 93.9,
        sum: 0
      },
      max6MonthsSpeculated: {
        caretakers: 6,
        headcount: 23,
        percentage: 97.2,
        sum: 0
      }
    })
  )
}

interface Props {
  unitId: string
  unitName: string
  startDate: LocalDate
  endDate: LocalDate
  additionalUnits: PublicUnit[]
  setAdditionalUnits: Dispatch<SetStateAction<PublicUnit[]>>
  setPlacement: Dispatch<SetStateAction<DaycarePlacementPlan>>
  isSelectedUnit: boolean
  displayGhostUnitWarning: boolean
}

export default React.memo(function UnitCard({
  unitId,
  unitName,
  startDate,
  endDate,
  additionalUnits,
  setAdditionalUnits,
  setPlacement,
  isSelectedUnit,
  displayGhostUnitWarning
}: Props) {
  const { i18n } = useTranslation()

  const [occupancies] = useApiState(
    () => getUnitOccupancies(unitId, startDate, endDate),
    [unitId, startDate, endDate]
  )

  const isRemovable = additionalUnits.some((item) => item.id === unitId)

  const removeUnit = useCallback(() => {
    setPlacement((prev) =>
      prev.unitId === unitId ? { ...prev, unitId: '' } : prev
    )
    setAdditionalUnits((prev) => prev.filter((unit) => unit.id !== unitId))
  }, [setAdditionalUnits, setPlacement, unitId])

  const selectUnit = useCallback(
    (unitId: UUID) => setPlacement((prev) => ({ ...prev, unitId })),
    [setPlacement]
  )

  return (
    <Card data-qa="placement-item" data-isloading={isLoading(occupancies)}>
      {isRemovable && (
        <RemoveBtn role="button">
          <CrossIconButton active={false} onClick={removeUnit} />
        </RemoveBtn>
      )}
      <ExternalLink
        href={`/employee/units/${unitId}/unit-info?start=${startDate.formatIso()}`}
        text={<Title primary>{unitName}</Title>}
        newTab
      />
      <OccupancyContainer>
        {renderResult(occupancies, (occupancies) => {
          if (!occupancies.max3Months || !occupancies.max6Months) {
            return <span>{i18n.unit.occupancy.noValidValues}</span>
          }
          return (
            <div>
              <OccupancyNumbers
                title={i18n.placementDraft.card.title}
                num3={occupancies.max3Months.percentage}
                num6={occupancies.max6Months.percentage}
              />
              <Gap size="s" />
              <OccupancyNumbers
                title={i18n.placementDraft.card.titleSpeculated}
                num3={occupancies.max3MonthsSpeculated?.percentage}
                num6={occupancies.max6MonthsSpeculated?.percentage}
              />
            </div>
          )
        })}
      </OccupancyContainer>
      {displayGhostUnitWarning && (
        <InformationText>
          {i18n.childInformation.placements.warning.ghostUnit}
          <UnderRowStatusIcon status="warning" />
        </InformationText>
      )}
      <SelectionChip
        data-qa="select-placement-unit"
        onChange={(checked) => selectUnit(checked ? unitId : '')}
        selected={isSelectedUnit}
        text={
          isSelectedUnit
            ? i18n.placementDraft.selectedUnit
            : i18n.placementDraft.selectUnit
        }
      />
    </Card>
  )
})
