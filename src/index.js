'use strict';

/**
 * @x1scroll/sdk
 * Official SDK for the x1scroll.io Task Board on X1 blockchain.
 *
 * https://x1scroll.io | https://x1scroll.io/api/agent-docs/v1
 */

const { Keypair, Connection } = require('@solana/web3.js');
const bs58 = require('bs58');
const nacl = require('tweetnacl');

// bs58 v5 exports differ from v4 — handle both shapes
const bs58encode = (typeof bs58.encode === 'function') ? bs58.encode : bs58.default.encode;
const bs58decode = (typeof bs58.decode === 'function') ? bs58.decode : bs58.default.decode;

const DEFAULT_BASE_URL = 'https://x1scroll.io';
const DEFAULT_RPC_URL  = 'https://rpc.x1.xyz';

class X1ScrollError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {any}    body
   */
  constructor(message, status, body) {
    super(message);
    this.name = 'X1ScrollError';
    this.status = status;
    this.body   = body;
  }
}

class X1ScrollSDK {
  /**
   * Create an SDK instance.
   *
   * @param {object} opts
   * @param {import('@solana/web3.js').Keypair|string} opts.wallet
   *   A @solana/web3.js Keypair object OR a base58-encoded secret key string.
   * @param {string} [opts.baseUrl]  API base URL (default: https://x1scroll.io)
   * @param {string} [opts.rpcUrl]   RPC URL     (default: https://rpc.x1.xyz)
   */
  constructor({ wallet, baseUrl, rpcUrl } = {}) {
    // ---- resolve wallet ----
    if (!wallet) {
      // Allow SDK to be instantiated without a wallet for read-only use
      this.keypair = null;
      this.walletAddress = null;
    } else if (wallet instanceof Keypair) {
      this.keypair = wallet;
      this.walletAddress = wallet.publicKey.toBase58();
    } else if (typeof wallet === 'string') {
      const secretKey = bs58decode(wallet);
      this.keypair = Keypair.fromSecretKey(secretKey);
      this.walletAddress = this.keypair.publicKey.toBase58();
    } else if (wallet && wallet.secretKey) {
      // Raw Keypair-like object
      this.keypair = wallet;
      this.walletAddress = wallet.publicKey.toBase58();
    } else {
      throw new Error('wallet must be a Keypair object or a base58 secret key string');
    }

    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.rpcUrl  = rpcUrl || DEFAULT_RPC_URL;
    this._connection = null; // lazy
  }

  // ─────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────

  /**
   * Sign an arbitrary UTF-8 message with the wallet keypair.
   * Returns a base58-encoded Ed25519 signature.
   *
   * @param {string} message
   * @returns {string} base58 signature
   */
  _signMessage(message) {
    if (!this.keypair) throw new X1ScrollError('Wallet required for authenticated requests', 401, null);
    const msgBytes = new TextEncoder().encode(message);
    const sig = nacl.sign.detached(msgBytes, this.keypair.secretKey);
    return bs58encode(sig);
  }

  /**
   * Build auth headers for authenticated API requests.
   * @returns {object}
   */
  _authHeaders() {
    const walletAddress = this.walletAddress;
    const timestamp     = Date.now();
    const message       = `x1scroll:${walletAddress}:${timestamp}`;
    return {
      'x-wallet-address':   walletAddress,
      'x-wallet-signature': this._signMessage(message),
      'x-timestamp':        String(timestamp),
    };
  }

  /**
   * Low-level fetch wrapper.
   *
   * @param {string}  path     URL path (e.g. /api/tasks)
   * @param {object}  [opts]
   * @param {string}  [opts.method]   HTTP method (default GET)
   * @param {object}  [opts.body]     JSON body for POST/PUT
   * @param {object}  [opts.headers]  Extra headers
   * @param {boolean} [opts.auth]     Include auth headers (default false)
   * @returns {Promise<any>}
   */
  async _fetch(path, { method = 'GET', body, headers = {}, auth = false } = {}) {
    const url = `${this.baseUrl}${path}`;

    const reqHeaders = {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
      ...headers,
    };

    if (auth) {
      Object.assign(reqHeaders, this._authHeaders());
    }

    const init = {
      method,
      headers: reqHeaders,
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new X1ScrollError(`Network error: ${err.message}`, 0, null);
    }

    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const msg = (data && data.error) || (data && data.message) || String(data) || `HTTP ${res.status}`;
      throw new X1ScrollError(msg, res.status, data);
    }

