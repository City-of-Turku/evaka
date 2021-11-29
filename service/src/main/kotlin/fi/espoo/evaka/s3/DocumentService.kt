// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.s3

import java.io.InputStream
import java.net.URL

interface Document {
    fun getName(): String
    fun getBytes(): ByteArray
}

data class DocumentWrapper(private val name: String, private val bytes: ByteArray) : Document {
    override fun getName() = name
    override fun getBytes() = bytes
}

data class DocumentLocation(val bucket: String, val key: String)

interface DocumentService {
    /**
     * Get attachment by attachment path. Subclasses can set add more restrictions to path value.
     */
    fun get(bucketName: String, key: String): Document

    /**
     * Create a presigned URL to get a file. Returns NULL if not supported.
     */
    fun presignedGetUrl(bucketName: String, key: String): URL?

    /**
     * Get InputStream of the file by path.
     */
    fun stream(bucketName: String, key: String): InputStream

    /**
     * Upload a document to S3. [DocumentLocation] is returned in response
     */
    fun upload(bucketName: String, document: Document, contentType: String): DocumentLocation

    /**
     * Delete a document from S3
     */
    fun delete(bucketName: String, key: String)
}
