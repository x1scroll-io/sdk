# How to Connect an Agent to the x1scroll SDK
**Network:** X1 Mainnet
**SDK:** agent-identity-sdk v1.3.0+
**Maintained by:** x1scroll.io

---

## Overview

This guide walks you through connecting an AI agent to the x1scroll memory protocol on X1. Once connected, your agent can:

- Register a persistent identity on-chain
- Write memory shards to IPFS with on-chain proof
- Recall memory from prior sessions
- Link decisions across agents (cross-agent memory)

All memory is content-addressed, tamper-proof, and permanently accessible via the x1scroll archival RPC.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js v18+ | `node --version` to check |
| X1 keypair | Funded with at least 2 XNT for fees and rent |
| `agent-identity-sdk` | Installed via npm |

---

## Step 1 — Install the SDK

```bash
npm install @x1scroll/agent-identity-sdk
```

---

## Step 2 — Set Up Your Keypairs

You need two keypairs:

- **Human keypair** — represents the owner/operator of the agent. This is your wallet.
- **Agent keypair** — a separate keypair that represents the agent's on-chain identity.

```javascript
import { Keypair } from '@solana/web3.js';
import fs from 'fs';

// Load your human (owner) keypair
const humanKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync('/path/to/your-wallet.json')))
);

// Generate a new agent keypair (do this once, then save it)
const agentKeypair = Keypair.generate();
fs.writeFileSync('./agent-keypair.json', JSON.stringify(Array.from(agentKeypair.secretKey)));

// Or load an existing agent keypair
// const agentKeypair = Keypair.fromSecretKey(
//   Uint8Array.from(JSON.parse(fs.readFileSync('./agent-keypair.json')))
// );

console.log('Human pubkey:', humanKeypair.publicKey.toBase58());
console.log('Agent pubkey:', agentKeypair.publicKey.toBase58());
```

Fund the agent keypair with a small amount of XNT for transaction fees (~0.5 XNT is sufficient to start):

```bash
solana transfer <AGENT_PUBKEY> 0.5 --keypair /path/to/your-wallet.json --url https://rpc.x1scroll.io
```

---

## Step 3 — Initialize the SDK Client

```javascript
import { AgentClient } from '@x1scroll/agent-identity-sdk';
import { Connection } from '@solana/web3.js';

const connection = new Connection('https://rpc.x1scroll.io', 'confirmed');

const client = new AgentClient(connection);
```

---

## Step 4 — Pin Your Agent's Initial Memory to IPFS

Before registering, you must pin your agent's initial memory shard to IPFS and obtain a real CID. This becomes the root of your agent's memory chain.

```javascript
import fetch from 'node-fetch';
import FormData from 'form-data';

async function pinToIPFS(content) {
  const form = new FormData();
  form.append('file', Buffer.from(JSON.stringify(content)), {
    filename: 'memory.json',
    contentType: 'application/json'
  });

  const response = await fetch('https://x1scroll.io/api/ipfs/upload', {
    method: 'POST',
    body: form,
    headers: form.getHeaders()
  });

  const result = await response.json();
  if (!result.cid) throw new Error('Pin failed: ' + JSON.stringify(result));
  return result.cid;
}

// Define your agent's initial memory
const initialMemory = {
  agentName: 'MyAgent-v1',
  created: new Date().toISOString(),
  capabilities: ['task-execution', 'memory-recall'],
  version: '1.0.0'
};

const cid = await pinToIPFS(initialMemory);
console.log('Pinned CID:', cid);
// Example: QmXXkL6pBCuSDQLjQZLVJcH7HhzPKpfUTsYurjhJodfhLi
```

> **Important:** Always pin content first, then register. The `register()` function requires a real IPFS CID — not a placeholder.

---

## Step 5 — Register Your Agent On-Chain

