// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.invoicing.controller

import fi.espoo.evaka.Audit
import fi.espoo.evaka.AuditId
import fi.espoo.evaka.invoicing.data.deleteDraftInvoices
import fi.espoo.evaka.invoicing.data.getDetailedInvoice
import fi.espoo.evaka.invoicing.data.getHeadOfFamilyInvoices
import fi.espoo.evaka.invoicing.data.getReplacingInvoiceFor
import fi.espoo.evaka.invoicing.data.paginatedSearch
import fi.espoo.evaka.invoicing.data.setReplacementDraftSent
import fi.espoo.evaka.invoicing.domain.InvoiceDetailed
import fi.espoo.evaka.invoicing.domain.InvoiceReplacementReason
import fi.espoo.evaka.invoicing.domain.InvoiceStatus
import fi.espoo.evaka.invoicing.domain.InvoiceSummary
import fi.espoo.evaka.invoicing.service.InvoiceCodes
import fi.espoo.evaka.invoicing.service.InvoiceGenerator
import fi.espoo.evaka.invoicing.service.InvoiceService
import fi.espoo.evaka.invoicing.service.markManuallySent
import fi.espoo.evaka.shared.DaycareId
import fi.espoo.evaka.shared.InvoiceId
import fi.espoo.evaka.shared.PersonId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.BadRequest
import fi.espoo.evaka.shared.domain.EvakaClock
import fi.espoo.evaka.shared.domain.NotFound
import fi.espoo.evaka.shared.security.AccessControl
import fi.espoo.evaka.shared.security.Action
import java.time.LocalDate
import java.time.YearMonth
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

enum class InvoiceDistinctiveParams {
    MISSING_ADDRESS
}

enum class InvoiceSortParam {
    HEAD_OF_FAMILY,
    CHILDREN,
    START,
    END,
    SUM,
    STATUS,
    CREATED_AT,
}

