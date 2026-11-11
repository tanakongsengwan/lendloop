import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("prune webhook nonces", { minuteUTC: 7 }, internal.automation.pruneNonces);

export default crons;
