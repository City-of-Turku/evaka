// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.varda

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonProperty
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.varda.integration.VardaClient
import mu.KotlinLogging
import org.jdbi.v3.core.kotlin.mapTo
import java.time.Instant
import java.util.UUID

private val logger = KotlinLogging.logger {}

fun updateOrganizer(db: Database.Connection, client: VardaClient, organizerName: String) {
    try {
        val organizer = db.read { getStaleOrganizer(it, organizerName) }!!
        client.updateOrganizer(organizer.toUpdateObject())
        db.transaction { setOrganizerUploaded(it, organizer) }
    } catch (e: Exception) {
        logger.error { "VardaUpdate: failed to update organizer: $e" }
    }
}

fun getStaleOrganizer(tx: Database.Read, organizerName: String): VardaOrganizer? {
    //language=SQL
    val sql =
        """
        SELECT id, varda_organizer_id, varda_organizer_oid, url, email, phone, municipality_code
        FROM varda_organizer
        WHERE organizer = :organizer
        AND (updated_at > uploaded_at OR uploaded_at IS NULL)
        """.trimIndent()

    return tx.createQuery(sql)
        .bind("organizer", organizerName)
        .mapTo<VardaOrganizer>()
        .firstOrNull()
}

fun setOrganizerUploaded(tx: Database.Transaction, organizer: VardaOrganizer) {
    //language=SQL
    val sql =
        """
        UPDATE varda_organizer
        SET uploaded_at = now()
        WHERE id = :id
        """.trimIndent()
    tx.createUpdate(sql)
        .bind("id", organizer.id)
        .execute()
}

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
data class VardaOrganizer(
    val id: UUID,
    val vardaOrganizerId: Long,
    val vardaOrganizerOid: String?,
    val url: String?,
    val email: String?,
    val phone: String?,
    val municipalityCode: String?,
    val uploadedAt: Instant? = null
) {
    fun toUpdateObject(): VardaUpdateOrganizer = VardaUpdateOrganizer(vardaOrganizerId, email, phone)
}

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
data class VardaUpdateOrganizer(
    @JsonIgnore
    val vardaOrganizerId: Long,
    @JsonProperty("sahkopostiosoite")
    val email: String?,
    @JsonProperty("puhelinnumero")
    val phone: String?
)