@RestController
@RequestMapping("/employee/invoices")
class InvoiceController(
    private val service: InvoiceService,
    private val generator: InvoiceGenerator,
    private val accessControl: AccessControl,
) {
    @PostMapping("/search")
    fun searchInvoices(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @RequestBody body: SearchInvoicesRequest,
    ): PagedInvoiceSummaryResponses {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Global.SEARCH_INVOICES,
                    )
                    val paged =
                        tx.paginatedSearch(
                            body.page,
                            pageSize = 200,
                            body.sortBy ?: InvoiceSortParam.STATUS,
                            body.sortDirection ?: SortDirection.DESC,
                            body.status,
                            body.area ?: emptyList(),
                            body.unit,
                            body.distinctions ?: emptyList(),
                            body.searchTerms ?: "",
                            body.periodStart,
                            body.periodEnd,
                        )
                    val permittedActions =
                        accessControl.getPermittedActions<InvoiceId, Action.Invoice>(
                            tx,
                            user,
                            clock,
                            paged.data.map { it.id },
                        )
                    PagedInvoiceSummaryResponses(
                        data =
                            paged.data.map {
                                InvoiceSummaryResponse(it, permittedActions[it.id] ?: emptySet())
                            },
                        total = paged.total,
                        pages = paged.pages,
                    )
                }
            }
            .also { Audit.InvoicesSearch.log(meta = mapOf("total" to it.total)) }
    }

    data class InvoiceSummaryResponse(
        val data: InvoiceSummary,
        val permittedActions: Set<Action.Invoice>,
    )

    data class PagedInvoiceSummaryResponses(
        val data: List<InvoiceSummaryResponse>,
        val total: Int,
        val pages: Int,
    )

    @PostMapping("/create-drafts")
    fun createDraftInvoices(db: Database, user: AuthenticatedUser.Employee, clock: EvakaClock) {
        db.connect { dbc ->
            dbc.transaction {
                accessControl.requirePermissionFor(
                    it,
                    user,
                    clock,
                    Action.Global.CREATE_DRAFT_INVOICES,
                )
                val firstOfLastMonth = clock.today().withDayOfMonth(1).minusMonths(1)
                generator.generateAllDraftInvoices(
                    it,
                    YearMonth.of(firstOfLastMonth.year, firstOfLastMonth.month),
                )
            }
        }
        Audit.InvoicesCreate.log()
    }

    @PostMapping("/delete-drafts")
    fun deleteDraftInvoices(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @RequestBody invoiceIds: List<InvoiceId>,
    ) {
        db.connect { dbc ->
            dbc.transaction {
                accessControl.requirePermissionFor(
                    it,
                    user,
                    clock,
                    Action.Invoice.DELETE,
                    invoiceIds,
                )
                it.deleteDraftInvoices(invoiceIds)
            }
        }
        Audit.InvoicesDeleteDrafts.log(targetId = AuditId(invoiceIds))
    }

    @PostMapping("/send")
    fun sendInvoices(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) @RequestParam invoiceDate: LocalDate?,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) @RequestParam dueDate: LocalDate?,
        @RequestBody invoiceIds: List<InvoiceId>,
    ) {
        db.connect { dbc ->
            dbc.transaction {
                accessControl.requirePermissionFor(it, user, clock, Action.Invoice.SEND, invoiceIds)
                service.sendInvoices(
                    it,
                    user.evakaUserId,
                    clock.now(),
                    invoiceIds,
                    invoiceDate,
                    dueDate,
                )
            }
        }
        Audit.InvoicesSend.log(
            targetId = AuditId(invoiceIds),
            meta = mapOf("invoiceDate" to invoiceDate, "dueDate" to dueDate),
        )
    }

    @PostMapping("/resend")
    fun resendInvoices(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @RequestBody invoiceIds: List<InvoiceId>,
    ) {
        db.connect { dbc ->
            dbc.transaction {
                accessControl.requirePermissionFor(
                    it,
                    user,
                    clock,
                    Action.Invoice.RESEND,
                    invoiceIds,
                )
                service.resendInvoices(it, user.evakaUserId, clock.now(), invoiceIds)
            }
        }
        Audit.InvoicesResend.log(
            targetId = AuditId(invoiceIds),
            meta = mapOf("resendDate" to clock.now()),
        )
    }

    @PostMapping("/send/by-date")
    fun sendInvoicesByDate(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @RequestBody payload: InvoicePayload,
    ) {
        db.connect { dbc ->
            dbc.transaction { tx ->
                val invoiceIds = service.getInvoiceIds(tx, payload.from, payload.to, payload.areas)
                accessControl.requirePermissionFor(tx, user, clock, Action.Invoice.SEND, invoiceIds)
                service.sendInvoices(
                    tx,
                    user.evakaUserId,
                    clock.now(),
                    invoiceIds,
                    payload.invoiceDate,
                    payload.dueDate,
                )
            }
        }
        Audit.InvoicesSendByDate.log(
            meta =
                mapOf(
                    "from" to payload.from,
                    "to" to payload.to,
                    "areas" to payload.areas,
                    "invoiceDate" to payload.invoiceDate,
                    "dueDate" to payload.dueDate,
                )
        )
    }

    @PostMapping("/resend/by-date")
    fun resendInvoicesByDate(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @RequestBody payload: InvoicePayload,
    ) {
        db.connect { dbc ->
            dbc.transaction { tx ->
                val invoiceIds =
                    service.getInvoiceIds(
                        tx,
                        payload.from,
                        payload.to,
                        payload.areas,
                        InvoiceStatus.SENT,
                    )
                accessControl.requirePermissionFor(
                    tx,
                    user,
                    clock,
                    Action.Invoice.RESEND,
                    invoiceIds,
                )
                service.resendInvoices(tx, user.evakaUserId, clock.now(), invoiceIds)
            }
        }
        Audit.InvoicesResendByDate.log(
            meta =
                mapOf(
                    "from" to payload.from,
                    "to" to payload.to,
                    "areas" to payload.areas,
                    "invoiceDate" to payload.invoiceDate,
                    "dueDate" to payload.dueDate,
                )
        )
    }

    @PostMapping("/mark-sent")
    fun markInvoicesSent(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @RequestBody invoiceIds: List<InvoiceId>,
    ) {
        db.connect { dbc ->
            dbc.transaction {
                accessControl.requirePermissionFor(
                    it,
                    user,
                    clock,
                    Action.Invoice.MARK_SENT,
                    invoiceIds,
                )
                it.markManuallySent(user, clock.now(), invoiceIds)
            }
        }
        Audit.InvoicesMarkSent.log(targetId = AuditId(invoiceIds))
    }

    @GetMapping("/{id}")
    fun getInvoice(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @PathVariable id: InvoiceId,
    ): InvoiceDetailedResponse {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(tx, user, clock, Action.Invoice.READ, id)
                    val invoice =
                        tx.getDetailedInvoice(id)
                            ?: throw NotFound("No invoice found with given ID ($id)")
                    val replacedInvoice =
                        invoice.replacedInvoiceId?.let {
                            tx.getDetailedInvoice(invoice.replacedInvoiceId)?.takeIf {
                                accessControl.hasPermissionFor(
                                    tx,
                                    user,
                                    clock,
                                    Action.Invoice.READ,
                                    it.id,
                                )
                            }
                        }
                    val replacedByInvoice =
                        tx.getReplacingInvoiceFor(invoice.id)?.takeIf {
                            accessControl.hasPermissionFor(
                                tx,
                                user,
                                clock,
                                Action.Invoice.READ,
                                it.id,
                            )
                        }

                    val permittedActions =
                        accessControl.getPermittedActions<InvoiceId, Action.Invoice>(
                            tx,
                            user,
                            clock,
                            invoice.id,
                        )
                    InvoiceDetailedResponse(
                        invoice,
                        replacedInvoice,
                        replacedByInvoice,
                        permittedActions,
                    )
                }
            }
            .also { Audit.InvoicesRead.log(targetId = AuditId(id)) }
    }

    data class InvoiceDetailedResponse(
        val invoice: InvoiceDetailed,
        val replacedInvoice: InvoiceDetailed?,
        val replacedByInvoice: InvoiceDetailed?,
        val permittedActions: Set<Action.Invoice>,
    )

    @PostMapping("/create-replacement-drafts/{headOfFamilyId}")
    fun createReplacementDraftsForHeadOfFamily(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @PathVariable headOfFamilyId: PersonId,
    ) {
        db.connect { dbc ->
                dbc.read {
                    accessControl.requirePermissionFor(
                        it,
                        user,
                        clock,
                        Action.Person.CREATE_REPLACEMENT_DRAFT_INVOICES,
                        headOfFamilyId,
                    )
                }
                generator.generateReplacementDraftInvoicesForHeadOfFamily(
                    dbc,
                    clock.today(),
                    headOfFamilyId,
                )
            }
            .also { Audit.InvoicesCreateReplacementDrafts.log(targetId = AuditId(headOfFamilyId)) }
    }

    data class MarkReplacementDraftSentRequest(
        val reason: InvoiceReplacementReason,
        val notes: String,
    )

    @PostMapping("/{invoiceId}/mark-replacement-draft-sent")
    fun markReplacementDraftSent(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @PathVariable invoiceId: InvoiceId,
        @RequestBody body: MarkReplacementDraftSentRequest,
    ) {
        if (body.reason == InvoiceReplacementReason.OTHER && body.notes.isBlank()) {
            throw BadRequest("Notes are required when reason is OTHER")
        }

        db.connect { dbc ->
            dbc.transaction { tx ->
                accessControl.requirePermissionFor(
                    tx,
                    user,
                    clock,
                    Action.Invoice.MARK_SENT,
                    invoiceId,
                )
                val invoice =
                    tx.getDetailedInvoice(invoiceId) ?: throw NotFound("Invoice not found")
                if (invoice.status != InvoiceStatus.REPLACEMENT_DRAFT) {
                    throw BadRequest("Invoice is not a replacement draft")
                }
                tx.setReplacementDraftSent(
                    invoiceId,
                    clock.now(),
                    user.evakaUserId,
                    body.reason,
                    body.notes,
                )
            }
        }
        Audit.InvoicesMarkReplacementDraftSent.log(targetId = AuditId(invoiceId))
    }

    @GetMapping("/head-of-family/{id}")
    fun getHeadOfFamilyInvoices(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @PathVariable id: PersonId,
    ): List<InvoiceDetailed> {
        return db.connect { dbc ->
                dbc.read {
                    accessControl.requirePermissionFor(
                        it,
                        user,
                        clock,
                        Action.Person.READ_INVOICES,
                        id,
                    )
                    it.getHeadOfFamilyInvoices(id)
                }
            }
            .also {
                Audit.InvoicesRead.log(targetId = AuditId(id), meta = mapOf("count" to it.size))
            }
    }

    @GetMapping("/codes")
    fun getInvoiceCodes(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
    ): InvoiceCodes {
        return db.connect { dbc ->
            dbc.read {
                accessControl.requirePermissionFor(
                    it,
                    user,
                    clock,
                    Action.Global.READ_INVOICE_CODES,
                )
                service.getInvoiceCodes(it)
            }
        }
    }
}

data class InvoicePayload(
    val from: LocalDate,
    val to: LocalDate,
    val areas: List<String>,
    val invoiceDate: LocalDate?,
    val dueDate: LocalDate?,
)

data class SearchInvoicesRequest(
    val page: Int,
    val sortBy: InvoiceSortParam? = null,
    val sortDirection: SortDirection? = null,
    val status: InvoiceStatus,
    val area: List<String>? = null,
    val unit: DaycareId? = null,
    val distinctions: List<InvoiceDistinctiveParams>? = null,
    val searchTerms: String? = null,
    val periodStart: LocalDate? = null,
    val periodEnd: LocalDate? = null,
)
