// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.messaging

import fi.espoo.evaka.PureJdbiTest
import fi.espoo.evaka.daycare.domain.Language
import fi.espoo.evaka.pis.service.insertGuardian
import fi.espoo.evaka.placement.MessagingCategory
import fi.espoo.evaka.placement.PlacementType
import fi.espoo.evaka.shared.*
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.auth.CitizenAuthLevel
import fi.espoo.evaka.shared.auth.UserRole
import fi.espoo.evaka.shared.auth.insertDaycareAclRow
import fi.espoo.evaka.shared.config.testFeatureConfig
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.dev.*
import fi.espoo.evaka.shared.domain.EvakaClock
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import fi.espoo.evaka.shared.domain.MockEvakaClock
import fi.espoo.evaka.shared.security.AccessControl
import fi.espoo.evaka.shared.security.Action
import fi.espoo.evaka.shared.security.PilotFeature
import fi.espoo.evaka.shared.security.actionrule.DefaultActionRuleMapping
import java.time.LocalDate
import java.time.LocalTime
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.FieldSource

/*
 * TODO: These tests should be moved to MessageIntegrationTest because inserting directly to the database doesn't
 * reflect reality: it's controllers' and MessageService's job but these tests don't invoke them
 */
class MessageQueriesTest : PureJdbiTest(resetDbBeforeEach = true) {
    private val accessControl = AccessControl(DefaultActionRuleMapping(), noopTracer)

    private val person1 = DevPerson(firstName = "Firstname", lastName = "Person")
    private val person2 = DevPerson(firstName = "Firstname", lastName = "Person Two")
    private val employee1 = DevEmployee(firstName = "Firstname", lastName = "Employee")
    private val employee2 = DevEmployee(firstName = "Firstname", lastName = "Employee Two")

    private lateinit var clock: EvakaClock
    private val sendTime = HelsinkiDateTime.of(LocalDate.of(2022, 5, 14), LocalTime.of(12, 11))

    private data class TestAccounts(
        val person1: MessageAccount,
        val person2: MessageAccount,
        val employee1: MessageAccount,
        val employee2: MessageAccount,
    )

    private lateinit var accounts: TestAccounts

    @BeforeEach
    fun setUp() {
        clock = MockEvakaClock(HelsinkiDateTime.of(LocalDate.of(2022, 11, 8), LocalTime.of(13, 1)))
        db.transaction { tx ->
            tx.insert(person1, DevPersonType.ADULT)
            tx.insert(person2, DevPersonType.ADULT)
            tx.insert(employee1)
            tx.insert(employee2)
            accounts =
                TestAccounts(
                    person1 = tx.getAccount(person1),
                    person2 = tx.getAccount(person2),
                    employee1 = tx.createAccount(employee1),
                    employee2 = tx.createAccount(employee2),
                )
        }
    }

    @Test
    fun `a thread can be created`() {
        val content = "Content"
        val title = "Hello"
        createThread(title, content, accounts.employee1, listOf(accounts.person1, accounts.person2))

        assertEquals(
            setOf(accounts.person1.id, accounts.person2.id),
            db.read {
                it.createQuery { sql("SELECT recipient_id FROM message_recipients") }
                    .toSet<MessageAccountId>()
            },
        )
        assertEquals(
            content,
            db.read {
                it.createQuery { sql("SELECT content FROM message_content") }.exactlyOne<String>()
            },
        )
        assertEquals(
            title,
            db.read {
                it.createQuery { sql("SELECT title FROM message_thread") }.exactlyOne<String>()
            },
        )
        assertEquals(
            "Employee Firstname",
            db.read {
                it.createQuery { sql("SELECT sender_name FROM message") }.exactlyOne<String>()
            },
        )
        assertEquals(
            setOf("Person Firstname", "Person Two Firstname"),
            db.read {
                    it.createQuery { sql("SELECT recipient_names FROM message") }
                        .exactlyOne<Array<String>>()
                }
                .toSet(),
        )
    }

