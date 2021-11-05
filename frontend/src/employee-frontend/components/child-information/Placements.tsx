// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useContext, useEffect, useState, Fragment } from 'react'
import { useTranslation } from '../../state/i18n'
import { ChildContext } from '../../state'
import { ChildState } from '../../state/child'
import { Gap } from 'lib-components/white-space'
import Loader from 'lib-components/atoms/Loader'
import PlacementRow from '../../components/child-information/placements/PlacementRow'
import { UIContext } from '../../state/ui'
import CreatePlacementModal from '../../components/child-information/placements/CreatePlacementModal'
import { AddButtonRow } from 'lib-components/atoms/buttons/AddButton'
import { getPlacements } from '../../api/child/placements'
import { RequireRole } from '../../utils/roles'
import { DateRange, rangesOverlap } from '../../utils/date'
import { getServiceNeedOptions } from '../../api/child/service-needs'
import { useRestApi } from 'lib-common/utils/useRestApi'
import _ from 'lodash'
import { CollapsibleContentArea } from 'lib-components/layout/Container'
import { H2, H3 } from 'lib-components/typography'
import { FlexRow } from '../common/styled/containers'
import { UUID } from 'lib-common/types'
import { DaycarePlacementWithDetails } from 'lib-common/generated/api-types/placement'

interface Props {
  id: UUID
  startOpen: boolean
}

const Placements = React.memo(function Placements({ id, startOpen }: Props) {
  const { i18n } = useTranslation()
  const { placements, setPlacements, setServiceNeedOptions } =
    useContext<ChildState>(ChildContext)
  const { uiMode, toggleUiMode } = useContext(UIContext)

  const [open, setOpen] = useState(startOpen)

  const loadPlacements = useRestApi(getPlacements, setPlacements)
  useEffect(() => loadPlacements(id), [id, loadPlacements])

  const loadServiceNeedOptions = useRestApi(
    getServiceNeedOptions,
    setServiceNeedOptions
  )
  useEffect(loadServiceNeedOptions, [loadServiceNeedOptions])

  const checkOverlaps = (
    range: DateRange,
    placement: DaycarePlacementWithDetails
  ): boolean =>
    placements
      .map(
        (ps) =>
          ps
            .filter((p) => p.id !== placement.id)
            .filter((p) => rangesOverlap(range, p)).length > 0
      )
      .getOrElse(false)

  function renderContents() {
    if (placements.isLoading) {
      return <Loader />
    } else if (placements.isFailure) {
      return <div>{i18n.common.loadingFailed}</div>
    }
    return (
      <div>
        {_.orderBy(placements.value, ['startDate'], ['desc']).map((p, i) => (
          <Fragment key={p.id}>
            <PlacementRow
              placement={p}
              onRefreshNeeded={() => loadPlacements(id)}
              checkOverlaps={checkOverlaps}
            />
            {i < placements.value.length - 1 && (
              <div className="separator large" />
            )}
          </Fragment>
        ))}
      </div>
    )
  }

  return (
    <div>
      <CollapsibleContentArea
        title={<H2 noMargin>{i18n.childInformation.placements.title}</H2>}
        open={open}
        toggleOpen={() => setOpen(!open)}
        opaque
        paddingVertical="L"
        data-qa="child-placements-collapsible"
      >
        <Gap size="m" />
        <FlexRow justifyContent="space-between">
          <H3 noMargin>{i18n.childInformation.placements.placements}</H3>
          <RequireRole
            oneOf={[
              'SERVICE_WORKER',
              'UNIT_SUPERVISOR',
              'FINANCE_ADMIN',
              'ADMIN'
            ]}
          >
            <AddButtonRow
              text={i18n.childInformation.placements.createPlacement.btn}
              onClick={() => toggleUiMode('create-new-placement')}
              disabled={uiMode === 'create-new-placement'}
            />
          </RequireRole>
        </FlexRow>
        {renderContents()}
      </CollapsibleContentArea>
      {uiMode === 'create-new-placement' && (
        <CreatePlacementModal childId={id} reload={() => loadPlacements(id)} />
      )}
    </div>
  )
})

export default Placements
