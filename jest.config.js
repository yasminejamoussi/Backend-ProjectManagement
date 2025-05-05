module.exports = {
    testEnvironment: "node",
    collectCoverage: true,
    coverageDirectory: "coverage",
    reporters: [
      "default",
      ["jest-junit", { outputDirectory: "test-results", outputName: "results.xml" }]
    ]
  };
  