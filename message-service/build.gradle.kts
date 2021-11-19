// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import org.jetbrains.kotlin.gradle.plugin.KotlinSourceSet
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

buildscript {
    repositories {
        mavenCentral()
    }

    dependencies {
        classpath("com.pinterest:ktlint:${Version.ktlint}")
    }
}

plugins {
    id("org.flywaydb.flyway") version Version.GradlePlugin.flyway
    id("org.jetbrains.kotlin.jvm") version Version.GradlePlugin.kotlin
    id("org.jetbrains.kotlin.plugin.allopen") version Version.GradlePlugin.kotlin
    id("org.jetbrains.kotlin.plugin.spring") version Version.GradlePlugin.kotlin
    id("org.springframework.boot") version Version.GradlePlugin.springBoot

    id("com.github.ben-manes.versions") version Version.GradlePlugin.versions
    id("org.jmailen.kotlinter") version Version.GradlePlugin.kotlinter
    id("org.owasp.dependencycheck") version Version.GradlePlugin.owasp

    idea
}

repositories {
    mavenCentral()
}

val generatedSources = "$buildDir/generated/sources/wsdl2java/java/main"

sourceSets {
    create("integrationTest") {
        compileClasspath += main.get().output + test.get().output
        runtimeClasspath += main.get().output + test.get().output
    }
    main {
        java.srcDir(generatedSources)
    }
}

val integrationTestImplementation: Configuration by configurations.getting {
    extendsFrom(configurations.testImplementation.get())
}

configurations["integrationTestRuntimeOnly"].extendsFrom(configurations.testRuntimeOnly.get())

idea {
    module {
        testSourceDirs =
            testSourceDirs + sourceSets["integrationTest"].withConvention(KotlinSourceSet::class) { kotlin.srcDirs }
        testResourceDirs = testResourceDirs + sourceSets["integrationTest"].resources.srcDirs
    }
}

val wsdl2java: Configuration by configurations.creating
val ktlint: Configuration by configurations.creating

dependencies {
    api(platform(project(":evaka-bom")))
    implementation(platform(project(":evaka-bom")))
    testImplementation(platform(project(":evaka-bom")))
    runtimeOnly(platform(project(":evaka-bom")))
    integrationTestImplementation(platform(project(":evaka-bom")))

    // Kotlin + core
    implementation(kotlin("stdlib-jdk8"))

    // Logging
    implementation("dev.akkinoc.spring.boot:logback-access-spring-boot-starter")
    implementation("io.github.microutils:kotlin-logging-jvm")

    // Spring
    implementation("org.springframework.boot:spring-boot-starter")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-aop")
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-web-services")
    implementation("org.springframework.ws:spring-ws-security")
    implementation("org.springframework.ws:spring-ws-support")

    // Jackson
    implementation("com.fasterxml.jackson.core:jackson-core")
    implementation("com.fasterxml.jackson.core:jackson-databind")
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")
    implementation("com.fasterxml.jackson.module:jackson-module-jaxb-annotations")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    runtimeOnly("com.fasterxml.jackson.datatype:jackson-datatype-jdk8")

    // AWS SDK
    implementation("software.amazon.awssdk:s3")
    implementation("software.amazon.awssdk:sts")

    // Database-related dependencies
    implementation("com.zaxxer:HikariCP")
    implementation("org.postgresql:postgresql")
    implementation("org.flywaydb:flyway-core")

    // JDBI
    implementation("org.jdbi:jdbi3-core")
    implementation("org.jdbi:jdbi3-jackson2")
    implementation("org.jdbi:jdbi3-kotlin")
    implementation("org.jdbi:jdbi3-postgres")

    // Voltti
    implementation(project(":service-lib"))

    // Miscellaneous
    implementation("com.auth0:java-jwt")
    implementation("javax.annotation:javax.annotation-api")
    implementation("javax.jws:javax.jws-api")
    implementation("javax.xml.ws:jaxws-api")
    implementation("org.apache.commons:commons-text")
    implementation("org.apache.wss4j:wss4j-ws-security-dom")
    implementation("org.glassfish.jaxb:jaxb-runtime")
    implementation("org.bouncycastle:bcprov-jdk15on")
    implementation("org.bouncycastle:bcpkix-jdk15on")

    // JUnit
    testImplementation("org.junit.jupiter:junit-jupiter")
    testImplementation("org.mockito.kotlin:mockito-kotlin")
    testImplementation("net.bytebuddy:byte-buddy")
    testImplementation("org.springframework.boot:spring-boot-starter-test")

    integrationTestImplementation("org.testcontainers:postgresql")

    ktlint("com.pinterest:ktlint:${Version.ktlint}")

    wsdl2java(platform(project(":evaka-bom")))
    wsdl2java("org.slf4j:slf4j-simple")
    wsdl2java("javax.jws:javax.jws-api")
    wsdl2java("javax.xml.ws:jaxws-api")
    wsdl2java("org.apache.cxf:cxf-tools-wsdlto-frontend-jaxws")
    wsdl2java("org.apache.cxf:cxf-tools-wsdlto-databinding-jaxb")
}

allOpen {
    annotation("org.springframework.boot.test.context.TestConfiguration")
}

allprojects {
    tasks.withType<JavaCompile> {
        sourceCompatibility = Version.java
        targetCompatibility = Version.java
    }
}

tasks.withType<KotlinCompile> {
    kotlinOptions {
        jvmTarget = Version.java
        allWarningsAsErrors = true
    }
}

tasks.getByName<Jar>("jar") {
    enabled = false
}

val wsdl2javaTask = tasks.register<JavaExec>("wsdl2java") {
    val wsdl = "$projectDir/src/main/resources/wsdl/Viranomaispalvelut.wsdl"

    mainClass.set("org.apache.cxf.tools.wsdlto.WSDLToJava")
    classpath = wsdl2java
    args = arrayListOf(
        "-d",
        generatedSources,
        "-p",
        "fi.espoo.evaka.msg.sficlient.soap",
        "-mark-generated",
        "-autoNameResolution",
        wsdl
    )
    inputs.files(wsdl)
    outputs.dir(generatedSources)
}

tasks.getByName<JavaCompile>("compileJava") {
    dependsOn(wsdl2javaTask)
}

tasks.getByName<KotlinCompile>("compileKotlin") {
    dependsOn(wsdl2javaTask)
}

tasks {
    test {
        useJUnitPlatform()
        systemProperty("spring.profiles.active", "test")
        filter {
            isFailOnNoMatchingTests = false
        }
    }

    create("integrationTest", Test::class) {
        useJUnitPlatform()
        group = "verification"
        systemProperty("spring.profiles.active", "integration-test")
        testClassesDirs = sourceSets["integrationTest"].output.classesDirs
        classpath = sourceSets["integrationTest"].runtimeClasspath
        shouldRunAfter("test")
        outputs.upToDateWhen { false }
    }

    bootRun {
        systemProperty("spring.profiles.active", "dev,local")
    }

    create("ktlintApplyToIdea", JavaExec::class) {
        mainClass.set("com.pinterest.ktlint.Main")
        classpath = ktlint
        args = listOf("applyToIDEAProject", "-y")
    }

    dependencyCheck {
        failBuildOnCVSS = 0.0f
        analyzers.apply {
            assemblyEnabled = false
            nodeAuditEnabled = false
            nodeEnabled = false
            nuspecEnabled = false
        }
        suppressionFile = "$projectDir/owasp-suppressions.xml"
    }
}