    @Test
    fun `messages received by account are grouped properly`() {
        val thread1Id =
            createThread(
                "Hello",
                "Content",
                accounts.employee1,
                listOf(accounts.person1, accounts.person2),
                sendTime,
            )
        val thread2Id =
            createThread(
                "Newest thread",
                "Content 2",
                accounts.employee1,
                listOf(accounts.person1),
                sendTime.plusSeconds(1),
            )
        createThread(
            "Lone Thread",
            "Alone",
            accounts.employee2,
            listOf(accounts.employee2),
            sendTime.plusSeconds(2),
        )

        // employee is not a recipient in any threads
        assertEquals(
            0,
            db.read {
                    it.getReceivedThreads(
                        accounts.employee1.id,
                        10,
                        1,
                        "Espoo",
                        "Espoon palveluohjaus",
                        "Espoon asiakasmaksut",
                    )
                }
                .data
                .size,
        )
        val personResult =
            db.read {
                it.getThreads(
                    accounts.employee1.id,
                    10,
                    1,
                    "Espoo",
                    "Espoon palveluohjaus",
                    "Espoon asiakasmaksut",
                )
            }
        assertEquals(2, personResult.data.size)

        val thread = personResult.data.first()
        assertEquals(thread2Id, thread.id)
        assertEquals("Newest thread", thread.title)

        // when the thread is marked read for person 1
        db.transaction { it.markThreadRead(clock.now(), accounts.person1.id, thread1Id) }

        // then the message has correct readAt
        val person1Threads =
            db.read {
                it.getThreads(
                    accounts.person1.id,
                    10,
                    1,
                    "Espoo",
                    "Espoon palveluohjaus",
                    "Espoon asiakasmaksut",
                )
            }
        assertEquals(2, person1Threads.data.size)
        val readMessages = person1Threads.data.flatMap { it.messages.mapNotNull { m -> m.readAt } }
        assertEquals(1, readMessages.size)
        assertEquals(clock.now(), readMessages[0])

        // then person 2 threads are not affected
        assertEquals(
            0,
            db.read {
                    it.getThreads(
                        accounts.person2.id,
                        10,
                        1,
                        "Espoo",
                        "Espoon palveluohjaus",
                        "Espoon asiakasmaksut",
                    )
                }
                .data
                .flatMap { it.messages.mapNotNull { m -> m.readAt } }
                .size,
        )

        // when employee gets a reply
        replyToThread(
            thread2Id,
            accounts.person1,
            setOf(accounts.employee1),
            "Just replying here",
            thread.messages.last().id,
            now = sendTime.plusSeconds(3),
        )

        // then employee sees the thread
        val employeeResult =
            db.read {
                it.getReceivedThreads(
                    accounts.employee1.id,
                    10,
                    1,
                    "Espoo",
                    "Espoon palveluohjaus",
                    "Espoon asiakasmaksut",
                )
            }
        assertEquals(1, employeeResult.data.size)
        assertEquals("Newest thread", employeeResult.data[0].title)
        assertEquals(2, employeeResult.data[0].messages.size)

        // person 1 is recipient in both threads
        val person1Result =
            db.read {
                it.getThreads(
                    accounts.person1.id,
                    10,
                    1,
                    "Espoo",
                    "Espoon palveluohjaus",
                    "Espoon asiakasmaksut",
                )
            }
        assertEquals(2, person1Result.data.size)

        val newestThread = person1Result.data[0]
        assertEquals(thread2Id, newestThread.id)
        assertEquals("Newest thread", newestThread.title)
        assertEquals(
            listOf(
                Pair(accounts.employee1, "Content 2"),
                Pair(accounts.person1, "Just replying here"),
            ),
            newestThread.messages.map { Pair(it.sender, it.content) },
        )
        assertEquals(employeeResult.data[0], newestThread)

        val oldestThread = person1Result.data[1]
        assertEquals(thread1Id, oldestThread.id)
        assertNotNull(oldestThread.messages.find { it.content == "Content" }?.readAt)
        assertNull(oldestThread.messages.find { it.content == "Just replying here" }?.readAt)

        // person 2 is recipient in the oldest thread only
        val person2Result =
            db.read {
                it.getThreads(
                    accounts.person2.id,
                    10,
                    1,
                    "Espoo",
                    "Espoon palveluohjaus",
                    "Espoon asiakasmaksut",
                )
            }
        assertEquals(1, person2Result.data.size)
        assertEquals(oldestThread.id, person2Result.data[0].id)
        assertEquals(0, person2Result.data.flatMap { it.messages }.mapNotNull { it.readAt }.size)

        // employee 2 is participating with himself
        val employee2Result =
            db.read {
                it.getReceivedThreads(
                    accounts.employee2.id,
                    10,
                    1,
                    "Espoo",
                    "Espoon palveluohjaus",
                    "Espoon asiakasmaksut",
                )
            }
        assertEquals(1, employee2Result.data.size)
        assertEquals(1, employee2Result.data[0].messages.size)
        assertEquals(accounts.employee2, employee2Result.data[0].messages[0].sender)
        assertEquals("Alone", employee2Result.data[0].messages[0].content)
    }

    @Test
    fun `received messages can be paged`() {
        createThread("t1", "c1", accounts.employee1, listOf(accounts.person1))
        createThread("t2", "c2", accounts.employee1, listOf(accounts.person1))

        val messages =
            db.read {
                it.getThreads(
                    accounts.person1.id,
                    10,
                    1,
                    "Espoo",
                    "Espoon palveluohjaus",
                    "Espoon asiakasmaksut",
                )
            }
        assertEquals(2, messages.total)
        assertEquals(2, messages.data.size)
        assertEquals(setOf("t1", "t2"), messages.data.map { it.title }.toSet())

        val (page1, page2) =
            db.read {
                listOf(
                    it.getThreads(
                        accounts.person1.id,
                        1,
                        1,
                        "Espoo",
                        "Espoon palveluohjaus",
                        "Espoon asiakasmaksut",
                    ),
                    it.getThreads(
                        accounts.person1.id,
                        1,
                        2,
                        "Espoo",
                        "Espoon palveluohjaus",
                        "Espoon asiakasmaksut",
                    ),
                )
            }
        assertEquals(2, page1.total)
        assertEquals(2, page1.pages)
        assertEquals(1, page1.data.size)
        assertEquals(messages.data[0], page1.data[0])

        assertEquals(2, page2.total)
        assertEquals(2, page2.pages)
        assertEquals(1, page2.data.size)
        assertEquals(messages.data[1], page2.data[0])
    }

    @Test
    fun `sent messages`() {
        // when two threads are created
        createThread(
            "thread 1",
            "content 1",
            accounts.employee1,
            listOf(accounts.person1, accounts.person2),
            sendTime,
        )
        createThread(
            "thread 2",
            "content 2",
            accounts.employee1,
            listOf(accounts.person1),
            sendTime.plusSeconds(1),
        )

        // then sent messages are returned for sender id
        val firstPage = db.read { it.getMessagesSentByAccount(accounts.employee1.id, 1, 1) }
        assertEquals(2, firstPage.total)
        assertEquals(2, firstPage.pages)
        assertEquals(1, firstPage.data.size)

        val newestMessage = firstPage.data[0]
        assertEquals("content 2", newestMessage.content)
        assertEquals("thread 2", newestMessage.threadTitle)
        assertEquals(listOf(accounts.person1.name), newestMessage.recipientNames)

        val secondPage = db.read { it.getMessagesSentByAccount(accounts.employee1.id, 1, 2) }
        assertEquals(2, secondPage.total)
        assertEquals(2, secondPage.pages)
        assertEquals(1, secondPage.data.size)

        val oldestMessage = secondPage.data[0]
        assertEquals("content 1", oldestMessage.content)
        assertEquals("thread 1", oldestMessage.threadTitle)
        assertEquals(
            listOf(accounts.person1.name, accounts.person2.name),
            oldestMessage.recipientNames,
        )

        // then fetching sent messages by recipient ids does not return the messages
        assertEquals(0, db.read { it.getMessagesSentByAccount(accounts.person1.id, 1, 1) }.total)
    }

