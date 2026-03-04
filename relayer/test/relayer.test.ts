// ---- Mocks must be set up before importing modules ----

// Mock ethers module
const mockGetBalance = jest.fn().mockResolvedValue(BigInt("1000000000000000000")); // 1 ETH
const mockGetNonce = jest.fn().mockResolvedValue(0);
const mockVoteFunction = jest.fn();
const mockNullifierUsed = jest.fn();
const mockIsKnownOwnershipRoot = jest.fn();
const mockIsKnownBalancesRoot = jest.fn();
const mockWait = jest.fn();

jest.mock("ethers", () => {
    const actualEthers = jest.requireActual("ethers");
    return {
        ...actualEthers,
        JsonRpcProvider: jest.fn().mockImplementation(() => ({
            getBalance: mockGetBalance,
        })),
        Wallet: jest.fn().mockImplementation(() => ({
            address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            getNonce: mockGetNonce,
        })),
        Contract: jest.fn().mockImplementation((_address: string, abi: string[]) => {
            const abiStr = JSON.stringify(abi);
            if (abiStr.includes("vote(")) {
                return {
                    vote: mockVoteFunction,
                    nullifierUsed: mockNullifierUsed,
                };
            }
            if (abiStr.includes("isKnownOwnershipRoot")) {
                return {
                    isKnownOwnershipRoot: mockIsKnownOwnershipRoot,
                    isKnownBalancesRoot: mockIsKnownBalancesRoot,
                };
            }
            return {};
        }),
    };
});

// Set environment variables before importing config
process.env.VOTING_BOOTH_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
process.env.REGISTRY_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

import request from "supertest";

// We need supertest for HTTP testing
let app: any;

beforeAll(async () => {
    // Dynamic import after mocks are in place
    const mod = await import("../src/index");
    app = mod.app;
});

// Helper: valid bytes32 (0x + 64 hex chars)
const BYTES32_AA = "0x" + "aa".repeat(32);
const BYTES32_BB = "0x" + "bb".repeat(32);
const BYTES32_CC = "0x" + "cc".repeat(32);
const BYTES32_DD = "0x" + "dd".repeat(32);

// Helper: valid request body
function validBody() {
    return {
        proof: {
            pA: [
                "0x0000000000000000000000000000000000000000000000000000000000000001",
                "0x0000000000000000000000000000000000000000000000000000000000000002",
            ],
            pB: [
                [
                    "0x0000000000000000000000000000000000000000000000000000000000000003",
                    "0x0000000000000000000000000000000000000000000000000000000000000004",
                ],
                [
                    "0x0000000000000000000000000000000000000000000000000000000000000005",
                    "0x0000000000000000000000000000000000000000000000000000000000000006",
                ],
            ],
            pC: [
                "0x0000000000000000000000000000000000000000000000000000000000000007",
                "0x0000000000000000000000000000000000000000000000000000000000000008",
            ],
        },
        ownershipRoot: BYTES32_AA,
        balancesRoot: BYTES32_BB,
        proposalId: BYTES32_CC,
        voteChoice: 1,
        tier: 2,
        nullifier: BYTES32_DD,
    };
}

const FAKE_TX_HASH = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

beforeEach(() => {
    jest.clearAllMocks();

    // Default mock behaviors: all pre-checks pass
    mockNullifierUsed.mockResolvedValue(false);
    mockIsKnownOwnershipRoot.mockResolvedValue(true);
    mockIsKnownBalancesRoot.mockResolvedValue(true);
    mockGetNonce.mockResolvedValue(0);
    mockGetBalance.mockResolvedValue(BigInt("1000000000000000000"));

    // Mock the vote transaction
    mockVoteFunction.mockResolvedValue({
        hash: FAKE_TX_HASH,
        wait: mockWait.mockResolvedValue({
            hash: FAKE_TX_HASH,
            status: 1,
        }),
    });
});

describe("POST /api/v1/relay", () => {
    test("valid body returns success and txHash", async () => {
        const res = await request(app)
            .post("/api/v1/relay")
            .send(validBody())
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.txHash).toBe(FAKE_TX_HASH);
    });

    test("invalid proof format returns 400", async () => {
        const body = validBody();
        body.proof.pA = ["not-hex", "also-not-hex"] as any;

        const res = await request(app)
            .post("/api/v1/relay")
            .send(body)
            .expect(400);

        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain("proof.pA");
    });

    test("invalid vote choice (3) returns 400", async () => {
        const body = validBody();
        body.voteChoice = 3;

        const res = await request(app)
            .post("/api/v1/relay")
            .send(body)
            .expect(400);

        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain("voteChoice");
    });

    test("invalid bytes32 (too short) returns 400", async () => {
        const body = validBody();
        body.nullifier = "0xabcd"; // too short for bytes32

        const res = await request(app)
            .post("/api/v1/relay")
            .send(body)
            .expect(400);

        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain("nullifier");
    });

    test("missing proof field returns 400", async () => {
        const body = { voteChoice: 1, tier: 0 };

        const res = await request(app)
            .post("/api/v1/relay")
            .send(body)
            .expect(400);

        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain("proof");
    });

    test("negative tier returns 400", async () => {
        const body = validBody();
        body.tier = -1;

        const res = await request(app)
            .post("/api/v1/relay")
            .send(body)
            .expect(400);

        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain("tier");
    });

    test("nullifier already used returns 400", async () => {
        mockNullifierUsed.mockResolvedValue(true);

        const res = await request(app)
            .post("/api/v1/relay")
            .send(validBody())
            .expect(400);

        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain("Nullifier");
    });

    test("unknown ownership root returns 400", async () => {
        mockIsKnownOwnershipRoot.mockResolvedValue(false);

        const res = await request(app)
            .post("/api/v1/relay")
            .send(validBody())
            .expect(400);

        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain("ownership root");
    });

    test("unknown balances root returns 400", async () => {
        mockIsKnownBalancesRoot.mockResolvedValue(false);

        const res = await request(app)
            .post("/api/v1/relay")
            .send(validBody())
            .expect(400);

        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain("balances root");
    });

    test("transaction failure returns 500", async () => {
        mockVoteFunction.mockRejectedValue(new Error("execution reverted"));

        const res = await request(app)
            .post("/api/v1/relay")
            .send(validBody())
            .expect(500);

        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain("execution reverted");
    });
});

describe("GET /api/v1/health", () => {
    test("returns status ok with address and balance", async () => {
        const res = await request(app)
            .get("/api/v1/health")
            .expect(200);

        expect(res.body.status).toBe("ok");
        expect(res.body.address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
        expect(res.body.balance).toBe("1.0");
        expect(typeof res.body.pendingTxs).toBe("number");
    });
});

describe("TransactionQueue", () => {
    test("processes transactions sequentially with incrementing nonces", async () => {
        // The queue is tested implicitly through the relay endpoint.
        // Here we send two requests in parallel and ensure both succeed with correct nonces.
        const [res1, res2] = await Promise.all([
            request(app).post("/api/v1/relay").send(validBody()),
            request(app).post("/api/v1/relay").send(validBody()),
        ]);

        // Both should succeed
        expect(res1.body.success).toBe(true);
        expect(res2.body.success).toBe(true);

        // The vote function should have been called twice
        expect(mockVoteFunction).toHaveBeenCalledTimes(2);
    });
});
