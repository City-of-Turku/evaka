// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.shared.security

import fi.espoo.evaka.application.ApplicationType
import fi.espoo.evaka.application.persistence.daycare.DaycareFormV0
import fi.espoo.evaka.attachment.AttachmentParent
import fi.espoo.evaka.attachment.insertAttachment
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.auth.CitizenAuthLevel
import fi.espoo.evaka.shared.auth.UserRole
import fi.espoo.evaka.shared.dev.DevCareArea
import fi.espoo.evaka.shared.dev.DevDaycare
import fi.espoo.evaka.shared.dev.DevPerson
import fi.espoo.evaka.shared.dev.DevPersonType
import fi.espoo.evaka.shared.dev.insert
import fi.espoo.evaka.shared.dev.insertTestApplication
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import fi.espoo.evaka.shared.domain.MockEvakaClock
import fi.espoo.evaka.shared.security.actionrule.HasGlobalRole
import fi.espoo.evaka.shared.security.actionrule.IsCitizen
import fi.espoo.evaka.test.getValidDaycareApplication
import java.time.LocalDateTime
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class AttachmentAccessControlTest : AccessControlTest() {
    private val clock = MockEvakaClock(HelsinkiDateTime.of(LocalDateTime.of(2022, 1, 1, 12, 0)))

    private val area = DevCareArea()
    private val unit = DevDaycare(areaId = area.id)

    @BeforeEach
    fun beforeEach() {
        db.transaction { tx ->
            tx.insert(area)
            tx.insert(unit)
        }
    }

    @Test
    fun `HasGlobalRole andAttachmentWasUploadedByAnyEmployee`() {
        val permittedEmployee =
            createTestEmployee(setOf(UserRole.SERVICE_WORKER, UserRole.FINANCE_ADMIN))
        val deniedEmployee = createTestEmployee(setOf(UserRole.DIRECTOR))
        val permittedRoles = arrayOf(UserRole.REPORT_VIEWER, UserRole.FINANCE_ADMIN)

        val action = Action.Attachment.READ_APPLICATION_ATTACHMENT
        rules.add(action, HasGlobalRole(*permittedRoles).andAttachmentWasUploadedByAnyEmployee())

        val uploaderEmployee = createTestEmployee(emptySet())
        val employeeAttachmentId = insertApplicationAttachment(uploaderEmployee)
        db.read { tx ->
            assertTrue(
                accessControl.hasPermissionFor(
                    tx,
                    permittedEmployee,
                    clock,
                    action,
                    employeeAttachmentId,
                )
            )
            assertFalse(
                accessControl.hasPermissionFor(
                    tx,
                    deniedEmployee,
                    clock,
                    action,
                    employeeAttachmentId,
                )
            )
        }

        val uploaderCitizen = createTestCitizen(CitizenAuthLevel.STRONG)
        val citizenAttachmentId = insertApplicationAttachment(uploaderCitizen)
        db.read { tx ->
            assertFalse(
                accessControl.hasPermissionFor(
                    tx,
                    permittedEmployee,
                    clock,
                    action,
                    citizenAttachmentId,
                )
            )
        }
    }

    @Test
    fun `IsCitizen uploaderOfAttachment`() {
        val action = Action.Attachment.READ_APPLICATION_ATTACHMENT
        rules.add(action, IsCitizen(allowWeakLogin = false).uploaderOfAttachment())
        val uploaderCitizen = createTestCitizen(CitizenAuthLevel.STRONG)
        val otherCitizen = createTestCitizen(CitizenAuthLevel.STRONG)

        val attachmentId = insertApplicationAttachment(uploaderCitizen)
        db.read { tx ->
            assertTrue(
                accessControl.hasPermissionFor(tx, uploaderCitizen, clock, action, attachmentId)
            )
            assertFalse(
                accessControl.hasPermissionFor(tx, otherCitizen, clock, action, attachmentId)
            )
            assertFalse(
                accessControl.hasPermissionFor(
                    tx,
                    uploaderCitizen.copy(authLevel = CitizenAuthLevel.WEAK),
                    clock,
                    action,
                    attachmentId,
                )
            )
        }
    }

    private fun insertApplicationAttachment(user: AuthenticatedUser) =
        db.transaction { tx ->
            val guardianId = tx.insert(DevPerson(), DevPersonType.RAW_ROW)
            val childId = tx.insert(DevPerson(), DevPersonType.RAW_ROW)
            val applicationId =
                tx.insertTestApplication(
                    guardianId = guardianId,
                    childId = childId,
                    type = ApplicationType.DAYCARE,
                    document =
                        DaycareFormV0.fromApplication2(
                            getValidDaycareApplication(preferredUnit = unit)
                        ),
                )
            tx.insertAttachment(
                user,
                clock.now(),
                "test.pdf",
                "application/pdf",
                AttachmentParent.Application(applicationId),
                type = null,
            )
        }
}
