/**
 * Indexer state types.
 *
 * Tree data is uploaded to S3 instead of served via REST API.
 */

/** A single leaf in the ownership tree */
export interface OwnershipLeafData {
  index: number;
  address: string;
  commitment: string;
}

/** A single leaf in the balances tree */
export interface BalancesLeafData {
  index: number;
  address: string;
  balance: string;
}

/** Shape of the full ownership tree payload */
export interface OwnershipTreePayload {
  leaves: OwnershipLeafData[];
}

/** Shape of the full balances tree payload */
export interface BalancesTreePayload {
  root: string;
  snapshotBlock: number;
  leaves: BalancesLeafData[];
}

/**
 * Mutable state that the indexer main loop populates.
 */
export interface IndexerState {
  ownershipRoot: string;
  balancesRoot: string;
  snapshotBlock: number;
  registrationCount: number;
  startTime: number;

  ownershipTreeData: OwnershipTreePayload | null;
  ownershipTreeUpdatedAt: string;

  balancesTreeData: BalancesTreePayload | null;
  balancesTreeUpdatedAt: string;
}

/**
 * Create the default (empty) indexer state.
 */
export function createDefaultState(): IndexerState {
  return {
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
}
