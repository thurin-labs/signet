import { readKey, readCleartextMessage, verify } from 'openpgp'
import type { VerificationResult, PgpKeyInfo } from './types.js'

/**
 * Verify an attestation's PGP proofs:
 * 1. Public key fingerprint matches claimed fingerprint
 * 2. PGP signature is valid against the public key
 * 3. Signed message contains the ETH address
 */
export async function verifyAttestation(params: {
  pgpPublicKey: string
  pgpSignature: string
  fingerprint: string
  ethAddress: string
}): Promise<VerificationResult> {
  try {
    const { pgpPublicKey, pgpSignature, fingerprint, ethAddress } = params

    if (!pgpPublicKey || !pgpSignature) {
      return { verified: false, reason: 'Missing PGP data' }
    }

    // 1. Parse public key and check fingerprint
    const publicKey = await readKey({ armoredKey: pgpPublicKey })
    const keyFingerprint = publicKey.getFingerprint().toUpperCase()
    if (keyFingerprint !== fingerprint.toUpperCase()) {
      return { verified: false, reason: 'Key fingerprint mismatch' }
    }

    // 2. Parse and verify the PGP signature
    const message = await readCleartextMessage({ cleartextMessage: pgpSignature })
    const { signatures } = await verify({ message, verificationKeys: publicKey })
    await signatures[0].verified // throws if invalid

    // 3. Check the signed message contains the ETH address
    const signedText = message.getText()
    if (!signedText.toLowerCase().includes(ethAddress.toLowerCase())) {
      return { verified: false, reason: 'Signed message does not contain ETH address' }
    }

    return { verified: true }
  } catch {
    return { verified: false, reason: 'Signature verification failed' }
  }
}

/**
 * Parse an armored PGP public key into structured metadata.
 * Returns null if the key cannot be parsed.
 */
export async function parsePgpKey(armoredKey: string): Promise<PgpKeyInfo | null> {
  try {
    const key = await readKey({ armoredKey })
    const fingerprint = key.getFingerprint().toUpperCase()
    const userIDs = key.users.map((u: any) => u.userID?.userID).filter(Boolean)
    const algorithm = String(key.keyPacket.algorithm)
    const created = (key.keyPacket as any).created?.toISOString() ?? null
    const expiration = await key.getExpirationTime()
    const expires =
      expiration && expiration !== Infinity
        ? new Date(expiration as number).toISOString()
        : null

    // Extract notations (keyoxide proofs, etc.)
    const notations: PgpKeyInfo['notations'] = []
    const seen = new Set<string>()
    for (const user of key.users) {
      const certs = (user as any).selfCertifications
      if (!certs) continue
      for (const cert of certs) {
        if (cert.rawNotations) {
          for (const n of cert.rawNotations) {
            const name =
              typeof n.name === 'string'
                ? n.name
                : new TextDecoder().decode(n.name)
            const value =
              n.value instanceof Uint8Array
                ? new TextDecoder().decode(n.value)
                : typeof n.value === 'string'
                  ? n.value
                  : null
            if (value) {
              const dedupKey = `${name}:${value}`
              if (!seen.has(dedupKey)) {
                seen.add(dedupKey)
                notations.push({ name, value })
              }
            }
          }
        }
      }
    }

    const subkeys = key.subkeys.map((sk: any) => ({
      algorithm: String(sk.keyPacket.algorithm),
      created: sk.keyPacket.created?.toISOString() ?? null,
      fingerprint: sk.getFingerprint().toUpperCase(),
    }))

    return { fingerprint, userIDs, algorithm, created, expires, notations, subkeys }
  } catch {
    return null
  }
}
