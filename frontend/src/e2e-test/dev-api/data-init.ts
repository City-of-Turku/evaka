// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import {
  testCareArea,
  testClub,
  clubTerms,
  testDaycare,
  testDaycarePrivateVoucher,
  testAdult,
  testChild,
  testChild2,
  testChildRestricted,
  Fixture,
  testPreschool,
  preschoolTerms
} from './fixtures'

const areaAndPersonFixtures = {
  testCareArea,
  testClub,
  testDaycare,
  testDaycarePrivateVoucher,
  testPreschool,
  testAdult,
  testChild,
  testChild2,
  testChildRestricted
}

export type AreaAndPersonFixtures = typeof areaAndPersonFixtures

export const initializeAreaAndPersonData = async (): Promise<
  typeof areaAndPersonFixtures
> => {
  for (const preschoolTermFixture of preschoolTerms) {
    await Fixture.preschoolTerm().with(preschoolTermFixture).save()
  }
  for (const clubTermFixture of clubTerms) {
    await Fixture.clubTerm().with(clubTermFixture).save()
  }
  const careArea = await Fixture.careArea()
    .with(areaAndPersonFixtures.testCareArea)
    .save()
  await Fixture.daycare()
    .with(areaAndPersonFixtures.testClub)
    .careArea(careArea)
    .save()
  await Fixture.daycare()
    .with(areaAndPersonFixtures.testDaycare)
    .careArea(careArea)
    .save()
  await Fixture.daycare()
    .with(areaAndPersonFixtures.testDaycarePrivateVoucher)
    .careArea(careArea)
    .save()
  await Fixture.daycare()
    .with(areaAndPersonFixtures.testPreschool)
    .careArea(careArea)
    .save()
  await Fixture.person()
    .with(areaAndPersonFixtures.testChild)
    .saveChild({ updateMockVtj: true })
  await Fixture.person()
    .with(areaAndPersonFixtures.testChild2)
    .saveChild({ updateMockVtj: true })
  await Fixture.person()
    .with(areaAndPersonFixtures.testChildRestricted)
    .saveChild({ updateMockVtj: true })
  await Fixture.person()
    .with(areaAndPersonFixtures.testAdult)
    .saveAdult({
      updateMockVtjWithDependants: [
        areaAndPersonFixtures.testChild,
        areaAndPersonFixtures.testChild2,
        areaAndPersonFixtures.testChildRestricted
      ]
    })

  return areaAndPersonFixtures
}
