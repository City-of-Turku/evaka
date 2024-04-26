// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { PlacementType } from 'lib-common/generated/api-types/placement'
import HelsinkiDateTime from 'lib-common/helsinki-date-time'
import LocalDate from 'lib-common/local-date'
import LocalTime from 'lib-common/local-time'
import { UUID } from 'lib-common/types'

import config from '../../config'
import { initializeAreaAndPersonData } from '../../dev-api/data-init'
import {
  createDaycarePlacementFixture,
  daycareGroupFixture,
  familyWithTwoGuardians,
  Fixture,
  uuidv4
} from '../../dev-api/fixtures'
import {
  createDaycareGroups,
  createDaycarePlacements,
  createDefaultServiceNeedOptions,
  resetServiceState,
  terminatePlacement
} from '../../generated/api-clients'
import ChildInformationPage from '../../pages/employee/child-information'
import { Page } from '../../utils/page'
import { employeeLogin } from '../../utils/user'

beforeEach(async (): Promise<void> => resetServiceState())

const setupPlacement = async (
  placementId: string,
  childId: UUID,
  unitId: UUID,
  childPlacementType: PlacementType
) => {
  await createDaycarePlacements({
    body: [
      createDaycarePlacementFixture(
        placementId,
        childId,
        unitId,
        LocalDate.todayInSystemTz(),
        LocalDate.todayInSystemTz(),
        childPlacementType
      )
    ]
  })
}

async function openChildPlacements(page: Page, childId: UUID) {
  await page.goto(config.employeeUrl + '/child-information/' + childId)
  const childInformationPage = new ChildInformationPage(page)
  await childInformationPage.waitUntilLoaded()
  return await childInformationPage.openCollapsible('placements')
}

describe('Child Information placement info', () => {
  let page: Page
  let childId: UUID
  let unitId: UUID

  beforeEach(async () => {
    const fixtures = await initializeAreaAndPersonData()
    await createDefaultServiceNeedOptions()
    await createDaycareGroups({ body: [daycareGroupFixture] })

    unitId = fixtures.daycareFixture.id
    childId = fixtures.familyWithTwoGuardians.children[0].id
    const unitSupervisor = await Fixture.employeeUnitSupervisor(unitId).save()

    page = await Page.open()
    await employeeLogin(page, unitSupervisor.data)
  })

  test('A terminated placement is indicated', async () => {
    const placementId = uuidv4()
    await setupPlacement(placementId, childId, unitId, 'DAYCARE')

    let childPlacements = await openChildPlacements(page, childId)
    await childPlacements.assertTerminatedByGuardianIsNotShown(placementId)

    await terminatePlacement({
      body: {
        placementId,
        endDate: LocalDate.todayInSystemTz(),
        terminationRequestedDate: LocalDate.todayInSystemTz(),
        terminatedBy: familyWithTwoGuardians.guardian.id
      }
    })

    childPlacements = await openChildPlacements(page, childId)
    await childPlacements.assertTerminatedByGuardianIsShown(placementId)
  })
})

