/**
 * Express REST API server.
 *
 * Serves tree data and indexer status. All data is served as full dumps
 * to preserve privacy — no per-address queries are supported.
 */

import express, { Application } from "express";
import { createRoutes } from "./routes";
import { config } from "../config";

/** A single leaf in the ownership tree response */
export interface OwnershipLeafData {
  index: number;
  address: string;
  commitment: string;
}

/** A single leaf in the balances tree response */
export interface BalancesLeafData {
  index: number;
  address: string;
  balance: string;
}

/** Shape of the full ownership tree response payload */
export interface OwnershipTreePayload {
  leaves: OwnershipLeafData[];
}

/** Shape of the full balances tree response payload */
export interface BalancesTreePayload {
  leaves: BalancesLeafData[];
}

/**
 * Mutable state that the indexer main loop populates and the API reads.
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

/**
 * Create and configure the Express application.
 *
 * @param getState - Function that returns the current IndexerState
 * @returns Configured Express Application
 */
export function createApp(getState: () => IndexerState): Application {
  const app = express();

  // Middleware
  app.use(express.json());

  // CORS — allow all origins for hackathon/demo
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
  });

  // Routes
  const routes = createRoutes(getState);
  app.use(routes);

  return app;
}

/**
 * Start the HTTP server.
 *
 * @param getState - Function that returns the current IndexerState
 * @param port - Port to listen on (defaults to config.port)
 * @returns The HTTP server instance
 */
export function startServer(
  getState: () => IndexerState,
  port?: number
): ReturnType<Application["listen"]> {
  const app = createApp(getState);
  const listenPort = port || config.port;

  const server = app.listen(listenPort, () => {
    console.log(`[server] REST API listening on port ${listenPort}`);
    console.log(`[server] Endpoints:`);
    console.log(`  GET http://localhost:${listenPort}/api/v1/status`);
    console.log(`  GET http://localhost:${listenPort}/api/v1/ownership-tree`);
    console.log(`  GET http://localhost:${listenPort}/api/v1/balances-tree`);
    console.log(`  GET http://localhost:${listenPort}/api/v1/tiers`);
  });

  return server;
}
