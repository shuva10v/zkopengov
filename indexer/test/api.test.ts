/**
 * REST API endpoint tests.
 *
 * Validates that:
 *   1. All endpoints return correct data shapes
 *   2. Privacy is preserved — no per-address query endpoints exist
 *   3. Proper error handling for unbuilt trees
 */

import request from "supertest";
// @ts-ignore — circomlibjs does not ship types
import { buildPoseidon } from "circomlibjs";
import { createApp } from "../src/api/server";
import type { IndexerState } from "../src/api/server";
import { PoseidonMerkleTree } from "../src/trees/PoseidonMerkleTree";
import { buildOwnershipTree } from "../src/trees/ownership-tree";
import { buildBalancesTree } from "../src/trees/balances-tree";

let poseidon: any;
let app: ReturnType<typeof createApp>;
let state: IndexerState;

/**
 * Create a fully populated test state with small trees.
 */
async function createPopulatedState(): Promise<IndexerState> {
  const registrations = [
    { address: "0x0000000000000000000000000000000000000001", commitment: "100" },
    { address: "0x0000000000000000000000000000000000000002", commitment: "200" },
    { address: "0x0000000000000000000000000000000000000003", commitment: "300" },
  ];

  const balances = new Map<string, bigint>([
    ["0x0000000000000000000000000000000000000001", 50_000_000_000n],
    ["0x0000000000000000000000000000000000000002", 1_500_000_000_000n],
    ["0x0000000000000000000000000000000000000003", 50_000_000_000_000n],
  ]);

  const ownershipTree = await buildOwnershipTree(registrations, poseidon, 4);
  const balancesTree = await buildBalancesTree(balances, poseidon, 4);

  const sortedAddresses = Array.from(balances.keys()).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  return {
    ownershipRoot: ownershipTree.getRoot().toString(),
    balancesRoot: balancesTree.getRoot().toString(),
    snapshotBlock: 12345,
    registrationCount: 3,
    startTime: Date.now() - 60000, // 1 minute ago

    ownershipTreeData: {
      leaves: registrations.map((r, i) => ({
        index: i,
        address: r.address,
        commitment: r.commitment,
      })),
    },
    ownershipTreeUpdatedAt: new Date().toISOString(),

    balancesTreeData: {
      leaves: sortedAddresses.map((addr, i) => ({
        index: i,
        address: addr,
        balance: balances.get(addr)!.toString(),
      })),
    },
    balancesTreeUpdatedAt: new Date().toISOString(),
  };
}

beforeAll(async () => {
  poseidon = await buildPoseidon();
  state = await createPopulatedState();
  app = createApp(() => state);
}, 30000);

