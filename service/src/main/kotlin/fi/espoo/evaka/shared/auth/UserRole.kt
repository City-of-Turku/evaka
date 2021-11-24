// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.shared.auth

import fi.espoo.evaka.shared.domain.Forbidden

enum class UserRole {
    END_USER,
    CITIZEN_WEAK,

    ADMIN,
    REPORT_VIEWER,
    DIRECTOR,
    FINANCE_ADMIN,
    SERVICE_WORKER,

    UNIT_SUPERVISOR,
    STAFF,
    SPECIAL_EDUCATION_TEACHER,
    MOBILE,

    GROUP_STAFF;

    companion object {
        val SCOPED_ROLES = setOf(UNIT_SUPERVISOR, STAFF, SPECIAL_EDUCATION_TEACHER, MOBILE, GROUP_STAFF)
    }
}

interface RoleContainer {
    val roles: Set<UserRole>

    fun hasOneOfRoles(vararg requiredRoles: UserRole) = requiredRoles.any { roles.contains(it) }

    fun requireOneOfRoles(vararg roles: UserRole) {
        if (!hasOneOfRoles(*roles)) throw Forbidden("Permission denied")
    }

    fun requireAnyEmployee() = requireOneOfRoles(
        UserRole.ADMIN,
        UserRole.DIRECTOR,
        UserRole.REPORT_VIEWER,
        UserRole.FINANCE_ADMIN,
        UserRole.SERVICE_WORKER,
        UserRole.UNIT_SUPERVISOR,
        UserRole.STAFF,
        UserRole.SPECIAL_EDUCATION_TEACHER,
        UserRole.MOBILE
    )
}