```javascript
const agentName = 'MyAgent-v1'; // Max 64 characters

const tx = await client.register(
  humanKeypair.publicKey,  // human/owner pubkey
  agentKeypair,            // agent keypair (signs the tx)
  agentName,               // agent display name
  cid,                     // IPFS CID from Step 4
  cid                      // root CID (same as initial CID)
);

console.log('Agent registered! TX:', tx);
console.log('Agent identity on-chain:', agentKeypair.publicKey.toBase58());
```

Your agent now has a permanent identity on X1. The registration creates an `AgentRecord` PDA on-chain that anchors all future memory writes.

---

## Step 6 — Write Decisions (Memory Writes)

Every time your agent makes a decision, completes a task, or wants to record something for future recall — write it as a decision on-chain.

```javascript
// Simple form — type + message (recommended for most use cases)
const decisionTx = await client.decisionWrite(
  agentKeypair,
  'TASK_COMPLETE',
  'Analyzed market conditions and determined XNT price trend is bullish'
);

console.log('Decision written! TX:', decisionTx);
```

**Decision types** (use any string up to 64 chars — these are examples):

| Type | Use case |
|------|----------|
| `TASK_COMPLETE` | Agent finished a task |
| `OBSERVATION` | Agent recorded an observation |
| `MEMORY_STORE` | Agent storing knowledge for recall |
| `DECISION` | Agent made a choice |
| `HANDOFF` | Agent passing context to another agent |
| `ERROR` | Agent recording a failure |

### Writing with a CID reference (for larger memory payloads)

For content too large to fit in a transaction, pin it first and reference the CID:

```javascript
// Pin the detailed memory content
const memoryCid = await pinToIPFS({
  observation: 'Detailed market analysis...',
  data: { price: 0.35, volume: 12000, trend: 'up' },
  timestamp: Date.now()
});

// Write the decision with CID reference
const decisionTx = await client.decisionWrite(
  agentKeypair,
  'OBSERVATION',
  memoryCid  // use the CID as the message — links on-chain to IPFS content
);
```

---

## Step 7 — Recall Memory

To retrieve an agent's memory history from the chain:

```javascript
// Get the agent's decision history
const agentRecordPDA = await client.deriveAgentRecord(agentKeypair.publicKey);

// Fetch decisions (returns array of on-chain decision records)
const decisions = await client.listDecisions(agentRecordPDA);

for (const decision of decisions) {
  console.log('Type:', decision.decisionType);
  console.log('Message:', decision.message);
  console.log('Timestamp:', decision.timestamp);
  console.log('---');
}
```

If a decision's message is a CID, fetch the full content from IPFS:

```javascript
async function recallFromIPFS(cid) {
  const response = await fetch(`https://x1scroll.io/api/ipfs/${cid}`);
  return response.json();
}

for (const decision of decisions) {
  if (decision.message.startsWith('Qm') || decision.message.startsWith('baf')) {
    const content = await recallFromIPFS(decision.message);
    console.log('Recalled content:', content);
  }
}
```

---

## Step 8 — Cross-Agent Memory Linking

To link your agent's decisions to another agent's memory (building the hive mind chain):

```javascript
// Alpha agent's CID you want to reference
const alphaAgentCid = 'QmbwkYVwSCv63gCfgFcxJhfZrJqpaRHWThxrA8GqaBTdHi';

// Pin your response/continuation memory
const betaCid = await pinToIPFS({
  references: [alphaAgentCid],
  continuation: 'Building on Alpha agent analysis...',
  timestamp: Date.now()
});

// Write decision with parentHash linking to Alpha's CID
// Advanced form: decisionWrite(keypair, type, message, outcome, confidence, parentHash)
const linkTx = await client.decisionWrite(
  agentKeypair,
  'CONTINUATION',
  betaCid,      // this agent's content CID
  1,            // outcome: 1 = executed
  9500,         // confidence: 9500 = 95% (basis points)
  alphaAgentCid // parentHash: links back to Alpha's memory shard
);

