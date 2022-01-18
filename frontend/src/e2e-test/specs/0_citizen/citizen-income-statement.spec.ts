// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import LocalDate from 'lib-common/local-date'
import { resetDatabase } from '../../dev-api'
import CitizenHeader from '../../pages/citizen/citizen-header'
import IncomeStatementsPage from '../../pages/citizen/citizen-income'
import { waitUntilEqual, waitUntilTrue } from '../../utils'
import { Page } from '../../utils/page'
import { enduserLogin } from '../../utils/user'

let page: Page
let header: CitizenHeader
let incomeStatementsPage: IncomeStatementsPage

beforeEach(async () => {
  await resetDatabase()

  page = await Page.open()
  await enduserLogin(page)
  header = new CitizenHeader(page)
  incomeStatementsPage = new IncomeStatementsPage(page)
})

async function assertIncomeStatementCreated(
  startDate = LocalDate.today().format()
) {
  await waitUntilEqual(async () => await incomeStatementsPage.rows.count(), 1)
  await waitUntilTrue(async () =>
    (await incomeStatementsPage.rows.elem().innerText).includes(startDate)
  )
}

const assertRequiredAttachment = async (attachment: string, present = true) =>
  waitUntilTrue(async () =>
    present
      ? (await incomeStatementsPage.requiredAttachments.innerText).includes(
          attachment
        )
      : !(await incomeStatementsPage.requiredAttachments.visible) ||
        !(await incomeStatementsPage.requiredAttachments.innerText).includes(
          attachment
        )
  )

