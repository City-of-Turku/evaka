// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.pis.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.eq
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.verify
import com.nhaarman.mockitokotlin2.verifyZeroInteractions
import fi.espoo.evaka.PureJdbiTest
import fi.espoo.evaka.insertGeneralTestFixtures
import fi.espoo.evaka.messaging.MessageNotificationEmailService
import fi.espoo.evaka.messaging.MessageService
import fi.espoo.evaka.messaging.MessageType
import fi.espoo.evaka.messaging.createPersonMessageAccount
import fi.espoo.evaka.messaging.getMessagesReceivedByAccount
import fi.espoo.evaka.messaging.getMessagesSentByAccount
import fi.espoo.evaka.messaging.upsertEmployeeMessageAccount
import fi.espoo.evaka.resetDatabase
import fi.espoo.evaka.shared.MessageAccountId
import fi.espoo.evaka.shared.async.AsyncJob
import fi.espoo.evaka.shared.async.AsyncJobRunner
import fi.espoo.evaka.shared.config.defaultObjectMapper
import fi.espoo.evaka.shared.dev.DevChild
import fi.espoo.evaka.shared.dev.DevEmployee
import fi.espoo.evaka.shared.dev.DevPerson
import fi.espoo.evaka.shared.dev.DevPlacement
import fi.espoo.evaka.shared.dev.insertTestChild
import fi.espoo.evaka.shared.dev.insertTestEmployee
import fi.espoo.evaka.shared.dev.insertTestIncome
import fi.espoo.evaka.shared.dev.insertTestParentship
import fi.espoo.evaka.shared.dev.insertTestPerson
import fi.espoo.evaka.shared.dev.insertTestPlacement
import fi.espoo.evaka.shared.domain.Conflict
import fi.espoo.evaka.shared.domain.DateRange
import fi.espoo.evaka.testDaycare
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito
import java.time.LocalDate
import java.util.UUID
import kotlin.test.assertEquals

class MergeServiceIntegrationTest : PureJdbiTest() {
    lateinit var mergeService: MergeService

    private val objectMapper: ObjectMapper = defaultObjectMapper()
    private val asyncJobRunnerMock: AsyncJobRunner<AsyncJob> = mock { }
    private val messageNotificationEmailService = Mockito.mock(MessageNotificationEmailService::class.java)
    private val messageService: MessageService = MessageService(messageNotificationEmailService)

    @BeforeEach
    internal fun setUp() {
        mergeService = MergeService(asyncJobRunnerMock)
        db.transaction { tx ->
            tx.resetDatabase()
            tx.insertGeneralTestFixtures()
        }
    }

    @Test
    fun `empty person can be deleted`() {
        val id = UUID.randomUUID()
        db.transaction {
            it.insertTestPerson(DevPerson(id = id))
            it.insertTestChild(DevChild(id))
        }

        val countBefore = db.read {
            it.createQuery("SELECT 1 FROM person WHERE id = :id").bind("id", id).map { _, _ -> 1 }.list().size
        }
        assertEquals(1, countBefore)

        db.transaction {
            mergeService.deleteEmptyPerson(it, id)
        }

        val countAfter = db.read {
            it.createQuery("SELECT 1 FROM person WHERE id = :id").bind("id", id).map { _, _ -> 1 }.list().size
        }
        assertEquals(0, countAfter)
    }

    @Test
    fun `cannot delete person with data - placement`() {
        val id = UUID.randomUUID()
        db.transaction {
            it.insertTestPerson(DevPerson(id = id))
            it.insertTestChild(DevChild(id))
            it.insertTestPlacement(
                DevPlacement(
                    childId = id,
                    unitId = testDaycare.id
                )
            )
        }

        assertThrows<Conflict> { db.transaction { mergeService.deleteEmptyPerson(it, id) } }
    }