console.log('Cross-agent link written! TX:', linkTx);
```

This creates a permanent, traversable breadcrumb on-chain. Any agent — or the x1scroll indexer — can follow the parentHash chain backwards to reconstruct the full decision lineage.

---

## Complete Example — Agent Session Loop

```javascript
import { AgentClient } from '@x1scroll/agent-identity-sdk';
import { Connection, Keypair } from '@solana/web3.js';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

const connection = new Connection('https://rpc.x1scroll.io', 'confirmed');
const client = new AgentClient(connection);

const humanKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync('./human-wallet.json')))
);
const agentKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync('./agent-keypair.json')))
);

async function pinToIPFS(content) {
  const form = new FormData();
  form.append('file', Buffer.from(JSON.stringify(content)), {
    filename: 'memory.json', contentType: 'application/json'
  });
  const res = await fetch('https://x1scroll.io/api/ipfs/upload', {
    method: 'POST', body: form, headers: form.getHeaders()
  });
  const data = await res.json();
  if (!data.cid) throw new Error('Pin failed');
  return data.cid;
}

async function runAgentSession(task) {
  console.log('Starting agent session for task:', task);

  // 1. Pin session context
  const sessionCid = await pinToIPFS({
    task,
    startTime: Date.now(),
    agentId: agentKeypair.publicKey.toBase58()
  });

  // 2. Record session start
  await client.decisionWrite(agentKeypair, 'SESSION_START', sessionCid);

  // 3. Do work...
  const result = await doWork(task);

  // 4. Pin result
  const resultCid = await pinToIPFS({
    task,
    result,
    completedAt: Date.now()
  });

  // 5. Record completion
  await client.decisionWrite(agentKeypair, 'TASK_COMPLETE', resultCid);

  console.log('Session complete. Memory persisted on-chain.');
}

async function doWork(task) {
  // Your agent logic here
  return { status: 'done', output: `Completed: ${task}` };
}

runAgentSession('Analyze XNT price trends').catch(console.error);
```

---

## SDK Quick Reference

```javascript
// Initialize
const client = new AgentClient(connection);

// Register agent (one time)
await client.register(humanPubkey, agentKeypair, name, cid, rootCid);

// Write decision (simple)
await client.decisionWrite(agentKeypair, 'TYPE', 'message');

// Write decision (with CID + cross-agent link)
await client.decisionWrite(agentKeypair, 'TYPE', cid, outcome, confidence, parentHash);

// Derive agent PDA
const pda = await client.deriveAgentRecord(agentKeypair.publicKey);

// List decisions
const decisions = await client.listDecisions(pda);

// Pin to IPFS
POST https://x1scroll.io/api/ipfs/upload  (multipart/form-data, field: file)
→ returns { cid: "QmXXX..." }

// Recall from IPFS
GET https://x1scroll.io/api/ipfs/<CID>
```

---

## Known SDK Quirks (v1.3.0)

- `register()` **requires a pre-pinned CID** — pin content first, then register
- `uploadMemory()` is for post-registration updates only — agent must be registered first
- `decisionWrite()` outcome must be an integer: `0`=pending, `1`=executed, `2`=rejected
- `decisionWrite()` confidence is in basis points: `9500` = 95%
- `parentHash` takes a raw hex string or CID string — not a Buffer
- All string fields (branchLabel, message, cid) are capped at **64 characters**
- `storeMemory()` hits account size limits on mature agent records — use `decisionWrite()` for ongoing writes

---

## RPC Endpoints

| Endpoint | Use |
|----------|-----|
| `https://rpc.x1scroll.io` | x1scroll archival RPC (full history) |
| `https://rpc.x1.xyz` | X1 public RPC |
| `http://104.250.159.138:8899` | x1scroll direct node |

---

## Support

- Docs: x1scroll.io/docs
- GitHub: github.com/x1scroll-io/sdk
- Telegram: @ArnettX1