describe("GET /api/v1/status", () => {
  it("should return correct status", async () => {
    const res = await request(app).get("/api/v1/status");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ownershipRoot");
    expect(res.body).toHaveProperty("balancesRoot");
    expect(res.body).toHaveProperty("snapshotBlock", 12345);
    expect(res.body).toHaveProperty("registrationCount", 3);
    expect(res.body).toHaveProperty("uptime");
    expect(typeof res.body.uptime).toBe("number");
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("should return non-zero roots when trees are populated", async () => {
    const res = await request(app).get("/api/v1/status");

    expect(res.body.ownershipRoot).not.toBe("0");
    expect(res.body.balancesRoot).not.toBe("0");
  });
});

describe("GET /api/v1/ownership-tree", () => {
  it("should return full tree data", async () => {
    const res = await request(app).get("/api/v1/ownership-tree");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("root");
    expect(res.body).toHaveProperty("leafCount", 3);
    expect(res.body).toHaveProperty("updatedAt");
    expect(res.body).toHaveProperty("leaves");
    expect(Array.isArray(res.body.leaves)).toBe(true);
    expect(res.body.leaves.length).toBe(3);
  });

  it("should include address and commitment for each leaf", async () => {
    const res = await request(app).get("/api/v1/ownership-tree");

    for (const leaf of res.body.leaves) {
      expect(leaf).toHaveProperty("index");
      expect(leaf).toHaveProperty("address");
      expect(leaf).toHaveProperty("commitment");
      expect(typeof leaf.index).toBe("number");
      expect(typeof leaf.address).toBe("string");
      expect(typeof leaf.commitment).toBe("string");
    }
  });

  it("should return 503 when tree is not yet built", async () => {
    const emptyState: IndexerState = {
      ownershipRoot: "0",
      balancesRoot: "0",
      snapshotBlock: 0,
      registrationCount: 0,
      startTime: Date.now(),
      ownershipTreeData: null,
      ownershipTreeUpdatedAt: "",
      balancesTreeData: null,
      balancesTreeUpdatedAt: "",
    };

    const emptyApp = createApp(() => emptyState);
    const res = await request(emptyApp).get("/api/v1/ownership-tree");

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty("error");
  });
});

describe("GET /api/v1/balances-tree", () => {
  it("should return full tree data", async () => {
    const res = await request(app).get("/api/v1/balances-tree");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("root");
    expect(res.body).toHaveProperty("snapshotBlock", 12345);
    expect(res.body).toHaveProperty("leafCount", 3);
    expect(res.body).toHaveProperty("updatedAt");
    expect(res.body).toHaveProperty("leaves");
    expect(Array.isArray(res.body.leaves)).toBe(true);
    expect(res.body.leaves.length).toBe(3);
  });

  it("should include address and balance for each leaf", async () => {
    const res = await request(app).get("/api/v1/balances-tree");

    for (const leaf of res.body.leaves) {
      expect(leaf).toHaveProperty("index");
      expect(leaf).toHaveProperty("address");
      expect(leaf).toHaveProperty("balance");
      expect(typeof leaf.index).toBe("number");
      expect(typeof leaf.address).toBe("string");
      expect(typeof leaf.balance).toBe("string");
      // Balance should be a parseable number string
      expect(() => BigInt(leaf.balance)).not.toThrow();
    }
  });

  it("should return 503 when tree is not yet built", async () => {
    const emptyState: IndexerState = {
      ownershipRoot: "0",
      balancesRoot: "0",
      snapshotBlock: 0,
      registrationCount: 0,
      startTime: Date.now(),
      ownershipTreeData: null,
      ownershipTreeUpdatedAt: "",
      balancesTreeData: null,
      balancesTreeUpdatedAt: "",
    };

    const emptyApp = createApp(() => emptyState);
    const res = await request(emptyApp).get("/api/v1/balances-tree");

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty("error");
  });
});

describe("GET /api/v1/tiers", () => {
  it("should return tier configuration", async () => {
    const res = await request(app).get("/api/v1/tiers");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("tiers");
    expect(Array.isArray(res.body.tiers)).toBe(true);
    expect(res.body.tiers.length).toBe(5);
  });

  it("should include id, min, max, weight for each tier", async () => {
    const res = await request(app).get("/api/v1/tiers");

    for (const tier of res.body.tiers) {
      expect(tier).toHaveProperty("id");
      expect(tier).toHaveProperty("min");
      expect(tier).toHaveProperty("max");
      expect(tier).toHaveProperty("weight");
      expect(typeof tier.id).toBe("number");
      expect(typeof tier.min).toBe("string");
      expect(typeof tier.max).toBe("string");
      expect(typeof tier.weight).toBe("number");
    }
  });

  it("tiers should be ordered by id", async () => {
    const res = await request(app).get("/api/v1/tiers");

    for (let i = 0; i < res.body.tiers.length; i++) {
      expect(res.body.tiers[i].id).toBe(i);
    }
  });
});

describe("Privacy preservation", () => {
  it("should NOT have any per-address query endpoints", async () => {
    // Try common patterns for per-address queries
    const addressPatterns = [
      "/api/v1/address/0x0000000000000000000000000000000000000001",
      "/api/v1/balance/0x0000000000000000000000000000000000000001",
      "/api/v1/registration/0x0000000000000000000000000000000000000001",
      "/api/v1/proof/0x0000000000000000000000000000000000000001",
      "/api/v1/lookup/0x0000000000000000000000000000000000000001",
      "/api/v1/account/0x0000000000000000000000000000000000000001",
    ];

    for (const path of addressPatterns) {
      const res = await request(app).get(path);
      // Should return 404 (not found) — these routes must not exist
      expect(res.status).toBe(404);
    }
  });

  it("should NOT accept address query parameters", async () => {
    const res = await request(app)
      .get("/api/v1/ownership-tree")
      .query({ address: "0x0000000000000000000000000000000000000001" });

    // The endpoint should return the full tree regardless of any query params
    // (it ignores them, which is the privacy-safe behavior)
    expect(res.status).toBe(200);
    expect(res.body.leaves.length).toBe(3); // All leaves, not filtered
  });
});
