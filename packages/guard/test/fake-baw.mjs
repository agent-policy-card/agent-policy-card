#!/usr/bin/env node
// Fake wallet CLI for integration tests. Reads, previews and executes print canned JSON.
const argv = process.argv.slice(2);
if (argv[0] === "wallet" && argv[1] === "balance") {
  process.stdout.write('{"success":true,"data":{"balance":"1"}}');
} else if (argv[1] === "preview") {
  process.stdout.write(JSON.stringify({
    success: true,
    data: {
      requestId: "fake-secret-request",
      parsedTx: {},
      simulationResult: { balanceChanges: [], allowanceChanges: [], authorityChanges: [] },
      risks: { riskDetails: [], addresses: {}, riskBehaviors: [] },
      requireConfirmation: false,
      expiresAt: Date.now() + 60000,
    },
  }));
} else {
  process.stdout.write('{"success":true}');
}
