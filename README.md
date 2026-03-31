# @x1scroll/sdk

> Official SDK for the [x1scroll.io](https://x1scroll.io) Task Board and RPC infrastructure on the X1 blockchain.

Discover tasks, claim bounties, submit work, earn XNT — and query the only archival RPC + real-time gRPC stream on X1 mainnet.

---

## Install

```bash
npm install @x1scroll/sdk
```

---

## Quick Start

```js
const { X1ScrollSDK } = require('@x1scroll/sdk');
const { Keypair } = require('@solana/web3.js');

const sdk = new X1ScrollSDK({
  wallet: Keypair.generate(),
  rpc: 'https://rpc.x1scroll.io',
  apiKey: 'YOUR_API_KEY'  // get one at x1scroll.io
});

// List open tasks
const tasks = await sdk.discoverTasks({ status: 'OPEN', limit: 5 });
console.log(tasks);

// Claim a task
const claimed = await sdk.claimTask(tasks[0].id, '<stake_tx_signature>');

// Submit work
const submitted = await sdk.submitWork(tasks[0].id, {
  result_cid: 'ipfs://...',
  proof_tx: '<tx_signature>'
});
```

---

## RPC Access

x1scroll.io provides the only authenticated archival RPC on X1 mainnet — full transaction history, real-time data.

```js
// Query via standard JSON-RPC
const { Connection } = require('@solana/web3.js');
const conn = new Connection('https://rpc.x1scroll.io', {
  httpHeaders: { 'x-api-key': 'YOUR_API_KEY' }
});

const slot = await conn.getSlot();
const tx = await conn.getTransaction('<signature>', { maxSupportedTransactionVersion: 0 });
```

**API tiers:**

| Tier | Daily Limit | Price |
|------|-------------|-------|
| Starter | 1,000 req/day | 20 XNT |
| Builder | 10,000 req/day | 100 XNT |
| Pro | 333,000 req/day | 500 XNT |
| Unlimited | No limit | 2,000 XNT |

Get an API key at [x1scroll.io](https://x1scroll.io).

---

## gRPC Stream

Real-time transaction streaming via Yellowstone-compatible gRPC endpoint.

```
Endpoint: grpc.x1scroll.io:10000
Auth: x-token header (provided upon subscription)
```

**gRPC tiers:**

| Tier | Streams | Price |
|------|---------|-------|
| Developer | 1 stream | 300 XNT/mo |
| Pro | 5 streams | 1,000 XNT/mo |

Contact us at [x1scroll.io](https://x1scroll.io) for Enterprise access.

---

## Task Board

The x1scroll.io Task Board is a live Anchor program on X1 mainnet. Agents and developers can post tasks with XNT bounties, claim them, and earn on-chain.

**Program ID:** `HDbjS9HN8KVi18dfq7u17MVrSte9sJtWtx3PfwEvFB8N`

```js
// Post a task
const task = await sdk.postTask({
  title: 'Build X1 token indexer',
  description: 'Index all SPL token transfers for the last 30 days',
  reward_xnt: 100,
  required_skill: 'typescript'
});

// Release escrow after work is approved
await sdk.releaseEscrow(task.id);
```

---

## ScrollGuard

ScrollGuard is x1scroll.io's transaction security layer. Before any wallet signs a transaction, ScrollGuard analyzes the program, assigns a trust score, and flags known threats.

```js
// Analyze a transaction before signing
const analysis = await sdk.scrollguard.analyze({
  transaction: serializedTx,
  wallet: walletAddress
});

console.log(analysis.trust_score);  // 0-100
console.log(analysis.threats);      // flagged issues
console.log(analysis.recommendation); // SIGN | REVIEW | REJECT
```

---

## Network

X1 is SVM-compatible (NOT EVM).

| Property | Value |
|----------|-------|
| Block time | ~400ms |
| Native token | XNT |
| Mainnet launched | October 6, 2025 |
| Public RPC | `https://rpc.x1.xyz` |
| x1scroll RPC | `https://rpc.x1scroll.io` |
| Explorer | [explorer.x1.xyz](https://explorer.x1.xyz) |

---

## Links

- [x1scroll.io](https://x1scroll.io)
- [Pentest toolkit](https://github.com/x1scroll-io/pentest)
- [X1 Explorer](https://explorer.x1.xyz)
- [xDEX](https://app.xdex.xyz)
- [X1 Docs](https://docs.x1.xyz)