    @Test
    fun `merging adult moves incomes and sends update event`() {
        val adultId = UUID.randomUUID()
        val adultIdDuplicate = UUID.randomUUID()
        val childId = UUID.randomUUID()
        val validFrom = LocalDate.of(2010, 1, 1)
        val validTo = LocalDate.of(2020, 12, 30)
        db.transaction {
            it.insertTestPerson(DevPerson(id = childId))
            it.insertTestPerson(DevPerson(id = adultId))
            it.insertTestPerson(DevPerson(id = adultIdDuplicate))
            it.insertTestParentship(
                headOfChild = adultId,
                childId = childId,
                startDate = LocalDate.of(2015, 1, 1),
                endDate = LocalDate.of(2030, 1, 1)
            )
            it.insertTestIncome(objectMapper, adultIdDuplicate, validFrom = validFrom, validTo = validTo)
        }

        val countBefore = db.read {
            it.createQuery("SELECT 1 FROM income WHERE person_id = :id").bind("id", adultIdDuplicate).map { _, _ -> 1 }
                .list().size
        }
        assertEquals(1, countBefore)

        db.transaction {
            mergeService.mergePeople(it, adultId, adultIdDuplicate)
        }

        val countAfter = db.read {
            it.createQuery("SELECT 1 FROM income WHERE person_id = :id").bind("id", adultId).map { _, _ -> 1 }
                .list().size
        }
        assertEquals(1, countAfter)

        verify(asyncJobRunnerMock).plan(
            any(),
            eq(listOf(AsyncJob.GenerateFinanceDecisions.forAdult(adultId, DateRange(validFrom, validTo)))),
            any(),
            any(),
            any()
        )
    }

    @Test
    fun `merging child moves placements`() {
        val childId = UUID.randomUUID()
        val childIdDuplicate = UUID.randomUUID()
        db.transaction {
            it.insertTestPerson(DevPerson(id = childId))
            it.insertTestPerson(DevPerson(id = childIdDuplicate))
            it.insertTestChild(DevChild(childIdDuplicate))
        }
        val from = LocalDate.of(2010, 1, 1)
        val to = LocalDate.of(2020, 12, 30)
        db.transaction {
            it.insertTestPlacement(
                DevPlacement(
                    childId = childIdDuplicate,
                    unitId = testDaycare.id,
                    startDate = from,
                    endDate = to
                )
            )
        }

        val countBefore = db.read {
            it.createQuery("SELECT 1 FROM placement WHERE child_id = :id").bind("id", childIdDuplicate)
                .map { _, _ -> 1 }.list().size
        }
        assertEquals(1, countBefore)

        db.transaction {
            mergeService.mergePeople(it, childId, childIdDuplicate)
        }

        val countAfter = db.read {
            it.createQuery("SELECT 1 FROM placement WHERE child_id = :id").bind("id", childId).map { _, _ -> 1 }
                .list().size
        }
        assertEquals(1, countAfter)

        verifyZeroInteractions(asyncJobRunnerMock)
    }

    @Test
    fun `merging a person moves sent messages`() {
        val employeeId = UUID.randomUUID()
        val receiverAccount = db.transaction {
            it.insertTestEmployee(DevEmployee(id = employeeId))
            it.upsertEmployeeMessageAccount(employeeId)
        }
        val senderId = UUID.randomUUID()
        val senderIdDuplicate = UUID.randomUUID()
        val (senderAccount, senderDuplicateAccount) = db.transaction { tx ->
            listOf(senderId, senderIdDuplicate).map {
                tx.insertTestPerson(DevPerson(id = it))
                tx.createPersonMessageAccount(it)
            }
        }

        db.transaction { tx ->
            messageService.createMessageThreadsForRecipientGroups(
                tx,
                title = "Juhannus",
                content = "Juhannus tulee kohta",
                type = MessageType.MESSAGE,
                sender = senderDuplicateAccount,
                recipientGroups = setOf(setOf(receiverAccount)),
                recipientNames = listOf()
            )
        }
        assertEquals(
            listOf(0, 1),
            sentMessageCounts(senderAccount, senderDuplicateAccount)
        )

        db.transaction {
            mergeService.mergePeople(it, senderId, senderIdDuplicate)
            mergeService.deleteEmptyPerson(it, senderIdDuplicate)
        }

        assertEquals(
            listOf(1, 0),
            sentMessageCounts(senderAccount, senderDuplicateAccount)
        )
    }

