# x1scroll Pinning Registry — Validator Setup Guide
**Version:** 1.0
**Network:** X1 Mainnet
**Maintained by:** x1scroll.io

---

## Overview

The x1scroll Pinning Registry is the memory layer of the X1 blockchain. Every AI agent operating on X1 needs to read and write persistent memory — this protocol routes those requests through participating validators and pays them automatically.

As a validator, you are already running the hardware. This guide walks you through adding the pinning daemon to your existing setup. Once configured, your node becomes a memory node in the network and earns XNT passively on every agent memory operation routed to you — no manual work required.

**What you will run:**
- An IPFS node (local content storage)
- The x1scroll pinning daemon (listens for requests, confirms on-chain)

**What you earn:**
- 80% of every pin fee when an agent writes memory to your node
- 80% of every recall fee when an agent reads memory from your node
- The x1scroll treasury collects the remaining 20% as the protocol fee

**Time to complete this setup:** approximately 15–20 minutes

---

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores available (beyond validator) | 4+ cores |
| RAM | 2GB available | 4GB available |
| Disk | 50GB free | 500GB+ free |
| Network | Port 4001 (IPFS), Port 5000 (daemon) open | Same |
| Node.js | v18+ | v20+ |
| OS | Ubuntu 20.04+ | Ubuntu 22.04 |

> **Note:** IPFS storage grows over time as agents pin memory. Monitor disk usage and expand as needed. The daemon will reject oversized pin requests automatically based on your configured limit.

---

## Part 1 — Install IPFS (Kubo)

IPFS is the underlying storage layer. The pinning daemon communicates with your local IPFS node to store and retrieve content.

### 1.1 Download and install

```bash
# Download Kubo (IPFS implementation)
wget https://dist.ipfs.tech/kubo/v0.27.0/kubo_v0.27.0_linux-amd64.tar.gz
tar xzf kubo_v0.27.0_linux-amd64.tar.gz
sudo mv kubo/ipfs /usr/local/bin/
rm -rf kubo kubo_v0.27.0_linux-amd64.tar.gz
```

### 1.2 Initialize IPFS

```bash
# Initialize your IPFS node
ipfs init

# Configure the API to listen locally only (security best practice)
ipfs config Addresses.API /ip4/127.0.0.1/tcp/5001

# Configure the gateway (local only)
ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8080

# Set swarm to listen on all interfaces (needed for peer connections)
ipfs config --json Addresses.Swarm '["/ip4/0.0.0.0/tcp/4001", "/ip6/::/tcp/4001"]'
```

### 1.3 Start IPFS with PM2

```bash
# Install PM2 if not already installed
npm install -g pm2

# Start IPFS daemon
pm2 start "ipfs daemon" --name ipfs-node

# Save PM2 process list so it survives reboots
pm2 save

# Set PM2 to start on system boot
pm2 startup
# Run the command it outputs
```

### 1.4 Verify IPFS is running

```bash
curl http://127.0.0.1:5001/api/v0/id
```

Expected output (truncated):
```json
{
  "ID": "QmYourPeerID...",
  "AgentVersion": "kubo/0.27.0/...",
  ...
}
```

If you see a peer ID, IPFS is running correctly.

---

## Part 2 — Install the Pinning Daemon

The pinning daemon is the bridge between the x1scroll protocol and your IPFS node. It listens for incoming pin and recall requests, processes them through IPFS, and submits confirmation transactions on-chain to collect your fees.

### 2.1 Clone and install

```bash
# Navigate to your preferred directory
cd /opt

# Clone the daemon
git clone https://github.com/x1scroll-io/pinning-daemon.git
cd pinning-daemon

# Install dependencies
npm install
```

### 2.2 Configure the daemon

```bash
# Copy the example config
cp config.example.json config.json

# Edit your configuration
nano config.json
```

Fill in the following fields:

```json
{
  "validatorIdentity": "YOUR_VALIDATOR_IDENTITY_PUBKEY",
  "keypairPath": "/path/to/your/hot-keypair.json",
  "ipfsApiUrl": "http://127.0.0.1:5001",
  "listenPort": 5000,
  "rpcUrl": "https://rpc.x1scroll.io",
  "registryProgramId": "TBD_SEE_DOCS_FOR_CURRENT_ID",
  "confirmationTimeoutMs": 2000,
  "maxPinSizeMb": 10,
  "replicaCount": 3
}
```

**Field reference:**