describe('Child Information placement create (feature flag place guarantee = true)', () => {
  const mockedTime = HelsinkiDateTime.fromLocal(
    LocalDate.of(2023, 9, 6),
    LocalTime.of(9, 35)
  )

  test('place guarantee can be set with create modal', async () => {
    const admin = await Fixture.employeeAdmin().save()
    const area = await Fixture.careArea().save()
    const unit = await Fixture.daycare().with({ areaId: area.data.id }).save()
    const { name: unitName } = unit.data
    const child = await Fixture.person().save()
    const childId = child.data.id

    const page = await openPage()
    await employeeLogin(page, admin.data)
    const childPlacements = await openChildPlacements(page, childId)

    await childPlacements.createNewPlacement({
      unitName,
      startDate: mockedTime.toLocalDate().subDays(2).format(),
      endDate: mockedTime.toLocalDate().subDays(2).format(),
      placeGuarantee: false
    })
    await childPlacements.createNewPlacement({
      unitName,
      startDate: mockedTime.toLocalDate().subDays(1).format(),
      endDate: mockedTime.toLocalDate().subDays(1).format(),
      placeGuarantee: true
    })
    await childPlacements.createNewPlacement({
      unitName,
      startDate: mockedTime.toLocalDate().addDays(1).format(),
      endDate: mockedTime.toLocalDate().addDays(1).format(),
      placeGuarantee: true
    })
    await childPlacements.createNewPlacement({
      unitName,
      startDate: mockedTime.toLocalDate().addDays(2).format(),
      endDate: mockedTime.toLocalDate().addDays(2).format(),
      placeGuarantee: false
    })

    await childPlacements.assertPlacementRows([
      { unitName, period: '08.09.2023 - 08.09.2023', status: 'Tulossa' },
      { unitName, period: '07.09.2023 - 07.09.2023', status: 'Takuupaikka' },
      { unitName, period: '05.09.2023 - 05.09.2023', status: 'Päättynyt' },
      { unitName, period: '04.09.2023 - 04.09.2023', status: 'Päättynyt' }
    ])
  })

  test('place guarantee placement shows correctly active status', async () => {
    const admin = await Fixture.employeeAdmin().save()
    const area = await Fixture.careArea().save()
    const unit = await Fixture.daycare().with({ areaId: area.data.id }).save()
    const { name: unitName } = unit.data
    const child = await Fixture.person().save()
    const childId = child.data.id

    const page = await openPage()
    await employeeLogin(page, admin.data)
    const childPlacements = await openChildPlacements(page, childId)

    await childPlacements.createNewPlacement({
      unitName,
      startDate: mockedTime.toLocalDate().format(),
      endDate: mockedTime.toLocalDate().format(),
      placeGuarantee: true
    })

    await childPlacements.assertPlacementRows([
      { unitName, period: '06.09.2023 - 06.09.2023', status: 'Aktiivinen' }
    ])
  })

  test('non place guarantee placement shows correctly active status', async () => {
    const admin = await Fixture.employeeAdmin().save()
    const area = await Fixture.careArea().save()
    const unit = await Fixture.daycare().with({ areaId: area.data.id }).save()
    const { name: unitName } = unit.data
    const child = await Fixture.person().save()
    const childId = child.data.id

    const page = await openPage()
    await employeeLogin(page, admin.data)
    const childPlacements = await openChildPlacements(page, childId)

    await childPlacements.createNewPlacement({
      unitName,
      startDate: mockedTime.toLocalDate().format(),
      endDate: mockedTime.toLocalDate().format(),
      placeGuarantee: false
    })

    await childPlacements.assertPlacementRows([
      { unitName, period: '06.09.2023 - 06.09.2023', status: 'Aktiivinen' }
    ])
  })

  async function openPage() {
    return await Page.open({
      mockedTime,
      employeeCustomizations: { featureFlags: { placementGuarantee: true } }
    })
  }
})

describe('Child Information placement create (feature flag place guarantee = false)', () => {
  const mockedTime = HelsinkiDateTime.fromLocal(
    LocalDate.of(2023, 9, 6),
    LocalTime.of(9, 35)
  )

  test('placement create works', async () => {
    const admin = await Fixture.employeeAdmin().save()
    const area = await Fixture.careArea().save()
    const unit = await Fixture.daycare().with({ areaId: area.data.id }).save()
    const unitName = unit.data.name
    const child = await Fixture.person().save()
    const childId = child.data.id

    const page = await openPage()
    await employeeLogin(page, admin.data)

    const childPlacements = await openChildPlacements(page, childId)
    await childPlacements.createNewPlacement({
      unitName,
      startDate: mockedTime.toLocalDate().subDays(1).format(),
      endDate: mockedTime.toLocalDate().subDays(1).format()
    })
    await childPlacements.createNewPlacement({
      unitName,
      startDate: mockedTime.toLocalDate().format(),
      endDate: mockedTime.toLocalDate().format()
    })
    await childPlacements.createNewPlacement({
      unitName,
      startDate: mockedTime.toLocalDate().addDays(1).format(),
      endDate: mockedTime.toLocalDate().addDays(1).format()
    })

    await childPlacements.assertPlacementRows([
      { unitName, period: '07.09.2023 - 07.09.2023', status: 'Tulossa' },
      { unitName, period: '06.09.2023 - 06.09.2023', status: 'Aktiivinen' },
      { unitName, period: '05.09.2023 - 05.09.2023', status: 'Päättynyt' }
    ])
  })

  async function openPage() {
    return await Page.open({
      mockedTime,
      employeeCustomizations: { featureFlags: { placementGuarantee: false } }
    })
  }
})
