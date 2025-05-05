// utils/PrjctDeadlinePrediction.js
const brain = require('brain.js');

const net = new brain.NeuralNetwork({
  hiddenLayers: [5, 5],
  activation: 'sigmoid',
});

const trainingData = [
  { input: { tasks: 0.1, high: 0, medium: 0.1, low: 0, urgent: 0, team: 0.2 }, output: { duration: 0.05 } }, // 1 jour
  { input: { tasks: 0.2, high: 0, medium: 0.1, low: 0.1, urgent: 0, team: 0.2 }, output: { duration: 0.1 } }, // 2 jours
  { input: { tasks: 0.3, high: 0, medium: 0.2, low: 0.1, urgent: 0, team: 0.4 }, output: { duration: 0.15 } }, // 3 jours
  { input: { tasks: 0.2, high: 0.1, medium: 0.1, low: 0, urgent: 0, team: 0.2 }, output: { duration: 0.2 } }, // 4 jours
  { input: { tasks: 0.3, high: 0.1, medium: 0.1, low: 0.1, urgent: 0, team: 0.4 }, output: { duration: 0.25 } }, // 5 jours
  { input: { tasks: 0.4, high: 0.2, medium: 0.1, low: 0.1, urgent: 0, team: 0.6 }, output: { duration: 0.3 } }, // 6 jours
  { input: { tasks: 0.5, high: 0.2, medium: 0.2, low: 0.1, urgent: 0, team: 0.4 }, output: { duration: 0.35 } }, // 7 jours
  { input: { tasks: 0.6, high: 0.2, medium: 0.2, low: 0.1, urgent: 0.1, team: 0.6 }, output: { duration: 0.4 } }, // 8 jours
  { input: { tasks: 0.3, high: 0.1, medium: 0, low: 0, urgent: 0.2, team: 0.2 }, output: { duration: 0.65 } }, // 13 jours
  { input: { tasks: 0.4, high: 0.2, medium: 0, low: 0, urgent: 0.2, team: 0.4 }, output: { duration: 0.5 } }, // 10 jours
  { input: { tasks: 0.8, high: 0.4, medium: 0.2, low: 0.1, urgent: 0.1, team: 0.8 }, output: { duration: 0.6 } }, // 12 jours
  { input: { tasks: 0.9, high: 0.4, medium: 0.3, low: 0.1, urgent: 0.1, team: 1.0 }, output: { duration: 0.65 } }, // 13 jours
  { input: { tasks: 0.8, high: 0.3, medium: 0.2, low: 0, urgent: 0.3, team: 0.8 }, output: { duration: 0.7 } }, // 14 jours
  { input: { tasks: 1.0, high: 0.5, medium: 0.2, low: 0.1, urgent: 0.2, team: 1.0 }, output: { duration: 0.75 } }, // 15 jours
  { input: { tasks: 1.0, high: 0.4, medium: 0.3, low: 0.1, urgent: 0.2, team: 0.8 }, output: { duration: 0.8 } }, // 16 jours
  { input: { tasks: 0.1, high: 0, medium: 0, low: 0.1, urgent: 0, team: 0.2 }, output: { duration: 0.05 } }, // 1 jour
  { input: { tasks: 0.5, high: 0, medium: 0, low: 0, urgent: 0.5, team: 0.2 }, output: { duration: 0.95 } }, // 19 jours
  { input: { tasks: 0.3, high: 0.3, medium: 0, low: 0, urgent: 0, team: 1.0 }, output: { duration: 0.25 } }, // 5 jours
  { input: { tasks: 0.7, high: 0.2, medium: 0.3, low: 0.2, urgent: 0, team: 0.6 }, output: { duration: 0.45 } }, // 9 jours
  { input: { tasks: 0.9, high: 0.5, medium: 0.2, low: 0, urgent: 0.2, team: 0.4 }, output: { duration: 0.9 } }  // 18 jours
];

net.train(trainingData, {
  iterations: 20000,
  errorThresh: 0.005,
  log: true,
  logPeriod: 1000
});

function predictDuration(projectData) {
  const { tasks, teamMembers } = projectData;

  if (!tasks || tasks.length === 0) {
    console.log("Aucune tâche fournie, durée par défaut : 0");
    return 0;
  }

  const high = tasks.filter(t => t.priority === "High").length;
  const medium = tasks.filter(t => t.priority === "Medium").length;
  const low = tasks.filter(t => t.priority === "Low").length;
  const urgent = tasks.filter(t => t.priority === "Urgent").length;

  const input = {
    tasks: tasks.length / 10,
    high: high / 10,
    medium: medium / 10,
    low: low / 10,
    urgent: urgent / 10,
    team: teamMembers.length / 5 || 0.2
  };

  console.log("Entrées envoyées à Brain.js :", input);
  const output = net.run(input);
  console.log("Sortie de Brain.js :", output);
  return Math.round(output.duration * 30);
}

module.exports = { predictDuration };