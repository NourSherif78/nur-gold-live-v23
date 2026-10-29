#!/usr/bin/env node
/**
 * Nur Jewellery Gold Live Dashboard - Verification Suite Root Runner
 * Runs the automated verification suite validating all R1-R5 requirements.
 */

const { runTestSuite } = require("./src/test-suite");

if (require.main === module) {
  runTestSuite().catch((err) => {
    console.error("Test suite fatal error:", err);
    process.exit(1);
  });
}

module.exports = {
  runTestSuite
};