    @Test
    fun `message participants by messageId`() {
        val threadId =
            createThread(
                "Hello",
                "Content",
                accounts.employee1,
                listOf(accounts.person1, accounts.person2),
            )

        val participants =
            db.read {
                val messageId =
                    it.createQuery {
                            sql("SELECT id FROM message WHERE thread_id = ${bind(threadId)}")
                        }
                        .exactlyOne<MessageId>()
                it.getThreadByMessageId(messageId)
            }
        assertEquals(
            ThreadWithParticipants(
                threadId = threadId,
                type = MessageType.MESSAGE,
                isCopy = false,
                senders = setOf(accounts.employee1.id),
                recipients = setOf(accounts.person1.id, accounts.person2.id),
                applicationId = null,
                applicationStatus = null,
                children = setOf(),
            ),
            participants,
        )

        val now = HelsinkiDateTime.now()
        val participants2 =
            db.transaction { tx ->
                val contentId = tx.insertMessageContent("foo", accounts.person2.id)
                val messageId =
                    tx.insertMessage(
                        now = now,
                        contentId = contentId,
                        threadId = threadId,
                        sender = accounts.person2.id,
                        sentAt = now,
                        recipientNames =
                            tx.getAccountNames(
                                setOf(accounts.employee1.id),
                                testFeatureConfig.serviceWorkerMessageAccountName,
                                testFeatureConfig.financeMessageAccountName,
                            ),
                        municipalAccountName = "Espoo",
                        serviceWorkerAccountName = "Espoon palveluohjaus",
                        financeAccountName = "Espoon asiakasmaksut",
                    )
                tx.insertRecipients(listOf(messageId to setOf(accounts.employee1.id)))
                tx.getThreadByMessageId(messageId)
            }
        assertEquals(
            ThreadWithParticipants(
                threadId = threadId,
                type = MessageType.MESSAGE,
                isCopy = false,
                senders = setOf(accounts.employee1.id, accounts.person2.id),
                recipients = setOf(accounts.person1.id, accounts.person2.id, accounts.employee1.id),
                applicationId = null,
                applicationStatus = null,
                children = setOf(),
            ),
            participants2,
        )
    }

    @Test
    fun `query citizen recipients for group change over 2 weeks into the future`() {
        lateinit var group1Account: MessageAccount
        lateinit var group2Account: MessageAccount

        val today = LocalDate.now()
        val startDate = today.minusDays(30)
        val endDateGroup1 = today.plusWeeks(2)
        val startDateGroup2 = endDateGroup1.plusDays(1)
        val endDate = today.plusDays(30)

        db.transaction { tx ->
            val (childId, daycareId, group1Id, tempGroup1Account, group2Id, tempGroup2Account) =
                prepareDataForRecipientsTest(tx)
            group1Account = tempGroup1Account
            group2Account = tempGroup2Account

            val placementId =
                tx.insert(
                    DevPlacement(
                        childId = childId,
                        unitId = daycareId,
                        type = PlacementType.DAYCARE,
                        startDate = startDate,
                        endDate = endDate,
                    )
                )
            tx.insert(
                DevDaycareGroupPlacement(
                    daycarePlacementId = placementId,
                    daycareGroupId = group1Id,
                    startDate = startDate,
                    endDate = endDateGroup1,
                )
            )
            tx.insert(
                DevDaycareGroupPlacement(
                    daycarePlacementId = placementId,
                    daycareGroupId = group2Id,
                    startDate = startDateGroup2,
                    endDate = endDate,
                )
            )
        }

        val recipients = db.read { it.getCitizenRecipients(today, accounts.person1.id).values }

        val expectedForNewMessage = setOf(group1Account, accounts.employee1)
        val expectedForReply =
            setOf(group1Account, accounts.employee1, accounts.employee2, group2Account)

        assertEquals(
            expectedForNewMessage,
            recipients.flatMap { r -> r.newMessage.map { a -> a.account } }.toSet(),
        )
        assertEquals(
            expectedForReply,
            recipients.flatMap { r -> r.reply.map { a -> a.account } }.toSet(),
        )
    }

    @Test
    fun `query citizen recipients for group change less than 2 weeks into the future`() {
        lateinit var group1Account: MessageAccount
        lateinit var group2Account: MessageAccount

        val today = LocalDate.now()
        val startDate = today.minusDays(30)
        val endDateGroup1 = today.plusWeeks(2).minusDays(1)
        val startDateGroup2 = endDateGroup1.plusDays(1)
        val endDate = today.plusDays(30)

        db.transaction { tx ->
            val (childId, daycareId, group1Id, tempGroup1Account, group2Id, tempGroup2Account) =
                prepareDataForRecipientsTest(tx)
            group1Account = tempGroup1Account
            group2Account = tempGroup2Account

            val placementId =
                tx.insert(
                    DevPlacement(
                        childId = childId,
                        unitId = daycareId,
                        type = PlacementType.DAYCARE,
                        startDate = startDate,
                        endDate = endDate,
                    )
                )
            tx.insert(
                DevDaycareGroupPlacement(
                    daycarePlacementId = placementId,
                    daycareGroupId = group1Id,
                    startDate = startDate,
                    endDate = endDateGroup1,
                )
            )
            tx.insert(
                DevDaycareGroupPlacement(
                    daycarePlacementId = placementId,
                    daycareGroupId = group2Id,
                    startDate = startDateGroup2,
                    endDate = endDate,
                )
            )
        }

        val recipients = db.read { it.getCitizenRecipients(today, accounts.person1.id).values }

        val expectedForNewMessage = setOf(group1Account, group2Account, accounts.employee1)
        assertEquals(
            expectedForNewMessage,
            recipients.flatMap { r -> r.newMessage.map { a -> a.account } }.toSet(),
        )
        assertEquals(
            expectedForNewMessage + accounts.employee2,
            recipients.flatMap { r -> r.reply.map { a -> a.account } }.toSet(),
        )
    }

    @Test
    fun `citizen doesn't get any recipients for ended placements`() {
        val today = LocalDate.now()
        val startDate = today.minusMonths(2)
        val endDate = today.minusDays(1)

        db.transaction { tx ->
            val (childId, daycareId, group1Id, _, _) = prepareDataForRecipientsTest(tx)
            val placementId =
                tx.insert(
                    DevPlacement(
                        childId = childId,
                        unitId = daycareId,
                        type = PlacementType.DAYCARE,
                        startDate = startDate,
                        endDate = endDate,
                    )
                )
            tx.insert(
                DevDaycareGroupPlacement(
                    daycarePlacementId = placementId,
                    daycareGroupId = group1Id,
                    startDate = startDate,
                    endDate = endDate,
                )
            )
        }
        val recipients = db.read { it.getCitizenRecipients(today, accounts.person1.id).values }

        assertEquals(0, recipients.flatMap { it.newMessage }.size)
        assertEquals(0, recipients.flatMap { it.reply }.size)
    }

