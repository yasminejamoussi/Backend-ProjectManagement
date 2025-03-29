module.exports = {
  testEnvironment: "node",
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageReporters: ["lcov", "text", "html"],
  reporters: [
      "default",
      ["jest-junit", { outputDirectory: "test-results", outputName: "jest-junit.xml",includeConsoleOutput: true
      }]
  ],
  testMatch: ["**/test/**/*.unit.test.js"],
  setupFilesAfterEnv: ["<rootDir>/test/setup.js"]
};