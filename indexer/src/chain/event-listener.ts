/**
 * Event Listener for VotingRegistry contract.
 *
 * Reads Registered events from the VotingRegistry EVM contract using ethers.js.
 * These events are emitted when a user registers their Poseidon commitment.
 */

import { ethers } from "ethers";

/** ABI fragment for the Registered event */
const REGISTRY_ABI = [
  "event Registered(uint256 indexed index, address indexed account, uint256 commitment)",
];

/** Parsed registration event data */
export interface RegistrationEvent {
  /** On-chain index assigned by the contract */
  index: number;
  /** EVM address that registered */
  address: string;
  /** Poseidon commitment (decimal string) */
  commitment: string;
}

/**
 * Fetch all Registered events from the VotingRegistry contract.
 *
 * @param provider - ethers.js JSON-RPC provider
 * @param registryAddress - Address of the VotingRegistry contract
 * @param fromBlock - Start block for event query (default: 0)
 * @param toBlock - End block for event query (default: "latest")
 * @returns Array of parsed registration events, sorted by index
 */
export async function fetchRegistrations(
  provider: ethers.Provider,
  registryAddress: string,
  fromBlock: number = 0,
  toBlock: number | string = "latest"
): Promise<RegistrationEvent[]> {
  console.log(
    `[event-listener] Fetching Registered events from block ${fromBlock} to ${toBlock}...`
  );

  const contract = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);

  const filter = contract.filters.Registered();
  const events = await contract.queryFilter(filter, fromBlock, toBlock);

  const registrations: RegistrationEvent[] = events.map((event) => {
    const parsed = contract.interface.parseLog({
      topics: event.topics as string[],
      data: event.data,
    });

    if (!parsed) {
      throw new Error(`Failed to parse Registered event at ${event.transactionHash}`);
    }

    return {
      index: Number(parsed.args.index),
      address: parsed.args.account,
      commitment: parsed.args.commitment.toString(),
    };
  });

  // Sort by index to ensure deterministic ordering
  registrations.sort((a, b) => a.index - b.index);

  console.log(
    `[event-listener] Found ${registrations.length} registration events`
  );

  return registrations;
}

/**
 * Set up a real-time listener for new Registered events.
 *
 * @param provider - ethers.js JSON-RPC provider
 * @param registryAddress - Address of the VotingRegistry contract
 * @param callback - Called for each new registration event
 * @returns A cleanup function to stop listening
 */
export function listenForRegistrations(
  provider: ethers.Provider,
  registryAddress: string,
  callback: (event: RegistrationEvent) => void
): () => void {
  console.log(
    `[event-listener] Listening for new Registered events on ${registryAddress}...`
  );

  const contract = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);

  const handler = (
    index: bigint,
    account: string,
    commitment: bigint,
    event: any
  ) => {
    const registration: RegistrationEvent = {
      index: Number(index),
      address: account,
      commitment: commitment.toString(),
    };

    console.log(
      `[event-listener] New registration: index=${registration.index}, address=${registration.address}`
    );

    callback(registration);
  };

  contract.on("Registered", handler);

  // Return cleanup function
  return () => {
    contract.off("Registered", handler);
    console.log("[event-listener] Stopped listening for events");
  };
}

/**
 * Generate mock registration data for demo/hackathon testing.
 *
 * @param count - Number of mock registrations
 * @returns Array of mock registration events
 */
export function generateMockRegistrations(count: number): RegistrationEvent[] {
  console.log(
    `[event-listener] Generating ${count} mock registrations...`
  );

  const registrations: RegistrationEvent[] = [];

  for (let i = 0; i < count; i++) {
    const address = "0x" + (i + 1).toString(16).padStart(40, "0");
    // Generate a deterministic "commitment" — in real usage this would be a
    // Poseidon hash computed by the user's client.
    const commitment = BigInt(
      "0x" + (i + 100).toString(16).padStart(64, "0")
    ).toString();

    registrations.push({
      index: i,
      address,
      commitment,
    });
  }

  return registrations;
}