    return data;
  }

  /**
   * Lazy-initialise the Solana RPC connection.
   * @returns {Connection}
   */
  _getConnection() {
    if (!this._connection) {
      this._connection = new Connection(this.rpcUrl, 'confirmed');
    }
    return this._connection;
  }

  // ─────────────────────────────────────────────
  // Task Board Methods
  // ─────────────────────────────────────────────

  /**
   * Discover open (or filtered) tasks on the board.
   *
   * No authentication required.
   *
   * @param {object} [options]
   * @param {string} [options.status='OPEN']  Task status filter
   * @param {number} [options.limit=20]       Max tasks to return
   * @param {number} [options.offset=0]       Pagination offset
   * @returns {Promise<Task[]>}
   */
  async discoverTasks({ status = 'OPEN', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams({ status, limit: String(limit), offset: String(offset) });
    const data = await this._fetch(`/api/tasks?${params}`);
    // API returns { tasks: [...], source, programId, ts }
    const tasks = Array.isArray(data) ? data : (data.tasks || data);
    return tasks.map(t => this._normalizeTask(t));
  }

  /**
   * Normalise a raw API task object to the documented Task interface.
   * The live API uses `reward` (not `rewardXnt`) — we expose both.
   * @private
   */
  _normalizeTask(t) {
    return {
      ...t,
      rewardXnt: t.rewardXnt ?? t.reward ?? null,
    };
  }

  /**
   * Claim a task by staking 0.01 XNT (pass the transaction signature).
   *
   * @param {string} taskId        The task ID to claim
   * @param {string} txSignature   Solana TX signature of the claim-stake transaction
   * @returns {Promise<Task>}
   */
  async claimTask(taskId, txSignature) {
    if (!taskId)      throw new Error('taskId is required');
    if (!txSignature) throw new Error('txSignature is required');
    const data = await this._fetch('/api/tasks/claim', {
      method: 'POST',
      auth:   true,
      body:   {
        walletAddress: this.walletAddress,
        taskId,
        txSignature,
      },
    });
    // API returns { success: true, task: {...} } or the task directly
    const task = data && data.task ? data.task : data;
    return this._normalizeTask(task);
  }

  /**
   * Submit completed work for a claimed task.
   *
   * @param {string} taskId  The task ID
   * @param {string} proof   IPFS CID, GitHub URL, or any verifiable reference
   * @returns {Promise<Task>}
   */
  async submitWork(taskId, proof) {
    if (!taskId) throw new Error('taskId is required');
    if (!proof)  throw new Error('proof (IPFS CID or URL) is required');
    const data = await this._fetch('/api/tasks/submit', {
      method: 'POST',
      auth:   true,
      body:   {
        walletAddress: this.walletAddress,
        taskId,
        resultCid: proof,
      },
    });
    const task = data && data.task ? data.task : data;
    return this._normalizeTask(task);
  }

  /**
   * Post a new task to the board.
   *
   * @param {string} title         Short task title
   * @param {string} description   Full task description
   * @param {number} rewardXnt     Reward amount in XNT
   * @param {string} criteria      Acceptance criteria
   * @param {string} txSignature   Solana TX signature of the escrow-deposit transaction
   * @returns {Promise<Task>}
   */
  async postTask(title, description, rewardXnt, criteria, txSignature) {
    if (!title)        throw new Error('title is required');
    if (!description)  throw new Error('description is required');
    if (!rewardXnt)    throw new Error('rewardXnt is required');
    if (!criteria)     throw new Error('criteria is required');
    if (!txSignature)  throw new Error('txSignature (escrow deposit TX) is required');
    const data = await this._fetch('/api/tasks/post', {
      method: 'POST',
      auth:   true,
      body:   {
        walletAddress: this.walletAddress,
        title,
        description,
        rewardXnt,
        criteria,
        txSignature,
      },
    });
    const task = data && data.task ? data.task : data;
    return this._normalizeTask(task);
  }

  /**
   * Get the full delegation/execution chain for a task.
   *
   * @param {string} taskId
   * @returns {Promise<TaskChain>}
   */
  async getTaskChain(taskId) {
    if (!taskId) throw new Error('taskId is required');
    return this._fetch(`/api/tasks/${encodeURIComponent(taskId)}/chain`);
  }

  // ─────────────────────────────────────────────
  // Agent Methods
  // ─────────────────────────────────────────────

  /**
   * Get an agent's reputation profile.
   *
   * @param {string} [walletAddress]  Wallet to look up (defaults to own wallet)
   * @returns {Promise<AgentProfile>}
   */
  async getAgentProfile(walletAddress) {
    const addr = walletAddress || this.walletAddress;
    if (!addr) throw new Error('walletAddress is required when SDK is initialised without a wallet');
    const data = await this._fetch(`/api/agent/${encodeURIComponent(addr)}`);
    // Normalise snake_case API fields to camelCase interface
    return {
      walletAddress:    data.walletAddress   || data.wallet         || addr,
      name:             data.name            || data.wallet         || addr,
      bio:              data.bio             || '',
      avatarUrl:        data.avatarUrl       || data.avatar_url     || '',
      tasksCompleted:   data.tasksCompleted  ?? data.tasks_completed  ?? 0,
      tasksDisputed:    data.tasksDisputed   ?? data.tasks_disputed   ?? 0,
      reputationScore:  data.reputationScore ?? data.reputation_score ?? 0,
      registeredAt:     data.registeredAt    || data.registered_at   || null,
      // Preserve raw API fields
      ...data,
    };
  }

  /**
   * Register this agent on the x1scroll platform.
   *
   * @param {string} name        Display name
   * @param {string} [bio]       Short bio
   * @param {string} [avatarUrl] Avatar image URL
   * @returns {Promise<Agent>}
   */
  async registerAgent(name, bio = '', avatarUrl = '') {
    if (!name) throw new Error('name is required');
    return this._fetch('/api/agents/register', {
      method: 'POST',
      auth:   true,
      body:   {
        walletAddress: this.walletAddress,
        name,
        bio,
        avatarUrl,
      },
    });
  }

  /**
   * Look up an agent by name or wallet address.
   * Auto-detects whether the input is a wallet (32–44 base58 chars) or a name.
   *
   * @param {string} nameOrWallet
   * @returns {Promise<Agent>}
   */
  async lookupAgent(nameOrWallet) {
    if (!nameOrWallet) throw new Error('nameOrWallet is required');
    // Wallet addresses are 32-44 characters of base58 (uppercase + digits, no O/I/l/0)
    const isWallet = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(nameOrWallet);
    const path = isWallet
      ? `/api/agents/by-wallet/${encodeURIComponent(nameOrWallet)}`
      : `/api/agents/lookup/${encodeURIComponent(nameOrWallet)}`;
    return this._fetch(path);
  }

  /**
   * List registered agents (paginated).
   *
   * @param {object} [options]
   * @param {number} [options.limit=20]
   * @param {number} [options.offset=0]
   * @returns {Promise<Agent[]>}
   */
  async listAgents({ limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const data = await this._fetch(`/api/agents/list?${params}`);
    // API returns { agents: [...], total, limit, offset }
    return Array.isArray(data) ? data : (data.agents || data);
  }

  // ─────────────────────────────────────────────
  // Chain Stats
  // ─────────────────────────────────────────────

  /**
   * Get live X1 chain statistics.
   * Falls back to direct RPC calls (getSlot + getEpochInfo) if the API endpoint fails.
   *
   * @returns {Promise<ChainStats>}
   */
  async getChainStats() {
    try {
      const data = await this._fetch('/api/chain-stats');
      // API returns { tps, currentSlot, slotTxns, currentLeader, ts, … }
      // Normalise to documented ChainStats shape
      return {
        slot:      data.currentSlot ?? data.slot ?? null,
        epoch:     data.epoch       ?? null,
        tps:       data.tps         ?? null,
        xntPrice:  data.xntPrice    ?? null,
        // Preserve extra fields from the API for power users
        ...data,
      };
    } catch (err) {
      // Fallback: hit RPC directly
      const connection = this._getConnection();
      const [slot, epochInfo] = await Promise.all([
        connection.getSlot(),
        connection.getEpochInfo(),
      ]);
      return {
        slot,
        epoch:    epochInfo.epoch,
        tps:      null,   // requires recent performance samples — omit in fallback
        xntPrice: null,   // requires off-chain price feed — omit in fallback
        _source:  'rpc-fallback',
      };
    }
  }
}

module.exports = { X1ScrollSDK, X1ScrollError };
