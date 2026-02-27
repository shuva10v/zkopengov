/**
 * REST API Routes.
 *
 * PRIVACY RULE: The indexer NEVER serves per-address queries.
 * It only serves full tree dumps so the client can download the entire
 * tree and find its own leaf locally.
 */

import { Router, Request, Response } from "express";
import { config } from "../config";
import type { IndexerState } from "./server";

/**
 * Create the API router with all routes.
 *
 * @param getState - Function that returns the current indexer state
 * @returns Express Router
 */
export function createRoutes(getState: () => IndexerState): Router {
  const router = Router();

  /**
   * GET /api/v1/status
   *
   * Returns current indexer status including tree roots, counts, and uptime.
   */
  router.get("/api/v1/status", (_req: Request, res: Response) => {
    const state = getState();

    res.json({
      ownershipRoot: state.ownershipRoot,
      balancesRoot: state.balancesRoot,
      snapshotBlock: state.snapshotBlock,
      registrationCount: state.registrationCount,
      uptime: Math.floor((Date.now() - state.startTime) / 1000),
      demoMode: config.demoMode,
    });
  });

  /**
   * GET /api/v1/ownership-tree
   *
   * Returns the full ownership tree data including all leaves.
   * The client downloads this and searches for its own leaf locally.
   */
  router.get("/api/v1/ownership-tree", (_req: Request, res: Response) => {
    const state = getState();

    if (!state.ownershipTreeData) {
      res.status(503).json({ error: "Ownership tree not yet built" });
      return;
    }

    res.json({
      root: state.ownershipRoot,
      leafCount: state.ownershipTreeData.leaves.length,
      updatedAt: state.ownershipTreeUpdatedAt,
      leaves: state.ownershipTreeData.leaves,
    });
  });

  /**
   * GET /api/v1/balances-tree
   *
   * Returns the full balances tree data including all leaves.
   * The client downloads this and searches for its own leaf locally.
   */
  router.get("/api/v1/balances-tree", (_req: Request, res: Response) => {
    const state = getState();

    if (!state.balancesTreeData) {
      res.status(503).json({ error: "Balances tree not yet built" });
      return;
    }

    res.json({
      root: state.balancesRoot,
      snapshotBlock: state.snapshotBlock,
      leafCount: state.balancesTreeData.leaves.length,
      updatedAt: state.balancesTreeUpdatedAt,
      leaves: state.balancesTreeData.leaves,
    });
  });

  /**
   * GET /api/v1/tiers
   *
   * Returns the balance tier configuration.
   */
  router.get("/api/v1/tiers", (_req: Request, res: Response) => {
    res.json({
      tiers: config.tiers.map((t) => ({
        id: t.id,
        min: t.min.toString(),
        max: t.max.toString(),
        weight: t.weight,
      })),
    });
  });

  return router;
}
