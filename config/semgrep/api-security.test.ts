import * as childProcess from "node:child_process";
import * as vm from "node:vm";
import { createHash, createHmac } from "node:crypto";

declare const prisma: {
  $queryRawUnsafe(query: string): Promise<unknown>;
};

// ruleid: rehab-api.no-command-execution
childProcess.execFile("tool");
// ruleid: rehab-api.no-command-execution
childProcess.spawn("tool");
// ruleid: rehab-api.no-command-execution
childProcess.fork("worker.js");
// ruleid: rehab-api.no-dynamic-code-evaluation
vm.runInNewContext("code");
// ruleid: rehab-api.no-dynamic-code-evaluation
new vm.Script("code");
// ruleid: rehab-api.no-tls-verification-bypass
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// ruleid: rehab-api.no-weak-cryptographic-hash
createHash("sha-1");
// ruleid: rehab-api.no-weak-cryptographic-hash
createHmac("sha1", "key");
// ruleid: rehab-api.no-unsafe-prisma-raw-query
prisma.$queryRawUnsafe("SELECT 1");
// ruleid: rehab-api.no-insecure-randomness
Math.random();

// ok: rehab-api.no-command-execution
const authorizationMatch = /Bearer/.exec("Bearer token");
// ok: rehab-api.no-weak-cryptographic-hash
createHash("sha256");
void authorizationMatch;