    @Test
    fun `citizen recipients include backup and standard placements`() {
        val today = LocalDate.now()
        val startDate = today.minusMonths(2)
        val endDate = today.plusMonths(2)
        val anotherUnitSupervisor = DevEmployee(firstName = "Super", lastName = "Visor")
        lateinit var groupAccount: MessageAccount
        lateinit var anotherUnitSupervisorAccount: MessageAccount

        db.transaction { tx ->
            val (childId, daycareId, groupId, tempGroupAccount, _, _, areaId) =
                prepareDataForRecipientsTest(tx)
            groupAccount = tempGroupAccount

            val placementId =
                tx.insert(
                    DevPlacement(
                        childId = childId,
                        unitId = daycareId,
                        type = PlacementType.DAYCARE,
                        startDate = startDate,
                        endDate = endDate,
                    )
                )
            tx.insert(
                DevDaycareGroupPlacement(
                    daycarePlacementId = placementId,
                    daycareGroupId = groupId,
                    startDate = startDate,
                    endDate = endDate,
                )
            )
            val backupDaycareId =
                tx.insert(
                    DevDaycare(
                        areaId = areaId,
                        language = Language.fi,
                        enabledPilotFeatures = setOf(PilotFeature.MESSAGING),
                    )
                )
            val supervisorId = tx.insert(anotherUnitSupervisor)
            anotherUnitSupervisorAccount = tx.createAccount(anotherUnitSupervisor)
            tx.insertDaycareAclRow(
                daycareId = backupDaycareId,
                employeeId = supervisorId,
                role = UserRole.UNIT_SUPERVISOR,
            )
            tx.insert(
                DevBackupCare(
                    childId = childId,
                    unitId = backupDaycareId,
                    period = FiniteDateRange(today.plusDays(1), today.plusDays(2)),
                )
            )
        }
        val recipients = db.read { it.getCitizenRecipients(today, accounts.person1.id).values }

        val expectedForNewMessage =
            setOf(accounts.employee1, groupAccount, anotherUnitSupervisorAccount)

        assertEquals(
            expectedForNewMessage,
            recipients.flatMap { r -> r.newMessage.map { a -> a.account } }.toSet(),
        )
        assertEquals(
            expectedForNewMessage + accounts.employee2,
            recipients.flatMap { r -> r.reply.map { a -> a.account } }.toSet(),
        )
    }

    @Test
    fun `children with only secondary recipients are not included in recipients`() {
        lateinit var child1Id: PersonId
        lateinit var child2Id: PersonId
        lateinit var groupAccount: MessageAccount
        lateinit var child2Placement: PlacementId
        val now = HelsinkiDateTime.of(LocalDate.of(2022, 1, 1), LocalTime.of(12, 0))
        db.transaction { tx ->
            val areaId = tx.insert(DevCareArea())
            val daycareId =
                tx.insert(
                    DevDaycare(
                        areaId = areaId,
                        enabledPilotFeatures = setOf(PilotFeature.MESSAGING),
                    )
                )
            tx.insertDaycareAclRow(daycareId, employee1.id, UserRole.UNIT_SUPERVISOR)
            val group = DevDaycareGroup(daycareId = daycareId)
            tx.insert(group)
            groupAccount =
                MessageAccount(
                    id = tx.createDaycareGroupMessageAccount(group.id),
                    name = group.name,
                    type = AccountType.GROUP,
                    personId = null,
                )
            child1Id = tx.insert(DevPerson(), DevPersonType.CHILD)
            child2Id = tx.insert(DevPerson(), DevPersonType.CHILD)
            listOf(child1Id, child2Id).forEach { childId ->
                listOf(person1.id, person2.id).forEach { guardianId ->
                    tx.insert(DevGuardian(guardianId = guardianId, childId = childId))
                }
            }
            val startDate = now.toLocalDate()
            val endDate = startDate.plusDays(30)
            val placementId =
                tx.insert(
                    DevPlacement(
                        childId = child1Id,
                        unitId = daycareId,
                        startDate = startDate,
                        endDate = endDate,
                    )
                )
            tx.insert(
                DevDaycareGroupPlacement(
                    daycarePlacementId = placementId,
                    daycareGroupId = group.id,
                    startDate = startDate,
                    endDate = endDate,
                )
            )
            child2Placement =
                tx.insert(
                    DevPlacement(
                        childId = child2Id,
                        unitId = daycareId,
                        startDate = startDate,
                        endDate = endDate,
                    )
                )
        }
        fun recipientsOf(account: MessageAccount) =
            db.read { it.getCitizenRecipients(now.toLocalDate(), account.id) }

        fun accountsToAccountSetWithPresence(vararg accounts: MessageAccount) =
            accounts
                .map { account ->
                    MessageAccountWithPresence(account = account, outOfOffice = null)
                }
                .toSet()

        assertEquals(
            mapOf(
                child1Id to
                    MessageAccountAccess(
                        accountsToAccountSetWithPresence(
                            accounts.employee1,
                            groupAccount,
                            accounts.person2,
                        ),
                        accountsToAccountSetWithPresence(
                            accounts.employee1,
                            groupAccount,
                            accounts.person2,
                        ),
                    ),
                child2Id to
                    MessageAccountAccess(
                        accountsToAccountSetWithPresence(accounts.employee1, accounts.person2),
                        accountsToAccountSetWithPresence(accounts.employee1, accounts.person2),
                    ),
            ),
            recipientsOf(accounts.person1),
        )
        deletePlacement(child2Placement)
        assertEquals(
            mapOf(
                child1Id to
                    MessageAccountAccess(
                        accountsToAccountSetWithPresence(
                            accounts.employee1,
                            groupAccount,
                            accounts.person2,
                        ),
                        accountsToAccountSetWithPresence(
                            accounts.employee1,
                            groupAccount,
                            accounts.person2,
                        ),
                    )
            ),
            recipientsOf(accounts.person1),
        )
    }

    @Test
    fun `a thread can be archived`() {
        val content = "Content"
        val title = "Hello"
        val threadId = createThread(title, content, accounts.employee1, listOf(accounts.person1))

        assertEquals(1, unreadMessagesCount(person1.id))

        db.transaction { tx -> tx.archiveThread(accounts.person1.id, threadId) }

        assertEquals(0, unreadMessagesCount(person1.id))

        assertEquals(
            1,
            db.read {
                val archiveFolderId = it.getArchiveFolderId(accounts.person1.id)
                it.getReceivedThreads(
                        accounts.person1.id,
                        50,
                        1,
                        "Espoo",
                        "Espoon palveluohjaus",
                        "Espoon asiakasmaksut",
                        archiveFolderId,
                    )
                    .total
            },
        )
    }

