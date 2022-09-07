// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.shared.auth

import fi.espoo.evaka.shared.DaycareId
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.security.PilotFeature
import org.jdbi.v3.core.Jdbi

sealed class AclAuthorization {
    abstract fun isAuthorized(id: DaycareId): Boolean
    abstract val ids: Set<DaycareId>?

    object All : AclAuthorization() {
        override fun isAuthorized(id: DaycareId): Boolean = true
        override val ids: Set<DaycareId>? = null
    }

    data class Subset(override val ids: Set<DaycareId>) : AclAuthorization() {
        override fun isAuthorized(id: DaycareId): Boolean = ids.contains(id)
    }

    fun isEmpty(): Boolean {
        return this is Subset && this.ids.isEmpty()
    }
}

class AccessControlList(private val jdbi: Jdbi) {
    fun getAuthorizedUnits(user: AuthenticatedUser): AclAuthorization = getAuthorizedUnits(user, UserRole.SCOPED_ROLES)

    fun getAuthorizedUnits(user: AuthenticatedUser, roles: Set<UserRole>): AclAuthorization =
        if (user is AuthenticatedUser.Employee && setOf(
                UserRole.ADMIN,
                UserRole.FINANCE_ADMIN,
                UserRole.SERVICE_WORKER,
                UserRole.DIRECTOR,
                UserRole.REPORT_VIEWER
            ).any { user.globalRoles.contains(it) }
        ) {
            AclAuthorization.All
        } else {
            AclAuthorization.Subset(Database(jdbi).connect { db -> db.read { it.selectAuthorizedDaycares(user, roles) } })
        }

    @Deprecated("use Action model instead", replaceWith = ReplaceWith(""))
    fun getRolesForPilotFeature(user: AuthenticatedUser.Employee, feature: PilotFeature): Set<UserRole> =
        user.globalRoles + Database(jdbi).connect { db ->
            db.read {
                it.createQuery(
                    // language=SQL
                    """
SELECT role
FROM daycare d
JOIN daycare_acl acl
ON d.id = acl.daycare_id
WHERE :pilotFeature = ANY(d.enabled_pilot_features)
AND employee_id = :userId
                    """.trimIndent()
                ).bind("userId", user.id).bind("pilotFeature", feature).mapTo<UserRole>().toSet()
            }
        }
}

private fun Database.Read.selectAuthorizedDaycares(user: AuthenticatedUser, roles: Set<UserRole>? = null): Set<DaycareId> {
    if (roles?.isEmpty() == true) return emptySet()

    return createQuery(
        "SELECT daycare_id FROM daycare_acl_view WHERE employee_id = :userId AND (:roles::user_role[] IS NULL OR role = ANY(:roles::user_role[]))"
    )
        .bind("userId", user.rawId())
        .bind("roles", roles)
        .mapTo<DaycareId>()
        .toSet()
}
