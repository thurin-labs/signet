import { type Address, type PublicClient, getAddress } from 'viem'
import { PGP_REGISTRY_ABI } from './abi.js'
import { verifyAttestation, parsePgpKey } from './verify.js'
import type {
  Attestation,
  AttestationEvent,
  VerificationResult,
  PgpKeyInfo,
  VerifyReport,
  VerifiedAttestation,
} from './types.js'

export { PGP_REGISTRY_ABI } from './abi.js'
export { verifyAttestation, parsePgpKey } from './verify.js'
export type * from './types.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export class SignetRegistry {
  private readonly client: PublicClient
  private readonly address: Address

  constructor(client: PublicClient, address: Address) {
    this.client = client
    this.address = address
  }

  // ─── Low-level reads ──────────────────────────────────────────────────────

  async attestationCount(addr: Address): Promise<number> {
    const count = await this.client.readContract({
      address: this.address,
      abi: PGP_REGISTRY_ABI,
      functionName: 'attestationCount',
      args: [addr],
    })
    return Number(count)
  }

  async getAttestation(addr: Address, index: number): Promise<Attestation> {
    const [fingerprint, createdAt, revoked] = await this.client.readContract({
      address: this.address,
      abi: PGP_REGISTRY_ABI,
      functionName: 'getAttestation',
      args: [addr, BigInt(index)],
    })
    return { index, fingerprint, createdAt: Number(createdAt), revoked }
  }

  async lookupByFingerprint(fingerprint: string): Promise<Address> {
    return this.client.readContract({
      address: this.address,
      abi: PGP_REGISTRY_ABI,
      functionName: 'lookupByFingerprint',
      args: [fingerprint],
    }) as Promise<Address>
  }

  // ─── Batch reads ──────────────────────────────────────────────────────────

  async getAttestations(addr: Address): Promise<Attestation[]> {
    const count = await this.attestationCount(addr)
    if (count === 0) return []

    const contracts = Array.from({ length: count }, (_, i) => ({
      address: this.address as Address,
      abi: PGP_REGISTRY_ABI,
      functionName: 'getAttestation' as const,
      args: [addr, BigInt(i)] as const,
    }))

    const results = await this.client.multicall({ contracts })

    return results
      .map((r, i) => {
        if (r.status !== 'success') return null
        const [fingerprint, createdAt, revoked] = r.result as [string, bigint, boolean]
        return { index: i, fingerprint, createdAt: Number(createdAt), revoked }
      })
      .filter((a): a is Attestation => a !== null)
  }

  // ─── Event logs ───────────────────────────────────────────────────────────

  async getEventLogs(addr: Address): Promise<Map<number, AttestationEvent>> {
    const checksummed = getAddress(addr)
    const logs = await this.client.getLogs({
      address: this.address,
      event: PGP_REGISTRY_ABI[0], // Attested event
      args: { ethAddress: checksummed },
      fromBlock: 0n,
      toBlock: 'latest',
    })

    const byIndex = new Map<number, AttestationEvent>()
    for (const log of logs) {
      const idx = Number(log.args.index)
      byIndex.set(idx, {
        pgpSignature: log.args.pgpSignature!,
        pgpPublicKey: log.args.pgpPublicKey!,
        txHash: log.transactionHash,
      })
    }
    return byIndex
  }

  // ─── High-level verification ──────────────────────────────────────────────

  /**
   * Fetch all attestations + event logs for an address,
   * run PGP verification on each, and return a full report.
   */
  async verify(addr: Address): Promise<VerifyReport> {
    const checksummed = getAddress(addr)
    const [attestations, eventLogs] = await Promise.all([
      this.getAttestations(checksummed),
      this.getEventLogs(checksummed),
    ])

    const verified: VerifiedAttestation[] = await Promise.all(
      attestations.map(async (att) => {
        const event = eventLogs.get(att.index) ?? null
        let verification: VerificationResult
        let keyInfo: PgpKeyInfo | null = null

        if (event) {
          verification = await verifyAttestation({
            pgpPublicKey: event.pgpPublicKey,
            pgpSignature: event.pgpSignature,
            fingerprint: att.fingerprint,
            ethAddress: checksummed,
          })
          keyInfo = await parsePgpKey(event.pgpPublicKey)
        } else {
          verification = { verified: false, reason: 'No PGP data in event logs' }
        }

        return { ...att, event, verification, keyInfo }
      }),
    )

    return { address: checksummed, attestations: verified }
  }

  /**
   * Look up an address by fingerprint, then run full verification.
   * Returns null if the fingerprint is not registered.
   */
  async verifyByFingerprint(fingerprint: string): Promise<VerifyReport | null> {
    const addr = await this.lookupByFingerprint(fingerprint)
    if (addr === ZERO_ADDRESS) return null
    return this.verify(addr)
  }
}