    @Test
    fun `an archived threads returns to inbox when it receives messages`() {
        val content = "Content"
        val title = "Hello"
        val threadId = createThread(title, content, accounts.employee1, listOf(accounts.person1))
        db.transaction { tx -> tx.archiveThread(accounts.person1.id, threadId) }
        assertEquals(
            1,
            db.read {
                val archiveFolderId = it.getArchiveFolderId(accounts.person1.id)
                it.getReceivedThreads(
                        accounts.person1.id,
                        50,
                        1,
                        "Espoo",
                        "Espoon palveluohjaus",
                        "Espoon asiakasmaksut",
                        archiveFolderId,
                    )
                    .total
            },
        )

        replyToThread(threadId, accounts.employee1, setOf(accounts.person1), "Reply")

        assertEquals(
            1,
            db.read {
                it.getReceivedThreads(
                        accounts.person1.id,
                        50,
                        1,
                        "Espoo",
                        "Espoon palveluohjaus",
                        "Espoon asiakasmaksut",
                        null,
                    )
                    .total
            },
        )
        assertEquals(
            0,
            db.read {
                val archiveFolderId = it.getArchiveFolderId(accounts.person1.id)
                it.getReceivedThreads(
                        accounts.person1.id,
                        50,
                        1,
                        "Espoo",
                        "Espoon palveluohjaus",
                        "Espoon asiakasmaksut",
                        archiveFolderId,
                    )
                    .total
            },
        )
    }

    @Test
    fun `staff copies are sent to active groups`() {
        val today = LocalDate.now()
        val area = DevCareArea()
        val daycare =
            DevDaycare(areaId = area.id, enabledPilotFeatures = setOf(PilotFeature.MESSAGING))

        val ongoingGroup = DevDaycareGroup(daycareId = daycare.id, name = "A")
        val untilYesterdayGroup =
            DevDaycareGroup(daycareId = daycare.id, name = "B", endDate = today.minusDays(1))
        val untilTodayGroup = DevDaycareGroup(daycareId = daycare.id, name = "C", endDate = today)
        val untilTomorrowGroup =
            DevDaycareGroup(daycareId = daycare.id, name = "D", endDate = today.plusDays(1))

        val (
            groupMessageAccountOngoing,
            groupMessageAccountUntilToday,
            groupMessageAccountUntilTomorrow) =
            db.transaction { tx ->
                tx.insert(area)
                tx.insert(daycare)

                tx.insert(ongoingGroup)
                tx.insert(untilYesterdayGroup)
                tx.insert(untilTodayGroup)
                tx.insert(untilTomorrowGroup)

                val groupMessageAccountOngoing =
                    tx.createDaycareGroupMessageAccount(ongoingGroup.id)
                tx.createDaycareGroupMessageAccount(untilYesterdayGroup.id)
                val groupMessageAccountUntilToday =
                    tx.createDaycareGroupMessageAccount(untilTodayGroup.id)
                val groupMessageAccountUntilTomorrow =
                    tx.createDaycareGroupMessageAccount(untilTomorrowGroup.id)

                tx.insertDaycareAclRow(daycare.id, employee1.id, UserRole.UNIT_SUPERVISOR)

                Triple(
                    groupMessageAccountOngoing,
                    groupMessageAccountUntilToday,
                    groupMessageAccountUntilTomorrow,
                )
            }

        val recipients =
            db.transaction { tx ->
                tx.getStaffCopyRecipients(
                    accounts.employee1.id,
                    setOf(MessageRecipient.Area(area.id)),
                    today,
                )
            }

        assertEquals(
            setOf(
                groupMessageAccountOngoing,
                groupMessageAccountUntilToday,
                groupMessageAccountUntilTomorrow,
            ),
            recipients,
        )
    }

