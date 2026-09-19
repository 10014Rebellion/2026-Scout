/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiAnalysis from "../aiAnalysis.js";
import type * as auth from "../auth.js";
import type * as dataExport from "../dataExport.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as matchReports from "../matchReports.js";
import type * as matchStats from "../matchStats.js";
import type * as matches from "../matches.js";
import type * as mockData from "../mockData.js";
import type * as peekorobo from "../peekorobo.js";
import type * as pickListEntries from "../pickListEntries.js";
import type * as pickListMerges from "../pickListMerges.js";
import type * as pitReports from "../pitReports.js";
import type * as scoutAssignments from "../scoutAssignments.js";
import type * as scoutPositionAssignments from "../scoutPositionAssignments.js";
import type * as scouts from "../scouts.js";
import type * as tbaImport from "../tbaImport.js";
import type * as tbaPreviousEvent from "../tbaPreviousEvent.js";
import type * as tbaScoreSync from "../tbaScoreSync.js";
import type * as teams from "../teams.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiAnalysis: typeof aiAnalysis;
  auth: typeof auth;
  dataExport: typeof dataExport;
  events: typeof events;
  http: typeof http;
  matchReports: typeof matchReports;
  matchStats: typeof matchStats;
  matches: typeof matches;
  mockData: typeof mockData;
  peekorobo: typeof peekorobo;
  pickListEntries: typeof pickListEntries;
  pickListMerges: typeof pickListMerges;
  pitReports: typeof pitReports;
  scoutAssignments: typeof scoutAssignments;
  scoutPositionAssignments: typeof scoutPositionAssignments;
  scouts: typeof scouts;
  tbaImport: typeof tbaImport;
  tbaPreviousEvent: typeof tbaPreviousEvent;
  tbaScoreSync: typeof tbaScoreSync;
  teams: typeof teams;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
