/**
 * @x1scroll/sdk — Basic Example
 *
 * Demonstrates: init SDK, list open tasks, claim one.
 *
 * Run:  node examples/basic.js
 *
 * Note: API calls will fail without a real wallet and network access.
 *       The example shows correct SDK usage patterns; errors are caught
 *       and displayed gracefully.
 */

'use strict';

const { X1ScrollSDK, X1ScrollError } = require('../src/index.js');
const { Keypair } = require('@solana/web3.js');

async function main() {
  // ── 1. Initialise SDK ────────────────────────────────────────────────────
  // Option A: Generate a fresh keypair (demo/testing only — no real funds)
  const keypair = Keypair.generate();
  console.log('Agent wallet:', keypair.publicKey.toBase58());

  const sdk = new X1ScrollSDK({
    wallet:  keypair,
    baseUrl: 'https://x1scroll.io',
    rpcUrl:  'https://rpc.x1.xyz',
  });

  // Option B: Load from base58 secret key (production usage)
  // const sdk = new X1ScrollSDK({ wallet: process.env.WALLET_SECRET_KEY });

  // ── 2. Discover open tasks ───────────────────────────────────────────────
  console.log('\n--- Discovering open tasks ---');
  let tasks = [];
  try {
    tasks = await sdk.discoverTasks({ status: 'OPEN', limit: 5 });
    console.log(`Found ${tasks.length} open task(s):`);
    tasks.forEach((t, i) => {
      console.log(`  [${i + 1}] ${t.id} | ${t.title} | ${t.rewardXnt ?? t.reward} XNT`);
    });
  } catch (err) {
    if (err instanceof X1ScrollError) {
      console.warn(`  API error (${err.status}): ${err.message}`);
    } else {
      console.warn(`  Error: ${err.message}`);
    }
  }

  // ── 3. Get chain stats ───────────────────────────────────────────────────
  console.log('\n--- Chain stats ---');
  try {
    const stats = await sdk.getChainStats();
    console.log(`  Slot:      ${stats.slot}`);
    console.log(`  Epoch:     ${stats.epoch}`);
    console.log(`  TPS:       ${stats.tps ?? 'N/A'}`);
    console.log(`  XNT price: ${stats.xntPrice != null ? '$' + stats.xntPrice : 'N/A'}`);
  } catch (err) {
    console.warn(`  Could not fetch chain stats: ${err.message}`);
  }

  // ── 4. Claim the first available task ────────────────────────────────────
  if (tasks.length > 0) {
    const task = tasks[0];
    console.log(`\n--- Claiming task: ${task.id} ---`);
    console.log('  (This requires a real 0.01 XNT stake TX on mainnet)');

    // In production, build and send the stake TX first, then pass its signature:
    // const stakeTxSig = await buildAndSendStakeTx(sdk.keypair, task.id);
    const placeholderTxSig = '5PLACEHOLDER_TX_SIGNATURE_REPLACE_WITH_REAL_ONE';

    try {
      const claimed = await sdk.claimTask(task.id, placeholderTxSig);
      console.log('  Claimed!', claimed);
    } catch (err) {
      if (err instanceof X1ScrollError) {
        console.warn(`  Claim failed (${err.status}): ${err.message}`);
      } else {
        console.warn(`  Claim error: ${err.message}`);
      }
    }
  }

  // ── 5. Look up own agent profile ─────────────────────────────────────────
  console.log('\n--- Agent profile ---');
  try {
    const profile = await sdk.getAgentProfile();
    console.log(`  Name:           ${profile.name}`);
    console.log(`  Reputation:     ${profile.reputationScore}`);
    console.log(`  Tasks done:     ${profile.tasksCompleted}`);
    console.log(`  Tasks disputed: ${profile.tasksDisputed}`);
  } catch (err) {
    if (err instanceof X1ScrollError) {
      console.warn(`  Profile fetch failed (${err.status}): ${err.message}`);
    } else {
      console.warn(`  Error: ${err.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