    @Test
    fun `getMessageAccountsForRecipients returns correct accounts`() {
        val today = LocalDate.of(2021, 5, 1)

        // Set up test data
        val area = DevCareArea()
        val daycare =
            DevDaycare(areaId = area.id, enabledPilotFeatures = setOf(PilotFeature.MESSAGING))
        val group = DevDaycareGroup(daycareId = daycare.id)

        val currentChild = DevPerson()
        val starterChild = DevPerson()
        val changerChild = DevPerson()
        val currentParent = DevPerson()
        val starterParent = DevPerson()
        val changerParent = DevPerson()
        val currentPlacement =
            DevPlacement(
                childId = currentChild.id,
                unitId = daycare.id,
                startDate = today.minusDays(10),
                endDate = today.plusDays(30),
            )
        val starterPlacement =
            DevPlacement(
                childId = starterChild.id,
                unitId = daycare.id,
                startDate = today.plusDays(5),
                endDate = today.plusDays(30),
            )
        val changerPlacement1 =
            DevPlacement(
                childId = changerChild.id,
                unitId = daycare.id,
                startDate = today.minusDays(10),
                endDate = today.plusDays(30),
            )
        val changerPlacement2 =
            DevPlacement(
                childId = changerChild.id,
                unitId = daycare.id,
                startDate = today.plusDays(31),
                endDate = today.plusDays(60),
            )

        val (
            employeeAccountId,
            currentParentAccountId,
            starterParentAccountId,
            changerParentAccountId) =
            db.transaction { tx ->
                tx.insert(area)
                tx.insert(daycare)
                tx.insert(group)

                tx.insert(currentChild, DevPersonType.CHILD)
                tx.insert(starterChild, DevPersonType.CHILD)
                tx.insert(changerChild, DevPersonType.CHILD)
                tx.insert(currentParent, DevPersonType.ADULT)
                tx.insert(starterParent, DevPersonType.ADULT)
                tx.insert(changerParent, DevPersonType.ADULT)

                tx.insertGuardian(guardianId = currentParent.id, childId = currentChild.id)
                tx.insertGuardian(guardianId = starterParent.id, childId = starterChild.id)
                tx.insertGuardian(guardianId = changerParent.id, childId = changerChild.id)

                tx.insert(currentPlacement)
                tx.insert(starterPlacement)
                tx.insert(changerPlacement1)
                tx.insert(changerPlacement2)

                tx.insert(
                    DevDaycareGroupPlacement(
                        daycareGroupId = group.id,
                        daycarePlacementId = currentPlacement.id,
                        startDate = today.minusDays(10),
                        endDate = today.plusDays(30),
                    )
                )
                tx.insert(
                    DevDaycareGroupPlacement(
                        daycareGroupId = group.id,
                        daycarePlacementId = starterPlacement.id,
                        startDate = today.plusDays(5),
                        endDate = today.plusDays(30),
                    )
                )
                tx.insert(
                    DevDaycareGroupPlacement(
                        daycareGroupId = group.id,
                        daycarePlacementId = changerPlacement1.id,
                        startDate = today.minusDays(10),
                        endDate = today.plusDays(30),
                    )
                )
                tx.insert(
                    DevDaycareGroupPlacement(
                        daycareGroupId = group.id,
                        daycarePlacementId = changerPlacement2.id,
                        startDate = today.plusDays(31),
                        endDate = today.plusDays(60),
                    )
                )

                val currentParentAccountId = tx.getCitizenMessageAccount(currentParent.id)
                val starterParentAccountId = tx.getCitizenMessageAccount(starterParent.id)
                val changerParentAccountId = tx.getCitizenMessageAccount(changerParent.id)

                // Create employee message account (sender)
                tx.insertDaycareAclRow(daycare.id, employee1.id, UserRole.UNIT_SUPERVISOR)
                val employeeAccountId = tx.upsertEmployeeMessageAccount(employee1.id)

                data class AccountIds(
                    val accountId1: MessageAccountId,
                    val accountId2: MessageAccountId,
                    val accountId3: MessageAccountId,
                    val accountId4: MessageAccountId,
                )

                AccountIds(
                    employeeAccountId,
                    currentParentAccountId,
                    starterParentAccountId,
                    changerParentAccountId,
                )
            }

        // Test getting accounts for area recipients
        val areaRecipients = setOf(MessageRecipient.Area(area.id))
        val areaAccounts =
            db.read { tx ->
                tx.getMessageAccountsForRecipients(
                    accountId = employeeAccountId,
                    recipients = areaRecipients,
                    filters = null,
                    date = today,
                )
            }

        assertEquals(2, areaAccounts.size)
        assertTrue(areaAccounts.any { it.first == currentParentAccountId })
        assertTrue(areaAccounts.any { it.first == changerParentAccountId })

        // Test getting accounts for current unit recipients
        val currentUnitAccounts =
            db.read { tx ->
                tx.getMessageAccountsForRecipients(
                    accountId = employeeAccountId,
                    recipients = setOf(MessageRecipient.Unit(daycare.id, false)),
                    filters = null,
                    date = today,
                )
            }

        assertEquals(2, currentUnitAccounts.size)
        assertTrue(currentUnitAccounts.any { it.first == currentParentAccountId })
        assertTrue(currentUnitAccounts.any { it.first == changerParentAccountId })

        // Test getting accounts for starter unit recipients
        val starterUnitAccounts =
            db.read { tx ->
                tx.getMessageAccountsForRecipients(
                    accountId = employeeAccountId,
                    recipients = setOf(MessageRecipient.Unit(daycare.id, true)),
                    filters = null,
                    date = today,
                )
            }

        assertEquals(1, starterUnitAccounts.size)
        assertTrue(starterUnitAccounts.any { it.first == starterParentAccountId })

        // Test getting accounts for current group recipients
        val currentGroupAccounts =
            db.read { tx ->
                tx.getMessageAccountsForRecipients(
                    accountId = employeeAccountId,
                    recipients = setOf(MessageRecipient.Group(group.id, false)),
                    filters = null,
                    date = today,
                )
            }

        assertEquals(2, currentGroupAccounts.size)
        assertTrue(currentGroupAccounts.any { it.first == currentParentAccountId })
        assertTrue(currentGroupAccounts.any { it.first == changerParentAccountId })

        // Test getting accounts for starter group recipients
        val starterGroupAccounts =
            db.read { tx ->
                tx.getMessageAccountsForRecipients(
                    accountId = employeeAccountId,
                    recipients = setOf(MessageRecipient.Group(group.id, true)),
                    filters = null,
                    date = today,
                )
            }

        assertEquals(1, starterGroupAccounts.size)
        assertTrue(starterGroupAccounts.any { it.first == starterParentAccountId })

        // Test getting accounts for specific child
        val childRecipients = setOf(MessageRecipient.Child(currentChild.id))
        val childAccounts =
            db.read { tx ->
                tx.getMessageAccountsForRecipients(
                    accountId = employeeAccountId,
                    recipients = childRecipients,
                    filters = null,
                    date = today,
                )
            }

        assertEquals(1, childAccounts.size)
        assertTrue(childAccounts.any { it.first == currentParentAccountId })

        // Test with citizen recipient
        val citizenRecipients = setOf(MessageRecipient.Citizen(currentParent.id))
        val citizenAccounts =
            db.read { tx ->
                tx.getMessageAccountsForRecipients(
                    accountId = employeeAccountId,
                    recipients = citizenRecipients,
                    filters = null,
                    date = today,
                )
            }

        assertEquals(1, citizenAccounts.size)
        assertTrue(citizenAccounts.any { it.first == currentParentAccountId })
    }

    @Suppress("unused")
    private val placementFilters: List<Pair<List<MessagingCategory>, Int>> =
        listOf(
            listOf(MessagingCategory.MESSAGING_DAYCARE) to 4,
            listOf(MessagingCategory.MESSAGING_PRESCHOOL) to 2,
            listOf(MessagingCategory.MESSAGING_CLUB) to 1,
            listOf(MessagingCategory.MESSAGING_CLUB, MessagingCategory.MESSAGING_DAYCARE) to 5,
            listOf(MessagingCategory.MESSAGING_PRESCHOOL, MessagingCategory.MESSAGING_DAYCARE) to 6,
            listOf<MessagingCategory>() to 7,
        )

