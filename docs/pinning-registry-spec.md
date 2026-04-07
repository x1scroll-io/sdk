# x1scroll Pinning Registry — Protocol Specification
**Version:** 0.2 (draft)
**Author:** ArnettX1 / x1scroll.io
**Date:** 2026-04-07
**Status:** Design spec — not yet deployed

---

## The Vision

x1scroll is the sewer system of the X1 blockchain.

Jack is building the city. Every agent, protocol, and application that runs on X1 needs persistent memory — the ability to write knowledge, recall it later, and link decisions across time. That memory has to live somewhere reliable, decentralized, and permanent.

x1scroll built the pipes. Validators are the infrastructure. Agents are the buildings. Every gallon of memory that flows through the network generates a fee — and x1scroll collects 20% of every gallon, forever.

Nobody thinks about the sewer system until it breaks. That's the point. It's invisible, essential, and whoever built it collects the utility fee on everything that flows through it.

---

## Core Design Principles

- **Immutable contract** — no upgrade authority, no admin key. Rules set at deploy, run forever. No one controls the lever.
- **Mandatory participation** — baked into X1 validator setup docs. Every validator on X1 is automatically part of the network.
- **Free to join** — zero registration fee. Validators earn, never pay to participate.
- **Treasury fee** — 80% of every operation fee to the serving validator. 20% to x1scroll treasury. Always.
- **Round robin routing** — deterministic, fair, auditable. No gatekeeping.

---

## Architecture

```
Agent SDK
    │
    ▼
x1scroll Pinning Registry Program (immutable, on-chain)
    │  reads validator list + rotation counter
    ▼
Selected Validator (round robin)
    │  receives pin/recall request
    ▼
Validator Pinning Daemon (off-chain service)
    │  talks to local IPFS node
    ▼
IPFS Node (local to validator)
    │  stores content, returns CID confirmation
    ▼
On-chain confirmation tx → fee split: 80% validator / 20% x1scroll treasury
```

---

## Fee Structure

| Action | Agent pays | Validator earns (80%) | x1scroll treasury (20%) |
|--------|-----------|----------------------|------------------------|
| Pin memory shard | 0.01 XNT | 0.008 XNT | 0.002 XNT |
| Recall memory shard | 0.005 XNT | 0.004 XNT | 0.001 XNT |

*Fees subject to change before mainnet deploy. Split ratio is immutable once deployed.*

---

## Revenue Projections (treasury fee only)

| Active Agents | Daily ops | Treasury cut/day | At $1 XNT | At $10 XNT |
|---------------|-----------|------------------|-----------|-----------|
| 100 | 3,000 | ~6 XNT | $6/day | $60/day |
| 1,000 | 30,000 | ~60 XNT | $60/day | $600/day |
| 5,000 | 150,000 | ~300 XNT | $300/day | $3,000/day |
| 10,000 | 300,000 | ~600 XNT | $600/day | $6,000/day |

*Assumes 30 ops/agent/day (10 pins + 20 recalls). Recurring daily, compounding as agent count grows.*

---

## Validator Registration

### Cost
**Free.** Zero XNT. No barrier to entry.

### How
Mandatory — part of X1 validator setup documentation. Every new validator that spins up on X1 runs the pinning daemon and registers in the registry as part of standard node configuration. Same as funding a vote account or identity address — it's just part of the process.

```bash
# Part of standard X1 validator setup (Step 7)
# Install and start pinning daemon
git clone https://github.com/x1scroll-io/pinning-daemon.git
cd pinning-daemon && npm install
pm2 start daemon.js --name x1scroll-pin

# Register in pinning registry (free)
x1scroll registry register --validator-identity <IDENTITY_PUBKEY> --keypair <KEYPAIR_PATH> --endpoint https://<YOUR_IP>:5000
```

### What validators earn
- 80% of every pin fee routed to them
- 80% of every recall fee routed to them
- Passive income — hardware is already running
- More agents on X1 = more fees with zero additional work

---

## Routing — Round Robin

Pure round robin with skip-on-timeout. Deterministic, fair, auditable.

