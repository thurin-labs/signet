import type { Address, Hex } from 'viem'

/** On-chain attestation data (from getAttestation view function) */
export interface Attestation {
  index: number
  fingerprint: string
  createdAt: number // unix timestamp
  revoked: boolean
}

/** Event log data (from Attested event — not stored in contract state) */
export interface AttestationEvent {
  pgpSignature: string
  pgpPublicKey: string
  txHash: Hex
}

/** Combined attestation with on-chain + event data */
export interface FullAttestation extends Attestation {
  event: AttestationEvent | null
}

/** Result of PGP verification */
export interface VerificationResult {
  verified: boolean
  reason?: string
}

/** Parsed PGP key metadata */
export interface PgpKeyInfo {
  fingerprint: string
  userIDs: string[]
  algorithm: string
  created: string | null
  expires: string | null
  notations: Notation[]
  subkeys: SubkeyInfo[]
}

export interface Notation {
  name: string
  value: string
}

export interface SubkeyInfo {
  algorithm: string
  created: string | null
  fingerprint: string
}

/** Full verification report for an address */
export interface VerifyReport {
  address: Address
  attestations: VerifiedAttestation[]
}

/** Attestation with verification result and parsed key info */
export interface VerifiedAttestation extends FullAttestation {
  verification: VerificationResult
  keyInfo: PgpKeyInfo | null
}