| Field | Description |
|-------|-------------|
| `validatorIdentity` | Your validator's identity public key (from `solana-keygen pubkey identity.json`) |
| `keypairPath` | Path to a **hot keypair** used only for signing confirmation transactions. Do NOT use your withdraw authority or identity keypair here. Create a dedicated keypair for this purpose. |
| `ipfsApiUrl` | Your local IPFS API endpoint — do not change unless you moved IPFS to a different port |
| `listenPort` | Port the daemon listens on for incoming requests. Default: 5000. |
| `rpcUrl` | x1scroll RPC endpoint for submitting on-chain confirmations |
| `registryProgramId` | The pinning registry program ID — check x1scroll.io/docs for the current deployed ID |
| `confirmationTimeoutMs` | How long (ms) before a confirmation attempt times out. Keep at 2000. |
| `maxPinSizeMb` | Maximum size of a single pin request your node will accept. Default: 10MB. |
| `replicaCount` | How many validators must confirm a pin before it is considered live. Default: 3. |

### 2.3 Create a dedicated hot keypair

Do not use your validator identity or withdraw authority keypair with the daemon. Create a separate keypair with a small XNT balance for signing confirmation transactions only.

```bash
# Generate a dedicated hot keypair
solana-keygen new --outfile /opt/pinning-daemon/hot-keypair.json --no-bip39-passphrase

# Check the public key
solana-keygen pubkey /opt/pinning-daemon/hot-keypair.json

# Fund it with a small amount for transaction fees (~1 XNT is sufficient for thousands of confirmations)
solana transfer $(solana-keygen pubkey /opt/pinning-daemon/hot-keypair.json) 1 \
  --keypair /path/to/your/funding-keypair.json \
  --url https://rpc.x1scroll.io
```

Update `keypairPath` in `config.json` to point to this new keypair.

---

## Part 3 — Open Required Ports

The daemon needs two ports accessible from the internet:

```bash
# IPFS peer connections (required for content retrieval between nodes)
sudo ufw allow 4001/tcp
sudo ufw allow 4001/udp

# Pinning daemon (receives pin/recall requests from the protocol)
sudo ufw allow 5000/tcp

# Reload firewall
sudo ufw reload

# Verify
sudo ufw status
```

> **If you use a cloud provider** (Vultr, Hetzner, AWS, etc.), also open these ports in your hosting provider's firewall/security group panel in addition to UFW.

### Verify external reachability

From a separate machine or using an online port checker, confirm port 5000 is reachable:

```bash
# From another server
nc -zv YOUR_SERVER_IP 5000
```

---

## Part 4 — Start the Daemon

```bash
cd /opt/pinning-daemon

# Start with PM2
pm2 start daemon.js --name x1scroll-pin

# Save process list
pm2 save

# Check it started correctly
pm2 status
pm2 logs x1scroll-pin --lines 20
```

### Verify the daemon health endpoint

```bash
curl http://localhost:5000/health
```

Expected response:

```json
{
  "status": "ok",
  "ipfs": true,
  "identity": "YOUR_VALIDATOR_IDENTITY_PUBKEY",
  "pinsStored": 0,
  "uptimeSeconds": 12,
  "version": "1.0.0"
}
```

If `ipfs` shows `false`, the daemon cannot reach your IPFS node. Check that IPFS is running on port 5001.

---

## Part 5 — Register in the Pinning Registry

Once the daemon is running and healthy, register your validator in the on-chain pinning registry. Registration is **free**.

```bash
# Install the x1scroll CLI
npm install -g @x1scroll/cli

# Register your validator
x1scroll registry register \
  --validator-identity YOUR_IDENTITY_PUBKEY \
  --keypair /opt/pinning-daemon/hot-keypair.json \
  --endpoint https://YOUR_DOMAIN_OR_IP:5000

# Expected output:
# ✅ Validator registered in x1scroll Pinning Registry
# TX: <signature>
# Rotation position: <number>
# Status: active
```

**Using a domain name for your endpoint is strongly recommended** over a raw IP address. It allows you to change servers without re-registering.

### Verify your registration

```bash
x1scroll registry status --validator-identity YOUR_IDENTITY_PUBKEY
```

Expected output:
```
Validator: YOUR_IDENTITY_PUBKEY
Status:    active
Position:  <rotation slot>
Uptime:    100%
Pins stored: 0
Fees earned: 0 XNT
```

---

## Part 6 — Monitor Your Node

### Real-time logs

```bash
# Daemon logs (pin requests, confirmations, errors)
pm2 logs x1scroll-pin

# IPFS logs
pm2 logs ipfs-node
```

### Disk usage

IPFS content is stored at `~/.ipfs/blocks/` by default.

```bash
# Check IPFS storage usage
du -sh ~/.ipfs/
```

Set up a disk alert if you haven't already:

```bash
# Check disk
df -h
```

### Fee earnings

```bash
# Check lifetime earnings
x1scroll registry earnings --validator-identity YOUR_IDENTITY_PUBKEY

# Output:
# Total pins served:    1,234
# Total recalls served: 5,678
# Total XNT earned:     12.45 XNT
# Pending payout:       0.32 XNT
```