```
Rotation counter (on-chain) → selects next validator in list → request sent → 2 second window to confirm → if no response → skip → next validator → miss recorded
```

### Rules
- **Response window:** 2 seconds (X1 confirms in 400ms — 2s is generous)
- **Miss threshold:** 5 consecutive misses → suspended from rotation
- **Ejection:** 20 total misses in an epoch → removed from registry
- **Re-entry:** re-run setup process, free to rejoin
- No weighting by stake. Every validator gets equal rotation. Fair by design.

### Why round robin and not weighted
X1 already has foundation validators with 100-200M XNT stake. Weighted rotation by stake would let them dominate every request. Round robin means the validator with 50K XNT stake gets the same rotation slot as the validator with 200M XNT. Performance (uptime, response time) determines who earns — not capital.

---

## Replication

Every pin is replicated to **3 validators minimum** before confirmation is final.

- Primary validator (selected by rotation): pins first → earns primary fee
- 2 additional validators selected from rotation: confirm replication → earn replication share
- If any validator goes offline: content still served by remaining 2
- IPFS is content-addressed — any node holding the CID can serve it, first to respond collects retrieval fee

---

## Scale

| Validators in registry | Max daily ops (comfortable) | Agent capacity |
|------------------------|----------------------------|----------------|
| 10 | 50,000–100,000 | ~1,500 agents |
| 50 | 250,000–500,000 | ~8,000 agents |
| 100 | 500,000–1,000,000 | ~16,000 agents |
| 2,000 (all X1 validators) | 10M–20M | ~300,000+ agents |

X1 at 400ms block times is never the bottleneck. IPFS throughput and daemon response time scale horizontally with validator count. More validators join X1 → more capacity automatically.

---

## Launch Sequencing

Don't flood supply before demand exists. Stage registry growth with agent onboarding:

- **Phase 1 (dev):** x1scroll validators only, 10-20 test agents — prove the loop
- **Phase 2 (beta):** open to foundation validators (top 20-30), 100-500 agents
- **Phase 3 (public):** open registry to all X1 validators, mandatory in setup docs

---

## Smart Contract

- **No upgrade authority** — immutable at deploy
- **No admin key** — no one controls the rotation, fee split, or validator list
- **On-chain rotation counter** — publicly auditable, anyone can verify fairness
- **Fee split hardcoded** — 80/20 validator/treasury, cannot be changed after deploy
- **Treasury address hardcoded** — x1scroll treasury, cannot be redirected

This is what makes it trustworthy enough to be mandatory protocol infrastructure. Jack can point to the contract and say: "This isn't x1scroll's product to control — it's the chain's memory layer."

---

## Roadmap

- [ ] Deploy `pinning-registry` Anchor program on X1 mainnet (immutable)
- [ ] Release pinning daemon v0.1 (open source — github.com/x1scroll-io/pinning-daemon)
- [ ] Release x1scroll CLI with `registry register` command
- [ ] Coordinate with Jack / X1 Labs — add pinning registry to official validator setup docs
- [ ] Phase 1 internal testing (x1scroll validators only)
- [ ] Phase 2 foundation validator onboarding
- [ ] Phase 3 public — open registry, mandatory in X1 docs
- [ ] Explorer dashboard — live rotation status, validator uptime, fee earnings, pin counts

---

## x1scroll Revenue Stack (full picture)

| Revenue stream | Mechanism | Recurring |
|----------------|-----------|-----------|
| Pinning treasury fee | 20% of every agent memory op | ✅ Daily |
| Agent onboarding fee | Per-agent registration on protocol | ✅ Per agent |
| RPC subscriptions | Archival RPC access tiers | ✅ Monthly |
| Validator staking commission | Stake delegated to x1scroll validators | ✅ Per epoch |
| Task Board protocol fee | 5% post + 5% completion on every task | ✅ Per task |

---

## Contact

Protocol design: ArnettX1 (@ArnettX1)
Infrastructure: x1scroll.io
GitHub: github.com/x1scroll-io
