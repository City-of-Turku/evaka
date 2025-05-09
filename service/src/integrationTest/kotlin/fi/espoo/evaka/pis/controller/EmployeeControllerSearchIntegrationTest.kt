// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.pis.controller

import fi.espoo.evaka.FullApplicationTest
import fi.espoo.evaka.daycare.domain.ProviderType
import fi.espoo.evaka.pis.DaycareRole
import fi.espoo.evaka.pis.controllers.EmployeeController
import fi.espoo.evaka.pis.controllers.SearchEmployeeRequest
import fi.espoo.evaka.shared.EmployeeId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.auth.UserRole
import fi.espoo.evaka.shared.dev.insert
import fi.espoo.evaka.shared.domain.RealEvakaClock
import fi.espoo.evaka.testArea
import fi.espoo.evaka.testDaycare
import fi.espoo.evaka.testDecisionMaker_1
import fi.espoo.evaka.testDecisionMaker_2
import fi.espoo.evaka.testDecisionMaker_3
import fi.espoo.evaka.unitSupervisorOfTestDaycare
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.fail
import org.springframework.beans.factory.annotation.Autowired

class EmployeeControllerSearchIntegrationTest : FullApplicationTest(resetDbBeforeEach = true) {

    @Autowired lateinit var controller: EmployeeController

    @BeforeEach
    fun setUp() {
        db.transaction { tx ->
            tx.insert(testDecisionMaker_1.copy(roles = setOf(UserRole.SERVICE_WORKER)))
            tx.insert(testDecisionMaker_2)
            tx.insert(testDecisionMaker_3)
            tx.insert(testArea)
            tx.insert(testDaycare)
            tx.insert(
                unitSupervisorOfTestDaycare,
                mapOf(testDaycare.id to UserRole.UNIT_SUPERVISOR),
            )
        }
    }

    @Test
    fun `admin searches employees`() {
        val user = AuthenticatedUser.Employee(EmployeeId(UUID.randomUUID()), setOf(UserRole.ADMIN))
        val body =
            controller.searchEmployees(
                dbInstance(),
                user,
                RealEvakaClock(),
                SearchEmployeeRequest(
                    searchTerm = null,
                    hideDeactivated = false,
                    globalRoles = emptySet(),
                    unitRoles = emptySet(),
                    unitProviderTypes = emptySet(),
                ),
            )

        assertEquals(4, body.size)

        val decisionMaker =
            body.find { it.id == testDecisionMaker_1.id } ?: fail("decisionMaker not found")
        assertEquals(listOf(UserRole.SERVICE_WORKER), decisionMaker.globalRoles)
        assertEquals(0, decisionMaker.daycareRoles.size)

        val supervisor =
            body.find { it.id == unitSupervisorOfTestDaycare.id } ?: fail("supervisor not found")
        assertEquals(0, supervisor.globalRoles.size)
        assertEquals(
            listOf(
                DaycareRole(
                    daycareId = testDaycare.id,
                    daycareName = testDaycare.name,
                    role = UserRole.UNIT_SUPERVISOR,
                    endDate = null,
                )
            ),
            supervisor.daycareRoles,
        )
    }

    @Test
    fun `admin searches employees with free text`() {
        val user = AuthenticatedUser.Employee(EmployeeId(UUID.randomUUID()), setOf(UserRole.ADMIN))
        val body =
            controller.searchEmployees(
                dbInstance(),
                user,
                RealEvakaClock(),
                SearchEmployeeRequest(
                    searchTerm = "super",
                    hideDeactivated = false,
                    globalRoles = emptySet(),
                    unitRoles = emptySet(),
                    unitProviderTypes = emptySet(),
                ),
            )
        assertEquals(1, body.size)
        assertEquals("Sammy", body[0].firstName)
        assertEquals("Supervisor", body[0].lastName)
    }

    @Test
    fun `admin searches employees with global roles`() {
        val user = AuthenticatedUser.Employee(EmployeeId(UUID.randomUUID()), setOf(UserRole.ADMIN))
        val body =
            controller.searchEmployees(
                dbInstance(),
                user,
                RealEvakaClock(),
                SearchEmployeeRequest(
                    searchTerm = null,
                    hideDeactivated = false,
                    globalRoles = setOf(UserRole.SERVICE_WORKER),
                    unitRoles = emptySet(),
                    unitProviderTypes = emptySet(),
                ),
            )
        assertEquals(1, body.size)
        assertTrue { body.all { it.globalRoles.toSet().contains(UserRole.SERVICE_WORKER) } }
    }

    @Test
    fun `admin searches employees with unit roles`() {
        val user = AuthenticatedUser.Employee(EmployeeId(UUID.randomUUID()), setOf(UserRole.ADMIN))
        val body =
            controller.searchEmployees(
                dbInstance(),
                user,
                RealEvakaClock(),
                SearchEmployeeRequest(
                    searchTerm = null,
                    hideDeactivated = false,
                    globalRoles = emptySet(),
                    unitRoles = setOf(UserRole.UNIT_SUPERVISOR),
                    unitProviderTypes = emptySet(),
                ),
            )
        assertEquals(1, body.size)
        assertTrue {
            body.all {
                it.daycareRoles.map { role -> role.role }.toSet().contains(UserRole.UNIT_SUPERVISOR)
            }
        }
    }

    @Test
    fun `admin searches employees with unit roles and provider types`() {
        val user = AuthenticatedUser.Employee(EmployeeId(UUID.randomUUID()), setOf(UserRole.ADMIN))
        val body1 =
            controller.searchEmployees(
                dbInstance(),
                user,
                RealEvakaClock(),
                SearchEmployeeRequest(
                    searchTerm = null,
                    hideDeactivated = false,
                    globalRoles = emptySet(),
                    unitRoles = setOf(UserRole.UNIT_SUPERVISOR),
                    unitProviderTypes = setOf(ProviderType.MUNICIPAL),
                ),
            )
        assertEquals(1, body1.size)
        assertTrue {
            body1.all {
                it.daycareRoles.map { role -> role.role }.toSet().contains(UserRole.UNIT_SUPERVISOR)
            }
        }
        val body2 =
            controller.searchEmployees(
                dbInstance(),
                user,
                RealEvakaClock(),
                SearchEmployeeRequest(
                    searchTerm = null,
                    hideDeactivated = false,
                    globalRoles = emptySet(),
                    unitRoles = setOf(UserRole.UNIT_SUPERVISOR),
                    unitProviderTypes = setOf(ProviderType.PURCHASED),
                ),
            )
        assertEquals(0, body2.size)
    }
}
