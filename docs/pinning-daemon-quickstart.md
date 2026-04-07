# x1scroll Pinning Daemon — Validator Quickstart
**For:** X1 validators joining the x1scroll Pinning Registry
**Time to set up:** ~15 minutes

---

## What Is This?

The pinning daemon is a small background service you run alongside your validator. It connects your local IPFS node to the x1scroll Pinning Registry so you can:

- Receive agent memory pin requests routed to you
- Store agent memory on your IPFS node
- Confirm storage on-chain and collect XNT fees automatically

**You're already running the hardware. This is just passive income on top of what you already do.**

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| X1 validator running | Identity registered on-chain |
| Node.js v18+ | `node --version` to check |
| Port 5000 open | Or any port you choose |
| 100 XNT to stake | Locked in registry escrow, returned on exit |
| Domain or static IP | For your pinning endpoint |

---

## Step 1 — Install IPFS

If you don't already have an IPFS node running:

```bash
wget https://dist.ipfs.tech/kubo/v0.27.0/kubo_v0.27.0_linux-amd64.tar.gz
tar xzf kubo_v0.27.0_linux-amd64.tar.gz
sudo mv kubo/ipfs /usr/local/bin/

ipfs init
ipfs config Addresses.API /ip4/127.0.0.1/tcp/5001
ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8080

# Start IPFS daemon
ipfs daemon &

# Or with PM2 (recommended)
pm2 start "ipfs daemon" --name ipfs-node
pm2 save
```

Verify:
```bash
curl http://127.0.0.1:5001/api/v0/id
# Should return your IPFS peer ID
```

---

## Step 2 — Install the Pinning Daemon

```bash
git clone https://github.com/x1scroll-io/pinning-daemon.git
cd pinning-daemon
npm install
cp config.example.json config.json
```

---

## Step 3 — Configure

Edit `config.json`:

```json
{
  "validatorIdentity": "YOUR_VALIDATOR_IDENTITY_PUBKEY",
  "keypairPath": "/path/to/your/validator-keypair.json",
  "ipfsApiUrl": "http://127.0.0.1:5001",
  "listenPort": 5000,
  "rpcUrl": "https://rpc.x1scroll.io",
  "registryProgramId": "TBD_ON_DEPLOY",
  "confirmationTimeoutMs": 2000,
  "maxPinSizeMb": 10
}
```

**Important:** The keypair is used only to sign confirmation transactions. It does not need to be your withdraw authority — use a separate hot key with a small XNT balance (~1 XNT) for signing fees.

---

## Step 4 — Open Firewall

```bash
# Allow incoming pin requests
ufw allow 5000/tcp

# Verify your port is reachable from outside
# (test from another machine)
curl http://YOUR_IP:5000/health
```

---

## Step 5 — Start the Daemon

```bash
# With PM2 (recommended — auto-restarts on crash)
pm2 start daemon.js --name x1scroll-pin
pm2 save

# Check it's running
pm2 status
pm2 logs x1scroll-pin
```

Health check:
```bash
curl http://localhost:5000/health
# Returns:
# {
#   "status": "ok",
#   "ipfs": true,
#   "identity": "YOUR_PUBKEY",
#   "pinsStored": 0,
#   "uptimeSeconds": 42
# }
```

---

## Step 6 — Register On-Chain

```bash
# Using x1scroll CLI
npm install -g @x1scroll/cli

x1scroll registry register \
  --validator-identity YOUR_IDENTITY_PUBKEY \
  --keypair /path/to/keypair.json \
  --endpoint https://YOUR_DOMAIN_OR_IP:5000 \
  --stake 100

# Output:
# ✅ Registered in pinning registry
# TX: <signature>
# Rotation position: 7
# Stake locked: 100 XNT
```

That's it. You're in the rotation.

---

## How Fees Work

Every time an agent's memory pin or recall routes to you:

1. You receive the request on port 5000
2. Daemon pins/serves the content via your local IPFS node
3. Daemon submits a confirmation tx on-chain within 2 seconds
4. Fee is released to your validator wallet automatically

**You must confirm within 2 seconds.** If you miss a request, rotation advances to the next validator. Miss 5 in a row → suspended. Miss 20 in an epoch → ejected and 20% of stake slashed.

**Estimated earnings** (projections, not guaranteed):
- 100 agents × 10 memory ops/day = 1,000 daily requests
- At 0.007 XNT per pin: ~7 XNT/day passive at 1,000 agents
- At 10,000 agents: ~700 XNT/day

As the hive grows, every validator in the registry earns more.

---

## Deregister (Exit)

```bash
x1scroll registry deregister \
  --validator-identity YOUR_IDENTITY_PUBKEY \
  --keypair /path/to/keypair.json

# Stake returned after 1 epoch cooldown
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `IPFS connection refused` | Make sure `ipfs daemon` is running on port 5001 |
| `Confirmation timeout` | Check RPC connectivity to rpc.x1scroll.io |
| `Port unreachable` | Check `ufw allow 5000/tcp` and hosting firewall rules |
| `Keypair error` | Verify keypair path and that it has XNT for tx fees |
| `Suspended from rotation` | Check `pm2 logs x1scroll-pin` for missed confirmations |

---

## Support

- Docs: x1scroll.io/docs
- GitHub: github.com/x1scroll-io/pinning-daemon
- Telegram: @ArnettX1
