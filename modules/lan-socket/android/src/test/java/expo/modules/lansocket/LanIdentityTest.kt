package expo.modules.lansocket

import java.math.BigInteger
import java.security.interfaces.RSAPublicKey
import java.util.Date
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.security.auth.x500.X500Principal
import okhttp3.tls.HeldCertificate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Android Keystore is not available on the JVM, so the key pairs live in this fake. */
internal class FakeIdentityKeyStore : IdentityKeyStore {
  class Entry(
    val held: HeldCertificate,
    val subject: X500Principal,
    val serial: BigInteger,
    val notBefore: Date,
    val notAfter: Date,
  )

  val entries = HashMap<String, Entry>()
  var generated = 0

  @Synchronized
  override fun publicKey(alias: String): RSAPublicKey? =
    entries[alias]?.held?.certificate?.publicKey as? RSAPublicKey

  @Synchronized
  override fun generate(
    alias: String,
    subject: X500Principal,
    serial: BigInteger,
    notBefore: Date,
    notAfter: Date,
  ): RSAPublicKey {
    generated++
    val held = HeldCertificate.Builder().rsa2048().build()
    entries[alias] = Entry(held, subject, serial, notBefore, notAfter)
    return held.certificate.publicKey as RSAPublicKey
  }

  @Synchronized
  override fun delete(alias: String) {
    entries.remove(alias)
  }
}

class LanIdentityTest {
  private val store = FakeIdentityKeyStore()
  private val now = 1_800_000_000_000L
  private val ids = LanIdentities(store) { now }

  @Test
  fun theSameRefGivesTheSameKeyAndIsMadeOnce() {
    val a = ids.ensure("androidtv:tv1", "one-remote")
    val b = ids.ensure("androidtv:tv1", "one-remote")
    assertEquals(a, b)
    assertEquals(1, store.generated)
    assertEquals(setOf("lan-identity:androidtv:tv1"), store.entries.keys)
  }

  @Test
  fun aDifferentRefGivesADifferentKey() {
    val a = ids.ensure("androidtv:tv1", "one-remote")
    val b = ids.ensure("androidtv:tv2", "one-remote")
    assertNotEquals(a.modulusHex, b.modulusHex)
    assertEquals(2, store.generated)
  }

  @Test
  fun afterDeleteANewKeyIsMade() {
    val a = ids.ensure("r", "cn")
    ids.delete("r")
    assertTrue(store.entries.isEmpty())
    val b = ids.ensure("r", "cn")
    assertNotEquals(a.modulusHex, b.modulusHex)
  }

  @Test
  fun deleteIsIdempotent() {
    ids.delete("never-made")
    ids.ensure("r", "cn")
    ids.delete("r")
    ids.delete("r")
    assertTrue(store.entries.isEmpty())
  }

  @Test
  fun theExponentIs10001AndTheModulusIsUpperCaseHexWithoutLeadingZeros() {
    val id = ids.ensure("r", "cn")
    assertEquals("10001", id.exponentHex)
    val key = store.publicKey("lan-identity:r")!!
    assertEquals(key.modulus.toString(16).uppercase(), id.modulusHex)
    assertEquals(512, id.modulusHex.length) // 2048 bits, top bit set
    assertTrue(id.modulusHex.matches(Regex("[0-9A-F]+")))
    assertTrue(!id.modulusHex.startsWith("0"))
  }

  @Test
  fun hexHasNoLeadingZerosOrLowerCase() {
    assertEquals("A", LanIdentities.hex(BigInteger.TEN))
    assertEquals("10001", LanIdentities.hex(BigInteger.valueOf(65537)))
    assertEquals("FF", LanIdentities.hex(BigInteger.valueOf(255)))
  }

  @Test
  fun theCertificateIsSelfSignedWithTheAgreedSubjectSerialAndValidity() {
    ids.ensure("r", "one-remote/phone")
    val e = store.entries.getValue("lan-identity:r")
    assertEquals("CN=one-remote/phone", e.subject.name)
    assertEquals(BigInteger.valueOf(1000), e.serial)
    val day = 86_400_000L
    assertEquals(now - day, e.notBefore.time)
    val years = (e.notAfter.time - e.notBefore.time) / day
    assertTrue("validity $years days", years in 3650..3653)
  }

  @Test
  fun aCommonNameCannotInjectOtherNameParts() {
    ids.ensure("r", "a,O=evil+OU=x")
    val subject = store.entries.getValue("lan-identity:r").subject
    // One RDN whose value is the whole text, escaped as RFC 2253 writes it.
    assertEquals("CN=a\\,O\\=evil\\+OU\\=x", subject.name)
    assertEquals(subject, X500Principal("CN=a\\,O\\=evil\\+OU\\=x"))
  }

  @Test
  fun escapeRdnValueHandlesEdgesAndSpecials() {
    assertEquals("plain/AA:BB", LanIdentities.escapeRdnValue("plain/AA:BB"))
    assertEquals("\\#x", LanIdentities.escapeRdnValue("#x"))
    assertEquals("a#x", LanIdentities.escapeRdnValue("a#x"))
    assertEquals("\\ a\\ ", LanIdentities.escapeRdnValue(" a "))
    assertEquals("a\\,b\\;c\\\\d", LanIdentities.escapeRdnValue("a,b;c\\d"))
  }

  @Test
  fun anEmptyRefOrNameIsRefusedWithoutMakingAKey() {
    for ((ref, name) in listOf("" to "cn", "r" to "")) {
      val e = assertThrows(LanOpenError::class.java) { ids.ensure(ref, name) }
      assertEquals(ERR_OPEN_FAILED, e.code)
    }
    assertEquals(0, store.generated)
  }

  @Test
  fun aStoreFailureIsAnOpenFailedNamingTheRef() {
    val broken =
      object : IdentityKeyStore {
        override fun publicKey(alias: String): RSAPublicKey? = null

        override fun generate(
          alias: String,
          subject: X500Principal,
          serial: BigInteger,
          notBefore: Date,
          notAfter: Date,
        ): RSAPublicKey = throw IllegalStateException("keystore locked")

        override fun delete(alias: String) = throw IllegalStateException("keystore locked")
      }
    val e = assertThrows(LanOpenError::class.java) { LanIdentities(broken).ensure("tv9", "cn") }
    assertEquals(ERR_OPEN_FAILED, e.code)
    assertTrue(e.message ?: "", e.message!!.contains("tv9") && e.message!!.contains("locked"))
    assertEquals(
      ERR_OPEN_FAILED,
      assertThrows(LanOpenError::class.java) { LanIdentities(broken).delete("tv9") }.code,
    )
  }

  @Test
  fun concurrentCallsMakeOneKey() {
    val pool = Executors.newFixedThreadPool(8)
    try {
      val results = (1..8).map { pool.submit<LanIdentity> { ids.ensure("r", "cn") } }
      val all = results.map { it.get(30, TimeUnit.SECONDS) }
      assertEquals(1, all.toSet().size)
      assertEquals(1, store.generated)
    } finally {
      pool.shutdownNow()
    }
  }
}
