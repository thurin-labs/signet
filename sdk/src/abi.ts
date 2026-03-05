export const PGP_REGISTRY_ABI = [
  // Events
  {
    name: 'Attested',
    type: 'event',
    inputs: [
      { name: 'ethAddress', type: 'address', indexed: true },
      { name: 'fingerprintHash', type: 'string', indexed: true },
      { name: 'fingerprint', type: 'string', indexed: false },
      { name: 'pgpSignature', type: 'string', indexed: false },
      { name: 'pgpPublicKey', type: 'string', indexed: false },
      { name: 'index', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Revoked',
    type: 'event',
    inputs: [
      { name: 'ethAddress', type: 'address', indexed: true },
      { name: 'fingerprint', type: 'string', indexed: false },
      { name: 'index', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  // View functions
  {
    name: 'attestationCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getAttestation',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'addr', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [
      { name: 'fingerprint', type: 'string' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'revoked', type: 'bool' },
    ],
  },
  {
    name: 'lookupByFingerprint',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'fingerprint', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'addressOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const
