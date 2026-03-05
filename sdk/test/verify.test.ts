import { describe, it, expect, beforeAll } from 'vitest'
import * as openpgp from 'openpgp'
import { verifyAttestation, parsePgpKey } from '../src/verify.js'

const TEST_ETH_ADDRESS = '0xD730182053Bb2365d15B2b1bE68542c760cb7f10'

let armoredPublicKey: string
let armoredPrivateKey: string
let fingerprint: string
let validSignature: string

beforeAll(async () => {
  // Generate ephemeral test keypair
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519',
    userIDs: [{ name: 'Test User', email: 'test@example.com' }],
    format: 'armored',
  })
  armoredPublicKey = publicKey
  armoredPrivateKey = privateKey

  const parsed = await openpgp.readKey({ armoredKey: publicKey })
  fingerprint = parsed.getFingerprint().toUpperCase()

  // Create a valid clearsign message
  const privKey = await openpgp.readPrivateKey({ armoredKey: privateKey })
  const message = await openpgp.createCleartextMessage({
    text: `I control the Ethereum address: ${TEST_ETH_ADDRESS}`,
  })
  validSignature = await openpgp.sign({
    message,
    signingKeys: privKey,
    format: 'armored',
  }) as string
})

describe('verifyAttestation', () => {
  it('returns verified:true for valid attestation', async () => {
    const result = await verifyAttestation({
      pgpPublicKey: armoredPublicKey,
      pgpSignature: validSignature,
      fingerprint,
      ethAddress: TEST_ETH_ADDRESS,
    })
    expect(result.verified).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('returns verified:false for fingerprint mismatch', async () => {
    const result = await verifyAttestation({
      pgpPublicKey: armoredPublicKey,
      pgpSignature: validSignature,
      fingerprint: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ethAddress: TEST_ETH_ADDRESS,
    })
    expect(result.verified).toBe(false)
    expect(result.reason).toBe('Key fingerprint mismatch')
  })

  it('returns verified:false for missing PGP data', async () => {
    const result = await verifyAttestation({
      pgpPublicKey: '',
      pgpSignature: '',
      fingerprint,
      ethAddress: TEST_ETH_ADDRESS,
    })
    expect(result.verified).toBe(false)
    expect(result.reason).toBe('Missing PGP data')
  })

  it('returns verified:false when signed message lacks ETH address', async () => {
    // Sign a message that doesn't contain the address
    const privKey = await openpgp.readPrivateKey({ armoredKey: armoredPrivateKey })
    const message = await openpgp.createCleartextMessage({
      text: 'This message has no ETH address in it',
    })
    const wrongSig = await openpgp.sign({
      message,
      signingKeys: privKey,
      format: 'armored',
    }) as string

    const result = await verifyAttestation({
      pgpPublicKey: armoredPublicKey,
      pgpSignature: wrongSig,
      fingerprint,
      ethAddress: TEST_ETH_ADDRESS,
    })
    expect(result.verified).toBe(false)
    expect(result.reason).toBe('Signed message does not contain ETH address')
  })

  it('returns verified:false for invalid signature', async () => {
    // Generate a different key and sign with it, but verify against the first key
    const { privateKey: otherPriv } = await openpgp.generateKey({
      type: 'ecc',
      curve: 'curve25519',
      userIDs: [{ name: 'Other', email: 'other@example.com' }],
      format: 'armored',
    })
    const otherKey = await openpgp.readPrivateKey({ armoredKey: otherPriv })
    const message = await openpgp.createCleartextMessage({
      text: `I control the Ethereum address: ${TEST_ETH_ADDRESS}`,
    })
    const badSig = await openpgp.sign({
      message,
      signingKeys: otherKey,
      format: 'armored',
    }) as string

    const result = await verifyAttestation({
      pgpPublicKey: armoredPublicKey,
      pgpSignature: badSig,
      fingerprint,
      ethAddress: TEST_ETH_ADDRESS,
    })
    expect(result.verified).toBe(false)
    expect(result.reason).toBe('Signature verification failed')
  })

  it('is case-insensitive on fingerprint comparison', async () => {
    const result = await verifyAttestation({
      pgpPublicKey: armoredPublicKey,
      pgpSignature: validSignature,
      fingerprint: fingerprint.toLowerCase(),
      ethAddress: TEST_ETH_ADDRESS,
    })
    expect(result.verified).toBe(true)
  })

  it('is case-insensitive on ETH address comparison', async () => {
    const result = await verifyAttestation({
      pgpPublicKey: armoredPublicKey,
      pgpSignature: validSignature,
      fingerprint,
      ethAddress: TEST_ETH_ADDRESS.toLowerCase(),
    })
    expect(result.verified).toBe(true)
  })
})

describe('parsePgpKey', () => {
  it('parses fingerprint, userIDs, algorithm, dates', async () => {
    const info = await parsePgpKey(armoredPublicKey)
    expect(info).not.toBeNull()
    expect(info!.fingerprint).toBe(fingerprint)
    expect(info!.userIDs).toContain('Test User <test@example.com>')
    expect(info!.algorithm).toBeDefined()
    expect(info!.created).toBeDefined()
  })

  it('parses subkeys', async () => {
    const info = await parsePgpKey(armoredPublicKey)
    expect(info).not.toBeNull()
    // ECC keys generated with curve25519 have an encryption subkey
    expect(info!.subkeys.length).toBeGreaterThanOrEqual(1)
    expect(info!.subkeys[0].fingerprint).toBeDefined()
    expect(info!.subkeys[0].algorithm).toBeDefined()
  })

  it('returns null for invalid armored key', async () => {
    const info = await parsePgpKey('not a real key')
    expect(info).toBeNull()
  })

  it('returns null for empty string', async () => {
    const info = await parsePgpKey('')
    expect(info).toBeNull()
  })
})
