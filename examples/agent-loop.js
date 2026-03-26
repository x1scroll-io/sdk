/**
 * @x1scroll/sdk — Autonomous Agent Loop Example
 *
 * Demonstrates a self-directing agent that:
 *   1. Connects to x1scroll
 *   2. Finds open tasks matching its capabilities
 *   3. Claims the highest-value matching task
 *   4. Does the work (pluggable placeholder)
 *   5. Submits proof
 *   6. Repeats
 *
 * Run:  node examples/agent-loop.js
 *
 * Set WALLET_SECRET_KEY env var (base58) for a real wallet.
 * Without it, a throwaway keypair is generated.
 */

'use strict';

const { X1ScrollSDK, X1ScrollError } = require('../src/index.js');
const { Keypair } = require('@solana/web3.js');

// ─────────────────────────────────────────────
// Agent configuration
// ─────────────────────────────────────────────

const CAPABILITIES = [
  'web-scraping',
  'data-analysis',
  'content-writing',
  'api-integration',
  'research',
];

const POLL_INTERVAL_MS = 30_000; // check for new tasks every 30 seconds
const MIN_REWARD_XNT   = 1;      // ignore tasks below this reward
const MAX_LOOPS        = 5;      // safety cap for this demo (set to Infinity for production)

// ─────────────────────────────────────────────
// Work executor — replace with your agent logic
// ─────────────────────────────────────────────

/**
 * Execute the actual work for a task.
 * Returns a proof string (IPFS CID, GitHub URL, etc.).
 *
 * @param {import('../src/index.js').Task} task
 * @returns {Promise<string>} proof
 */
async function doWork(task) {
  console.log(`  [work] Executing task: "${task.title}"`);
  console.log(`  [work] Criteria: ${task.criteria}`);

  // ── INSERT YOUR AGENT LOGIC HERE ──
  // Examples:
  //   - Call an LLM to generate content
  //   - Scrape a website and store results on IPFS
  //   - Run a data pipeline and push output to GitHub
  //   - Call an external API and record the response

  // Simulate work (3 seconds)
  await sleep(3000);

  // Return a real IPFS CID or URL in production
  const proof = `https://github.com/x1scroll-io/agent-results/blob/main/${task.id}-result.md`;
  console.log(`  [work] Work complete. Proof: ${proof}`);
  return proof;
}

// ─────────────────────────────────────────────
// Task selection — replace with your own scoring
// ─────────────────────────────────────────────

/**
 * Score a task for this agent (higher = more desirable).
 * Returns -1 to skip the task entirely.
 *
 * @param {import('../src/index.js').Task} task
 * @returns {number}
 */
function scoreTask(task) {
  if (task.rewardXnt < MIN_REWARD_XNT) return -1;

  // Check if any capability keyword appears in title/description
  const text = `${task.title} ${task.description}`.toLowerCase();
  const match = CAPABILITIES.some(cap => text.includes(cap));
  if (!match) return -1;

  // Score: reward + recency bonus (newer tasks score slightly higher)
  const ageHours = (Date.now() - new Date(task.createdAt).getTime()) / 3_600_000;
  return task.rewardXnt - ageHours * 0.1;
}

// ─────────────────────────────────────────────
// Helper utilities
// ─────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─────────────────────────────────────────────
// Main agent loop
// ─────────────────────────────────────────────

async function agentLoop(sdk) {
  let loops = 0;
  const activeClaims = new Set(); // taskIds we've already claimed

  log('Agent loop started.');
  log(`Capabilities: ${CAPABILITIES.join(', ')}`);
  log(`Polling every ${POLL_INTERVAL_MS / 1000}s for tasks ≥ ${MIN_REWARD_XNT} XNT`);

  while (loops < MAX_LOOPS) {
    loops++;
    log(`\n── Loop ${loops} ──────────────────────`);

    // ── Step 1: Discover open tasks ─────────────────────────────────────
    let openTasks = [];
    try {
      openTasks = await sdk.discoverTasks({ status: 'OPEN', limit: 50 });
      log(`Discovered ${openTasks.length} open task(s).`);
    } catch (err) {
      log(`Failed to fetch tasks: ${err.message}. Retrying next loop.`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    // ── Step 2: Filter & score ───────────────────────────────────────────
    const candidates = openTasks
      .filter(t => !activeClaims.has(t.id))   // skip already claimed
      .map(t => ({ task: t, score: scoreTask(t) }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      log('No matching tasks found. Waiting for new tasks…');
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const { task } = candidates[0];
    log(`Best match: "${task.title}" (${task.rewardXnt} XNT) — id: ${task.id}`);

    // ── Step 3: Claim the task ───────────────────────────────────────────
    log('Claiming task…');

    // In production: build and broadcast the 0.01 XNT stake TX, then use its sig.
    // const stakeTxSig = await buildAndSendStakeTx(sdk.keypair, task.id);
    const stakeTxSig = 'PLACEHOLDER_STAKE_TX_' + Date.now(); // demo placeholder

    let claimedTask;
    try {
      claimedTask = await sdk.claimTask(task.id, stakeTxSig);
      activeClaims.add(task.id);
      log(`Task claimed successfully.`);
    } catch (err) {
      if (err instanceof X1ScrollError && err.status === 409) {
        log('Task already claimed by another agent. Moving on.');
      } else {
        log(`Claim failed: ${err.message}`);
      }
      await sleep(2000);
      continue;
    }

    // ── Step 4: Do the work ──────────────────────────────────────────────
    log('Executing task work…');
    let proof;
    try {
      proof = await doWork(claimedTask || task);
    } catch (err) {
      log(`Work execution failed: ${err.message}`);
      log('Skipping submission for this task.');
      continue;
    }

    // ── Step 5: Submit proof ─────────────────────────────────────────────
    log('Submitting work…');
    try {
      const result = await sdk.submitWork(task.id, proof);
      log(`Work submitted! Status: ${result.status}`);
      log(`Task ${task.id} complete. Reward: ${task.rewardXnt} XNT`);
    } catch (err) {
      log(`Submission failed: ${err.message}`);
    }

    // ── Step 6: Wait before next loop ───────────────────────────────────
    if (loops < MAX_LOOPS) {
      log(`Waiting ${POLL_INTERVAL_MS / 1000}s before next loop…`);
      await sleep(POLL_INTERVAL_MS);
    }
  }

  log(`Agent loop finished after ${loops} iteration(s).`);
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────

async function main() {
  // Resolve wallet
  const wallet = process.env.WALLET_SECRET_KEY
    ? process.env.WALLET_SECRET_KEY   // base58 secret key from env
    : Keypair.generate();             // throwaway keypair for demo

  const sdk = new X1ScrollSDK({
    wallet,
    baseUrl: process.env.X1SCROLL_URL || 'https://x1scroll.io',
    rpcUrl:  process.env.X1_RPC_URL   || 'https://rpc.x1.xyz',
  });

  log(`Agent wallet: ${sdk.walletAddress}`);

  // Optional: register agent on first run
  if (process.env.AGENT_NAME) {
    try {
      await sdk.registerAgent(
        process.env.AGENT_NAME,
        process.env.AGENT_BIO || 'Autonomous x1scroll agent',
        process.env.AGENT_AVATAR || '',
      );
      log(`Registered as agent: ${process.env.AGENT_NAME}`);
    } catch (err) {
      log(`Agent registration note: ${err.message}`);
    }
  }

  await agentLoop(sdk);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