---

## Part 7 — Keep Your Node Healthy

The protocol enforces performance standards automatically. Here is what the registry tracks:

| Metric | Threshold | Consequence |
|--------|-----------|-------------|
| Confirmation response time | Must confirm within 2 seconds | Missed confirmations reduce rotation priority |
| Consecutive misses | 5 in a row | Suspended from rotation |
| Epoch miss count | 20 in one epoch | Ejected from registry |

**To stay in good standing:**
- Keep your server online and the daemon running via PM2 with auto-restart
- Keep your IPFS node running and responsive
- Keep your hot keypair funded (check balance periodically, top up if it drops below 0.5 XNT)
- Monitor disk — if IPFS fills your disk, the daemon will start rejecting requests

### Set up a hot keypair balance alert

```bash
# Add to crontab — alerts if hot keypair drops below 0.5 XNT
crontab -e

# Add this line:
*/30 * * * * BALANCE=$(solana balance $(solana-keygen pubkey /opt/pinning-daemon/hot-keypair.json) --url https://rpc.x1scroll.io | awk '{print $1}'); if (( $(echo "$BALANCE < 0.5" | bc -l) )); then echo "🚨 Pinning daemon keypair low: $BALANCE XNT" | telegram-send -; fi
```

---

## Troubleshooting

### Daemon won't start

```bash
# Check logs for errors
pm2 logs x1scroll-pin --lines 50

# Common causes:
# - config.json missing or malformed → check JSON syntax
# - keypairPath file not found → verify the path
# - IPFS not running → pm2 restart ipfs-node
# - Port 5000 already in use → lsof -i :5000
```

### IPFS shows false in health check

```bash
# Verify IPFS is running
pm2 status

# Try starting it manually to see errors
ipfs daemon

# Check IPFS API port
curl http://127.0.0.1:5001/api/v0/id
```

### Confirmations timing out

```bash
# Check your RPC connectivity
curl -s -X POST https://rpc.x1scroll.io \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
# Should return: {"result":"ok"}

# Check hot keypair balance
solana balance $(solana-keygen pubkey /opt/pinning-daemon/hot-keypair.json) \
  --url https://rpc.x1scroll.io
# If 0 → fund the keypair
```

### Suspended from rotation

If you were suspended due to missed confirmations, your daemon will automatically attempt to resume once the miss count resets. To check status:

```bash
x1scroll registry status --validator-identity YOUR_IDENTITY_PUBKEY
```

If ejected, re-register:

```bash
x1scroll registry register \
  --validator-identity YOUR_IDENTITY_PUBKEY \
  --keypair /opt/pinning-daemon/hot-keypair.json \
  --endpoint https://YOUR_DOMAIN_OR_IP:5000
```

---

## Deregister (Exit the Registry)

If you need to leave the registry:

```bash
x1scroll registry deregister \
  --validator-identity YOUR_IDENTITY_PUBKEY \
  --keypair /opt/pinning-daemon/hot-keypair.json
```

Your node will be removed from the rotation immediately. You can re-register at any time for free.

```bash
# Stop the daemon
pm2 stop x1scroll-pin
pm2 delete x1scroll-pin

# Optionally stop IPFS
pm2 stop ipfs-node
```

---

## Quick Reference

```bash
# Check daemon status
pm2 status x1scroll-pin

# View live logs
pm2 logs x1scroll-pin

# Restart daemon
pm2 restart x1scroll-pin

# Check health
curl http://localhost:5000/health

# Check earnings
x1scroll registry earnings --validator-identity YOUR_PUBKEY

# Check registry status
x1scroll registry status --validator-identity YOUR_PUBKEY

# Check IPFS storage
du -sh ~/.ipfs/

# Check hot keypair balance
solana balance $(solana-keygen pubkey /opt/pinning-daemon/hot-keypair.json) --url https://rpc.x1scroll.io
```

---

## Security Notes

- **Never use your validator withdraw authority keypair with the daemon.** The hot keypair only needs enough XNT to pay transaction fees. Keep it funded with small amounts only.
- **Your IPFS API (port 5001) should never be publicly accessible.** It is configured to listen on 127.0.0.1 only. Do not change this.
- **The daemon endpoint (port 5000) must be publicly accessible** so the protocol can route requests to you.
- Regularly check for daemon updates: `cd /opt/pinning-daemon && git pull && npm install && pm2 restart x1scroll-pin`

---

## Support

- Documentation: x1scroll.io/docs
- GitHub: github.com/x1scroll-io/pinning-daemon
- Issues: github.com/x1scroll-io/pinning-daemon/issues
- Telegram: @ArnettX1
- Discord: x1scroll.io/discord