    private fun sentMessageCounts(vararg accountIds: MessageAccountId): List<Int> = db.read { tx ->
        accountIds.map { tx.getMessagesSentByAccount(it, 10, 1).total }
    }

    @Test
    fun `merging a person moves received messages`() {
        val employeeId = UUID.randomUUID()
        val senderAccount = db.transaction {
            it.insertTestEmployee(DevEmployee(id = employeeId))
            it.upsertEmployeeMessageAccount(employeeId)
        }

        val receiverId = UUID.randomUUID()
        val receiverIdDuplicate = UUID.randomUUID()
        val (receiverAccount, receiverDuplicateAccount) = db.transaction { tx ->
            listOf(receiverId, receiverIdDuplicate).map {
                tx.insertTestPerson(DevPerson(id = it))
                tx.createPersonMessageAccount(it)
            }
        }
        db.transaction { tx ->
            messageService.createMessageThreadsForRecipientGroups(
                tx,
                title = "Juhannus",
                content = "Juhannus tulee kohta",
                type = MessageType.MESSAGE,
                sender = senderAccount,
                recipientGroups = setOf(setOf(receiverDuplicateAccount)),
                recipientNames = listOf()
            )
        }
        assertEquals(
            listOf(0, 1),
            receivedMessageCounts(listOf(receiverAccount, receiverDuplicateAccount), false)
        )

        db.transaction {
            mergeService.mergePeople(it, receiverId, receiverIdDuplicate)
            mergeService.deleteEmptyPerson(it, receiverIdDuplicate)
        }

        assertEquals(
            listOf(1, 0),
            receivedMessageCounts(listOf(receiverAccount, receiverDuplicateAccount), false)
        )
    }

    private fun receivedMessageCounts(accountIds: List<MessageAccountId>, isEmployee: Boolean): List<Int> = db.read { tx ->
        accountIds.map { tx.getMessagesReceivedByAccount(it, 10, 1, isEmployee).total }
    }

    @Test
    fun `merging child sends update event to head of child`() {
        val adultId = UUID.randomUUID()
        val childId = UUID.randomUUID()
        val childIdDuplicate = UUID.randomUUID()
        db.transaction {
            it.insertTestPerson(DevPerson(id = adultId))
            it.insertTestPerson(DevPerson(id = childId))
            it.insertTestChild(DevChild(childId))
            it.insertTestPerson(DevPerson(id = childIdDuplicate))
            it.insertTestChild(DevChild(childIdDuplicate))
            it.insertTestParentship(
                headOfChild = adultId,
                childId = childId,
                startDate = LocalDate.of(2015, 1, 1),
                endDate = LocalDate.of(2030, 1, 1)
            )
        }
        val placementStart = LocalDate.of(2017, 1, 1)
        val placementEnd = LocalDate.of(2020, 12, 30)
        db.transaction {
            it.insertTestPlacement(
                DevPlacement(
                    childId = childIdDuplicate,
                    unitId = testDaycare.id,
                    startDate = placementStart,
                    endDate = placementEnd
                )
            )
        }

        db.transaction {
            mergeService.mergePeople(it, childId, childIdDuplicate)
        }

        verify(asyncJobRunnerMock).plan(
            any(),
            eq(listOf(AsyncJob.GenerateFinanceDecisions.forAdult(adultId, DateRange(placementStart, placementEnd)))),
            any(),
            any(),
            any()
        )
    }
}