    @ParameterizedTest(name = "messagingCategoryList, expectedRecipientCount={0}")
    @FieldSource("placementFilters")
    fun `getMessageAccountsForRecipients returns correct accounts for different placement type categories`(
        arg: Pair<List<MessagingCategory>, Int>
    ) {
        val (messagingCategoryList, expectedRecipientCount) = arg
        val today = LocalDate.now()
        val area = DevCareArea()
        val daycare =
            DevDaycare(areaId = area.id, enabledPilotFeatures = setOf(PilotFeature.MESSAGING))
        val daycareGroup = DevDaycareGroup(daycareId = daycare.id)
        val preschoolGroup = DevDaycareGroup(daycareId = daycare.id)
        val clubGroup = DevDaycareGroup(daycareId = daycare.id)

        val dayCareChild1a = DevPerson()
        val dayCareChild1b = DevPerson()
        val dayCareChild2 = DevPerson()
        val dayCareChild3 = DevPerson()
        val preSchoolChild1 = DevPerson()
        val preSchoolChild2 = DevPerson()
        val clubChild = DevPerson()

        val daycareParent1 = DevPerson()
        val daycareParent2 = DevPerson()
        val daycareParent3 = DevPerson()
        val preschoolParent1 = DevPerson()
        val preschoolParent2 = DevPerson()
        val clubParent = DevPerson()

        val (
            employeeAccountId,
        ) = db.transaction { tx ->
            tx.insert(area)
            tx.insert(daycare)
            tx.insert(daycareGroup)
            tx.insert(preschoolGroup)
            tx.insert(clubGroup)

            tx.insert(dayCareChild1a, DevPersonType.CHILD)
            tx.insert(dayCareChild1b, DevPersonType.CHILD)
            tx.insert(dayCareChild2, DevPersonType.CHILD)
            tx.insert(dayCareChild3, DevPersonType.CHILD)
            tx.insert(preSchoolChild1, DevPersonType.CHILD)
            tx.insert(preSchoolChild2, DevPersonType.CHILD)
            tx.insert(clubChild, DevPersonType.CHILD)

            tx.insert(daycareParent1, DevPersonType.ADULT)
            tx.insert(daycareParent2, DevPersonType.ADULT)
            tx.insert(daycareParent3, DevPersonType.ADULT)
            tx.insert(preschoolParent1, DevPersonType.ADULT)
            tx.insert(preschoolParent2, DevPersonType.ADULT)
            tx.insert(clubParent, DevPersonType.ADULT)

            tx.insertGuardian(guardianId = daycareParent1.id, childId = dayCareChild1a.id)
            tx.insertGuardian(guardianId = daycareParent1.id, childId = dayCareChild1b.id)
            tx.insertGuardian(guardianId = daycareParent2.id, childId = dayCareChild2.id)
            tx.insertGuardian(guardianId = daycareParent3.id, childId = dayCareChild3.id)
            tx.insertGuardian(guardianId = preschoolParent1.id, childId = preSchoolChild1.id)
            tx.insertGuardian(guardianId = preschoolParent2.id, childId = preSchoolChild2.id)
            tx.insertGuardian(guardianId = clubParent.id, childId = clubChild.id)

            // Assign different placement types to form the expected categories
            val daycarePlacement1 =
                tx.insert(
                    DevPlacement(
                        childId = dayCareChild1a.id,
                        unitId = daycare.id,
                        startDate = today.minusDays(10),
                        endDate = today.plusDays(30),
                        type = PlacementType.DAYCARE,
                    )
                )
            val daycarePlacement2 =
                tx.insert(
                    DevPlacement(
                        childId = dayCareChild1b.id,
                        unitId = daycare.id,
                        startDate = today.minusDays(10),
                        endDate = today.plusDays(30),
                        type = PlacementType.DAYCARE_PART_TIME,
                    )
                )
            val daycarePlacement3 =
                tx.insert(
                    DevPlacement(
                        childId = dayCareChild2.id,
                        unitId = daycare.id,
                        startDate = today.minusDays(10),
                        endDate = today.plusDays(30),
                        type = PlacementType.DAYCARE,
                    )
                )
            val daycarePlacement4 =
                tx.insert(
                    DevPlacement(
                        childId = dayCareChild3.id,
                        unitId = daycare.id,
                        startDate = today.minusDays(10),
                        endDate = today.plusDays(30),
                        type = PlacementType.DAYCARE_FIVE_YEAR_OLDS,
                    )
                )

            val preschoolPlacement1 =
                tx.insert(
                    DevPlacement(
                        childId = preSchoolChild1.id,
                        unitId = daycare.id,
                        startDate = today.minusDays(10),
                        endDate = today.plusDays(30),
                        type = PlacementType.PRESCHOOL,
                    )
                )
            val preschoolPlacement2 =
                tx.insert(
                    DevPlacement(
                        childId = preSchoolChild2.id,
                        unitId = daycare.id,
                        startDate = today.minusDays(10),
                        endDate = today.plusDays(30),
                        type = PlacementType.PRESCHOOL_DAYCARE,
                    )
                )
            val clubPlacement1 =
                tx.insert(
                    DevPlacement(
                        childId = clubChild.id,
                        unitId = daycare.id,
                        startDate = today.minusDays(10),
                        endDate = today.plusDays(30),
                        type = PlacementType.CLUB,
                    )
                )

            tx.insert(
                DevDaycareGroupPlacement(
                    daycareGroupId = daycareGroup.id,
                    daycarePlacementId = daycarePlacement1,
                    startDate = today.minusDays(10),
                    endDate = today.plusDays(30),
                )
            )
            tx.insert(
                DevDaycareGroupPlacement(
                    daycareGroupId = daycareGroup.id,
                    daycarePlacementId = daycarePlacement2,
                    startDate = today.minusDays(10),
                    endDate = today.plusDays(30),
                )
            )
            tx.insert(
                DevDaycareGroupPlacement(
                    daycareGroupId = daycareGroup.id,
                    daycarePlacementId = daycarePlacement3,
                    startDate = today.minusDays(10),
                    endDate = today.plusDays(30),
                )
            )
            tx.insert(
                DevDaycareGroupPlacement(
                    daycareGroupId = daycareGroup.id,
                    daycarePlacementId = daycarePlacement4,
                    startDate = today.minusDays(10),
                    endDate = today.plusDays(30),
                )
            )
            tx.insert(
                DevDaycareGroupPlacement(
                    daycareGroupId = preschoolGroup.id,
                    daycarePlacementId = preschoolPlacement1,
                    startDate = today.minusDays(10),
                    endDate = today.plusDays(30),
                )
            )
            tx.insert(
                DevDaycareGroupPlacement(
                    daycareGroupId = preschoolGroup.id,
                    daycarePlacementId = preschoolPlacement2,
                    startDate = today.minusDays(10),
                    endDate = today.plusDays(30),
                )
            )
            tx.insert(
                DevDaycareGroupPlacement(
                    daycareGroupId = clubGroup.id,
                    daycarePlacementId = clubPlacement1,
                    startDate = today.minusDays(10),
                    endDate = today.plusDays(30),
                )
            )

            // Create employee message account (sender)
            tx.insertDaycareAclRow(daycare.id, employee1.id, UserRole.UNIT_SUPERVISOR)
            val employeeAccountId = tx.upsertEmployeeMessageAccount(employee1.id)

            data class AccountIds(val accountId1: MessageAccountId)

            AccountIds(employeeAccountId)
        }

        // Set filter to null when no categories are selected
        val postMessageFilter =
            messagingCategoryList
                .takeIf { it.isNotEmpty() }
                ?.let { MessageController.PostMessageFilters(placementTypes = it) }

        val areaRecipients = setOf(MessageRecipient.Area(area.id))

        val recipientMessageAccounts =
            db.read { tx ->
                tx.getMessageAccountsForRecipients(
                    accountId = employeeAccountId,
                    recipients = areaRecipients,
                    filters = postMessageFilter,
                    date = today,
                )
            }

        assertEquals(expectedRecipientCount, recipientMessageAccounts.size)
    }

