import { describe, it, expect, vi, beforeEach } from 'vitest'
import { type PublicClient, type Address } from 'viem'
import { SignetRegistry, PGP_REGISTRY_ABI } from '../src/index.js'

const REGISTRY = '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6' as Address
const ADDR = '0xD730182053Bb2365d15B2b1bE68542c760cb7f10' as Address
const ZERO = '0x0000000000000000000000000000000000000000' as Address

const mockClient = {
  readContract: vi.fn(),
  multicall: vi.fn(),
  getLogs: vi.fn(),
} as unknown as PublicClient

let registry: SignetRegistry

beforeEach(() => {
  vi.clearAllMocks()
  registry = new SignetRegistry(mockClient, REGISTRY)
})

describe('SignetRegistry', () => {
  it('attestationCount returns number', async () => {
    ;(mockClient.readContract as any).mockResolvedValueOnce(3n)
    const count = await registry.attestationCount(ADDR)
    expect(count).toBe(3)
    expect(mockClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: REGISTRY,
        functionName: 'attestationCount',
        args: [ADDR],
      }),
    )
  })

  it('getAttestation returns typed Attestation', async () => {
    ;(mockClient.readContract as any).mockResolvedValueOnce([
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      1700000000n,
      false,
    ])
    const att = await registry.getAttestation(ADDR, 0)
    expect(att).toEqual({
      index: 0,
      fingerprint: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      createdAt: 1700000000,
      revoked: false,
    })
  })

  it('lookupByFingerprint calls correct function', async () => {
    ;(mockClient.readContract as any).mockResolvedValueOnce(ADDR)
    const result = await registry.lookupByFingerprint(
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    )
    expect(result).toBe(ADDR)
    expect(mockClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'lookupByFingerprint',
        args: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
      }),
    )
  })

  it('getAttestations returns empty array for zero count', async () => {
    ;(mockClient.readContract as any).mockResolvedValueOnce(0n)
    const result = await registry.getAttestations(ADDR)
    expect(result).toEqual([])
    expect(mockClient.multicall).not.toHaveBeenCalled()
  })

  it('getAttestations uses multicall for batch reads', async () => {
    ;(mockClient.readContract as any).mockResolvedValueOnce(2n)
    ;(mockClient.multicall as any).mockResolvedValueOnce([
      { status: 'success', result: ['AAAA'.repeat(10), 1700000000n, false] },
      { status: 'success', result: ['BBBB'.repeat(10), 1700000001n, true] },
    ])
    const result = await registry.getAttestations(ADDR)
    expect(result).toHaveLength(2)
    expect(result[0].fingerprint).toBe('AAAA'.repeat(10))
    expect(result[1].revoked).toBe(true)
  })

  it('getEventLogs returns Map keyed by index', async () => {
    ;(mockClient.getLogs as any).mockResolvedValueOnce([
      {
        args: {
          ethAddress: ADDR,
          index: 0n,
          pgpSignature: '-----BEGIN PGP SIGNED MESSAGE-----\ntest',
          pgpPublicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\ntest',
        },
        transactionHash: '0xabc',
      },
    ])
    const logs = await registry.getEventLogs(ADDR)
    expect(logs.size).toBe(1)
    expect(logs.get(0)?.pgpSignature).toContain('BEGIN PGP SIGNED MESSAGE')
    expect(logs.get(0)?.txHash).toBe('0xabc')
  })

  it('verifyByFingerprint returns null for unknown fingerprint', async () => {
    ;(mockClient.readContract as any).mockResolvedValueOnce(ZERO)
    const result = await registry.verifyByFingerprint(
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    )
    expect(result).toBeNull()
  })
})

describe('PGP_REGISTRY_ABI', () => {
  it('has all required entries', () => {
    const names = PGP_REGISTRY_ABI.map((e) => e.name)
    expect(names).toContain('Attested')
    expect(names).toContain('Revoked')
    expect(names).toContain('attestationCount')
    expect(names).toContain('getAttestation')
    expect(names).toContain('lookupByFingerprint')
    expect(names).toContain('addressOf')
  })
})