describe('Income statements', () => {
  describe('With the bare minimum selected', () => {
    test('Highest fee', async () => {
      const startDate = '24.12.2044'

      await header.selectTab('income')
      await incomeStatementsPage.createNewIncomeStatement()
      await incomeStatementsPage.setValidFromDate(startDate)
      await incomeStatementsPage.selectIncomeStatementType('highest-fee')
      await incomeStatementsPage.checkAssured()
      await incomeStatementsPage.submit()

      await assertIncomeStatementCreated(startDate)
    })

    test('Gross income', async () => {
      await header.selectTab('income')
      await incomeStatementsPage.createNewIncomeStatement()
      await incomeStatementsPage.selectIncomeStatementType('gross-income')
      await incomeStatementsPage.checkIncomesRegisterConsent()
      await incomeStatementsPage.checkAssured()
      await incomeStatementsPage.setGrossIncomeEstimate(1500)
      await incomeStatementsPage.submit()

      await assertIncomeStatementCreated()
    })
  })

  describe('Entrepreneur income', () => {
    test('Limited liability company', async () => {
      await header.selectTab('income')
      await incomeStatementsPage.createNewIncomeStatement()
      await incomeStatementsPage.selectIncomeStatementType(
        'entrepreneur-income'
      )
      await incomeStatementsPage.selectEntrepreneurType('full-time')
      await incomeStatementsPage.setEntrepreneurStartDate(
        LocalDate.today().addYears(-10).format()
      )
      await incomeStatementsPage.selectEntrepreneurSpouse('no')

      await incomeStatementsPage.toggleEntrepreneurStartupGrant(false)
      await incomeStatementsPage.toggleEntrepreneurCheckupConsent(false)

      await assertRequiredAttachment(
        'Kirjanpitäjän selvitys luontoiseduista ja osingoista',
        false
      )
      await incomeStatementsPage.toggleLimitedLiabilityCompany(true)
      await assertRequiredAttachment(
        'Kirjanpitäjän selvitys luontoiseduista ja osingoista'
      )

      await assertRequiredAttachment('Viimeisin palkkakuitti', false)
      await incomeStatementsPage.toggleLlcType('attachments')
      await assertRequiredAttachment('Viimeisin palkkakuitti')
      await incomeStatementsPage.toggleLlcType('incomes-register')
      await assertRequiredAttachment('Viimeisin palkkakuitti', false)

      await incomeStatementsPage.fillAccountant()

      await incomeStatementsPage.checkAssured()
      await incomeStatementsPage.submit()

      await assertIncomeStatementCreated()
    })
    test('Self employed', async () => {
      await header.selectTab('income')
      await incomeStatementsPage.createNewIncomeStatement()
      await incomeStatementsPage.selectIncomeStatementType(
        'entrepreneur-income'
      )
      await incomeStatementsPage.selectEntrepreneurType('part-time')
      await incomeStatementsPage.setEntrepreneurStartDate(
        LocalDate.today().addYears(-5).addWeeks(-7).format()
      )
      await incomeStatementsPage.selectEntrepreneurSpouse('no')

      await incomeStatementsPage.toggleEntrepreneurStartupGrant(true)
      await assertRequiredAttachment('Starttirahapäätös')

      await incomeStatementsPage.toggleEntrepreneurCheckupConsent(true)

      await assertRequiredAttachment('Tuloslaskelma ja tase', false)
      await incomeStatementsPage.toggleSelfEmployed(true)
      await assertRequiredAttachment('Tuloslaskelma ja tase')

      await incomeStatementsPage.toggleSelfEmployedEstimatedIncome(true)
      await assertRequiredAttachment('Tuloslaskelma ja tase', false)
      await incomeStatementsPage.toggleSelfEmployedEstimatedIncome(false)

      await incomeStatementsPage.toggleSelfEmployedAttachments(true)
      await assertRequiredAttachment('Tuloslaskelma ja tase')

      await incomeStatementsPage.fillAccountant()

      await incomeStatementsPage.checkAssured()
      await incomeStatementsPage.submit()

      await assertIncomeStatementCreated()
    })

    test('Light entrepreneur', async () => {
      await header.selectTab('income')
      await incomeStatementsPage.createNewIncomeStatement()
      await incomeStatementsPage.selectIncomeStatementType(
        'entrepreneur-income'
      )
      await incomeStatementsPage.selectEntrepreneurType('full-time')
      await incomeStatementsPage.setEntrepreneurStartDate(
        LocalDate.today().addMonths(-3).format()
      )
      await incomeStatementsPage.selectEntrepreneurSpouse('no')

      await assertRequiredAttachment(
        'Maksutositteet palkoista ja työkorvauksista',
        false
      )
      await incomeStatementsPage.toggleLightEntrepreneur(true)
      await assertRequiredAttachment(
        'Maksutositteet palkoista ja työkorvauksista'
      )

      await incomeStatementsPage.toggleStudent(true)
      await assertRequiredAttachment('Opiskelutodistus')
      await incomeStatementsPage.toggleAlimonyPayer(true)
      await assertRequiredAttachment('Maksutosite elatusmaksuista')

      await incomeStatementsPage.checkAssured()
      await incomeStatementsPage.submit()

      await assertIncomeStatementCreated()
    })

    test('Partnership', async () => {
      await header.selectTab('income')
      await incomeStatementsPage.createNewIncomeStatement()
      await incomeStatementsPage.selectIncomeStatementType(
        'entrepreneur-income'
      )
      await incomeStatementsPage.selectEntrepreneurType('full-time')
      await incomeStatementsPage.setEntrepreneurStartDate(
        LocalDate.today().addMonths(-1).addDays(3).format()
      )
      await incomeStatementsPage.selectEntrepreneurSpouse('yes')

      await incomeStatementsPage.togglePartnership(true)
      await assertRequiredAttachment('Tuloslaskelma ja tase')
      await assertRequiredAttachment(
        'Kirjanpitäjän selvitys palkasta ja luontoiseduista'
      )
      await incomeStatementsPage.fillAccountant()

      await incomeStatementsPage.checkAssured()
      await incomeStatementsPage.submit()

      await assertIncomeStatementCreated()
    })
  })
})
