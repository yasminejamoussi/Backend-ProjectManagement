module.exports = {
  testEnvironment: "node",
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageReporters: ["lcov", "text", "html"],
  reporters: [
      "default",
      ["jest-junit", { outputDirectory: "test-results", outputName: "results.xml" }]
  ],
  testMatch: ["**/test/**/*.unit.test.js"],
  setupFilesAfterEnv: ["<rootDir>/test/setup.js"]
};