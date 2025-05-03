module.exports = {
    testEnvironment: "node",
    collectCoverage: true,
    coverageDirectory: "coverage",
    coverageReporters: ["lcov", "text"], 
    reporters: [
      "default",
      ["jest-junit", { outputDirectory: "test-results", outputName: "results.xml" }]
    ]
  };
  