    /*
     * TODO: Tests in this file should be moved to MessageIntegrationTest because creating a thread like this
     * doesn't reflect reality
     */
    private fun createThread(
        title: String,
        content: String,
        sender: MessageAccount,
        recipientAccounts: List<MessageAccount>,
        now: HelsinkiDateTime = sendTime,
    ): MessageThreadId =
        db.transaction { tx ->
            val recipientIds = recipientAccounts.map { it.id }.toSet()
            val contentId = tx.insertMessageContent(content, sender.id)
            val threadId =
                tx.insertThread(
                    MessageType.MESSAGE,
                    title,
                    urgent = false,
                    sensitive = false,
                    isCopy = false,
                )
            val messageId =
                tx.insertMessage(
                    now = now,
                    contentId = contentId,
                    threadId = threadId,
                    sender = sender.id,
                    sentAt = now,
                    recipientNames =
                        tx.getAccountNames(
                            recipientIds,
                            testFeatureConfig.serviceWorkerMessageAccountName,
                            testFeatureConfig.financeMessageAccountName,
                        ),
                    municipalAccountName = "Espoo",
                    serviceWorkerAccountName = "Espoon palveluohjaus",
                    financeAccountName = "Espoon asiakasmaksut",
                )
            tx.insertRecipients(listOf(messageId to recipientAccounts.map { it.id }.toSet()))
            tx.upsertSenderThreadParticipants(sender.id, listOf(threadId), now)
            tx.upsertRecipientThreadParticipants(contentId, now)
            threadId
        }

    /*
     * TODO: Tests in this file should be moved to MessageIntegrationTest because replying to a thread like this
     * doesn't reflect reality
     */
    private fun replyToThread(
        threadId: MessageThreadId,
        sender: MessageAccount,
        recipients: Set<MessageAccount>,
        content: String,
        repliesToMessageId: MessageId? = null,
        now: HelsinkiDateTime = sendTime,
    ) =
        db.transaction { tx ->
            val recipientIds = recipients.map { it.id }.toSet()
            val contentId = tx.insertMessageContent(content = content, sender = sender.id)
            val messageId =
                tx.insertMessage(
                    now = now,
                    contentId = contentId,
                    threadId = threadId,
                    sender = sender.id,
                    sentAt = now,
                    repliesToMessageId = repliesToMessageId,
                    recipientNames = listOf(),
                    municipalAccountName = "Espoo",
                    serviceWorkerAccountName = "Espoon palveluohjaus",
                    financeAccountName = "Espoon asiakasmaksut",
                )
            tx.insertRecipients(listOf(messageId to recipientIds))
            tx.upsertSenderThreadParticipants(sender.id, listOf(threadId), now)
            tx.upsertRecipientThreadParticipants(contentId, now)
        }

    private fun unreadMessagesCount(personId: PersonId) =
        db.read { tx ->
            tx.getUnreadMessagesCounts(
                    accessControl.requireAuthorizationFilter(
                        tx,
                        AuthenticatedUser.Citizen(personId, CitizenAuthLevel.WEAK),
                        clock,
                        Action.MessageAccount.ACCESS,
                    )
                )
                .firstOrNull()
                ?.unreadCount ?: 0
        }

    private fun Database.Transaction.getAccount(person: DevPerson) =
        MessageAccount(
            id = getCitizenMessageAccount(person.id),
            name = "${person.lastName} ${person.firstName}",
            type = AccountType.CITIZEN,
            personId = person.id,
        )

    private fun Database.Transaction.createAccount(group: DevDaycareGroup) =
        MessageAccount(
            id = createDaycareGroupMessageAccount(group.id),
            name = group.name,
            type = AccountType.GROUP,
            personId = null,
        )

    private fun Database.Transaction.createAccount(employee: DevEmployee) =
        MessageAccount(
            id = upsertEmployeeMessageAccount(employee.id),
            name = "${employee.lastName} ${employee.firstName}",
            type = AccountType.PERSONAL,
            personId = null,
        )

    private fun deletePlacement(placement: PlacementId) =
        db.transaction {
            it.createUpdate { sql("DELETE FROM placement WHERE id = ${bind(placement)}") }.execute()
        }

    private data class RecipientTestData(
        val personId: PersonId,
        val daycareId: DaycareId,
        val group1Id: GroupId,
        val group1Account: MessageAccount,
        val group2Id: GroupId,
        val group2Account: MessageAccount,
        val areaId: AreaId,
    )

    private fun prepareDataForRecipientsTest(tx: Database.Transaction): RecipientTestData {
        val areaId = tx.insert(DevCareArea())
        val daycareId =
            tx.insert(
                DevDaycare(
                    areaId = areaId,
                    language = Language.fi,
                    enabledPilotFeatures = setOf(PilotFeature.MESSAGING),
                )
            )
        tx.insertDaycareAclRow(
            daycareId = daycareId,
            employeeId = employee1.id,
            role = UserRole.UNIT_SUPERVISOR,
        )
        tx.insertDaycareAclRow(
            daycareId = daycareId,
            employeeId = employee2.id,
            role = UserRole.SPECIAL_EDUCATION_TEACHER,
        )
        val group1 = DevDaycareGroup(daycareId = daycareId, name = "Testiläiset")
        val group2 = DevDaycareGroup(daycareId = daycareId, name = "Testiläiset 2")
        listOf(group1, group2).forEach { tx.insert(it) }
        val group1Account = tx.createAccount(group1)
        val group2Account = tx.createAccount(group2)

        val childId =
            tx.insert(
                DevPerson(firstName = "Firstname", lastName = "Test Child"),
                DevPersonType.CHILD,
            )

        tx.insertGuardian(guardianId = person1.id, childId = childId)
        return RecipientTestData(
            childId,
            daycareId,
            group1.id,
            group1Account,
            group2.id,
            group2Account,
            areaId,
        )
    }
}
