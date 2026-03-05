# Signet

Seal your Ethereum wallet to your GPG key. No trusted third party. Just cryptographic oath.

A [Thurin Labs](https://thurin.id) project.

## What it does

Creates a mutual attestation proving you control both a GPG key and an Ethereum wallet:

1. **Connect wallet** — MetaMask, WalletConnect, Coinbase, or any supported wallet
2. **Wallet signs fingerprint** — your ETH wallet signs "I control GPG key with fingerprint: `<fp>`"
3. **GPG signs address** — your GPG key clearsigns "I control the Ethereum address: `0x...`"
4. **App verifies** — openpgp.js verifies the PGP signature (keyserver lookup with manual key fallback)
5. **Publish on-chain** — attestation stored in `PGPRegistry.sol` on Sepolia

The smart contract is a public registry: anyone can look up `fingerprintOf(0xAddress)` or `lookupByFingerprint("fingerprint")`.

## Setup

```bash
npm install
npm run dev
```

## How it works

Your wallet signs your GPG fingerprint. Your GPG key signs your wallet address. Neither signature alone proves anything — together they prove the same person controls both keys.

The app verifies the PGP signature client-side via openpgp.js, fetching your public key from keys.openpgp.org. If your key isn't on a keyserver, you can paste your public key directly.

## Deploying the contract

```bash
forge create contracts/PGPRegistry.sol:PGPRegistry \
  --rpc-url https://rpc.sepolia.org \
  --private-key $PRIVATE_KEY
```

## Trust model

- The ETH signature is verified implicitly — `msg.sender` in the contract IS the wallet
- The PGP signature is verified client-side via openpgp.js + keyserver fetch (or manual key)
- The PGP sig is stored in the event log forever — anyone can re-verify independently
- The contract does not verify PGP on-chain (not practical for Ed25519 on EVM)

## IPFS

The build output (`npm run build`) is a static `dist/` folder with relative asset paths — pin it to IPFS directly.
