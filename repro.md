# Signet: Architecture Tradeoffs & Open Questions

This document captures known limitations and design tensions in the current Signet implementation for any agent continuing work on the project. Read alongside `CLAUDE.md`.

## Context: What Signet is not

Signet is a self-sovereign attestation system. No third-party issuer is involved — the user asserts "I control both of these keys" and proves it with two signatures. This is distinct from Thurin (see below), which involves government-issued credentials with an external issuer and lifecycle.

Understanding this distinction matters because it shapes which architectural tradeoffs are acceptable.

---

## Known pushbacks on the current design

### 1. Event log queryability

**The problem**: Attestation data lives primarily in event logs (`Attested`, `Revoked`). Events are cheap to write but expensive to read at scale. Scry calls `getLogs` from a fixed starting block, which works fine on Sepolia but will become slow and unreliable on mainnet as the registry grows.

**Why it wasn't addressed yet**: The event model is the right *conceptual* fit for Signet — attestations are immutable facts, not stateful objects. A token would give you `balanceOf` / `ownerOf` queryability but at the cost of introducing token semantics that don't belong here (transferability, wallet display, issuer relationship).

**The right fix**: A subgraph. Define a schema for `Attested` and `Revoked` events, deploy to The Graph, and replace the `getLogs` calls in Scry with GraphQL queries. This preserves the event-based model while making the explorer fast and pageable.

**What not to do**: Don't switch to a soulbound token just to solve the queryability problem. That's the wrong tool for a self-sovereign claim.

---

### 2. No on-chain PGP signature verification

**The problem**: The contract stores the PGP clearsign block in the event log but does not verify it on-chain. Anyone could call `attest()` with a fabricated PGP signature string and the contract would accept it. Verification happens client-side in Signet (via openpgp.js) and in Scry (via keyserver + openpgp.js).

**Why this is acceptable**: Ed25519 signature verification on the EVM is impractical — there is no precompile for it (EIP-665 went stagnant), and pure-Solidity implementation would cost prohibitive gas. RIP-7696 (generic curve DSM) targets L2s but is not on mainnet. Noir's built-in EdDSA operates over Baby Jubjub, not Curve25519/Ed25519. Building a full Ed25519 RFC 8032 verifier circuit in Noir from `noir-bignum` primitives is possible but significant effort for marginal security gain.

**The trust model compensates**:
- `msg.sender` proves wallet ownership implicitly
- The PGP signature is stored publicly in the event log — anyone can re-verify it off-chain at any time
- Scry fetches the latest public key from keys.openpgp.org and verifies the signature client-side
- Signet's attestation flow verifies the PGP signature before allowing on-chain submission
- The fingerprint cross-check ensures the key that produced the PGP signature matches the fingerprint the wallet signed

**The actual trust gap is small**: An attacker would need to both forge a PGP signature *and* control the ETH wallet to fake an attestation, which defeats the purpose of the binding.

**Decision**: Off-chain verification is sufficient for Signet. Revisit if a cheap Ed25519 precompile lands on mainnet.

---

### ~~3. Data model is one-to-one, not one-to-many~~

**Resolved.** The current `PGPRegistry.sol` implements the array-based model:
```solidity
struct Attestation {
    string  fingerprint;
    uint256 createdAt;
    bool    revoked;
}
mapping(address => Attestation[]) private _attestations;
mapping(string => address) public addressOf; // one-to-one, enforced
```

Supports multiple keys per address, per-key revocation, full attestation history, key rotation, and re-attestation after revoke. Duplicate active fingerprints are rejected. Case-insensitive fingerprint matching is enforced.

---

### ~~4. Key source trustworthiness~~

**Resolved via runtime check.** Rather than recording key source at attestation time, Scry checks the keyserver at display time and shows "via keys.openpgp.org" or "via on-chain event log". This is better than a static flag because it reflects the current state — a key uploaded after attestation is still verifiable. Signet also prompts users to upload their key to keys.openpgp.org before attesting.

---

## Relationship to Thurin

Signet and Thurin are complementary, not competing.

| | Thurin | Signet |
|---|---|---|
| Claim type | Government-issued credential | Self-sovereign key control |
| Issuer | State / DMV | None (self-attested) |
| Trust model | Top-down (authority) | Bottom-up (web of trust) |
| Privacy | ZK proof, no PII on-chain | Fingerprint + ETH address public |
| On-chain artifact | Soulbound token | Event log entry |
| Lifecycle | Expiry, issuer revocation | Self-revocation only |

A protocol consuming both registries could construct a much richer identity signal: "this address is linked to a verified human identity (Thurin) AND has a GPG key with N peer certifications (Signet web of trust)." Neither system alone achieves this.

The soulbound token model is correct for Thurin because the credential has an external issuer and a lifecycle. The event log model is correct for Signet because the claim is self-sovereign and the signatures are the artifact. Don't conflate them.

---

## Before mainnet

In rough priority order:

1. ~~Implement the array-based data model~~ — done
2. ~~Key source trustworthiness~~ — resolved via runtime keyserver check in Scry
3. Deploy a subgraph and replace `getLogs` in Scry (when scale demands it)
4. Decide whether paste-only attestations should be accepted
