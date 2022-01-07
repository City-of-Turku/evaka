// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { faFileAlt } from 'lib-icons'
import * as _ from 'lodash'
import React from 'react'
import { Link } from 'react-router-dom'
import { PersonApplicationSummary } from 'lib-common/generated/api-types/application'
import { UUID } from 'lib-common/types'
import { useApiState } from 'lib-common/utils/useRestApi'
import IconButton from 'lib-components/atoms/buttons/IconButton'
import { Table, Tbody, Td, Th, Thead, Tr } from 'lib-components/layout/Table'
import CollapsibleSection from 'lib-components/molecules/CollapsibleSection'
import { getGuardianApplicationSummaries } from '../../api/person'
import { useTranslation } from '../../state/i18n'
import { DateTd, NameTd, StatusTd } from '../PersonProfile'
import { renderResult } from '../async-rendering'

interface Props {
  id: UUID
  open: boolean
}

export default React.memo(function PersonApplications({ id, open }: Props) {
  const { i18n } = useTranslation()
  const [applications] = useApiState(
    () => getGuardianApplicationSummaries(id),
    [id]
  )

  return (
    <div>
      <CollapsibleSection
        icon={faFileAlt}
        title={i18n.personProfile.applications}
        startCollapsed={!open}
        data-qa="person-applications-collapsible"
      >
        {renderResult(applications, (applications) => (
          <Table data-qa="table-of-applications">
            <Thead>
              <Tr>
                <Th>{i18n.personProfile.application.child}</Th>
                <Th>{i18n.personProfile.application.preferredUnit}</Th>
                <Th>{i18n.personProfile.application.startDate}</Th>
                <Th>{i18n.personProfile.application.sentDate}</Th>
                <Th>{i18n.personProfile.application.type}</Th>
                <Th>{i18n.personProfile.application.status}</Th>
                <Th>{i18n.personProfile.application.open}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {_.orderBy(
                applications,
                ['preferredStartDate', 'preferredUnitName'],
                ['desc', 'desc']
              ).map((application: PersonApplicationSummary) => {
                return (
                  <Tr
                    key={`${application.applicationId}`}
                    data-qa="table-application-row"
                  >
                    <NameTd data-qa="application-child-name">
                      <Link to={`/child-information/${application.childId}`}>
                        {application.childName}
                      </Link>
                    </NameTd>
                    <Td data-qa="application-preferred-unit-id">
                      <Link to={`/units/${application.preferredUnitId ?? ''}`}>
                        {application.preferredUnitName}
                      </Link>
                    </Td>
                    <DateTd data-qa="application-start-date">
                      {application.preferredStartDate?.format()}
                    </DateTd>
                    <DateTd data-qa="application-sent-date">
                      {application.sentDate?.format()}
                    </DateTd>
                    <Td data-qa="application-type">
                      {
                        i18n.personProfile.application.types[
                          inferApplicationType(application)
                        ]
                      }
                    </Td>
                    <StatusTd>
                      {i18n.personProfile.application.statuses[
                        application.status
                      ] ?? application.status}
                    </StatusTd>
                    <Td>
                      <Link to={`/applications/${application.applicationId}`}>
                        <IconButton
                          onClick={() => undefined}
                          icon={faFileAlt}
                          altText={i18n.personProfile.application.open}
                        />
                      </Link>
                    </Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        ))}
      </CollapsibleSection>
    </div>
  )
})

export function inferApplicationType(application: PersonApplicationSummary) {
  const baseType = application.type.toUpperCase()
  if (baseType !== 'PRESCHOOL') return baseType
  else if (application.connectedDaycare && !application.preparatoryEducation) {
    return 'PRESCHOOL_WITH_DAYCARE'
  } else if (application.connectedDaycare && application.preparatoryEducation) {
    return 'PREPARATORY_WITH_DAYCARE'
  } else if (
    !application.connectedDaycare &&
    application.preparatoryEducation
  ) {
    return 'PREPARATORY_EDUCATION'
  } else return 'PRESCHOOL'
}
