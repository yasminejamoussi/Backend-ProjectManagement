const brain = require('brain.js');

// Création du réseau neuronal avec brain.js 1.6 (configuration par défaut)
const net = new brain.NeuralNetwork();

// Données d'entraînement
// Entrées : [progressExpected, tasksCompleted, statusValue, taskCount, isOverdue]
// Sortie : [delayDays] (normalisé sur 365 jours)
const trainingData = [
  { input: [0.2, 0.1, 0.5, 0.3, 0], output: [0] }, // 0 jours
  { input: [0.9, 0.2, 0.5, 0.5, 1], output: [0.027] }, // 10 jours
  { input: [0.0, 0.0, 0.0, 0.1, 1], output: [0.973] }, // 355 jours (ton cas)
  { input: [0.0, 0.0, 0.0, 0.1, 0], output: [0] }, // 0 jours
  { input: [0.5, 0.3, 0.5, 0.4, 0], output: [0] }, // 0 jours
  { input: [0.7, 0.2, 0.5, 0.6, 1], output: [0.055] }, // 20 jours
  { input: [0.1, 0.0, 0.0, 0.2, 1], output: [0.247] }, // 90 jours
  { input: [0.3, 0.5, 0.5, 0.3, 0], output: [0] }, // 0 jours
  { input: [0.8, 0.4, 0.5, 0.5, 1], output: [0.041] }, // 15 jours
  { input: [0.0, 0.0, 0.0, 0.5, 0], output: [0] }, // 0 jours
  { input: [0.6, 0.6, 1.0, 0.2, 0], output: [0] }, // 0 jours
  { input: [0.9, 0.8, 0.5, 0.4, 1], output: [0.019] }, // 7 jours
  { input: [0.4, 0.2, 0.5, 0.3, 0], output: [0] }, // 0 jours
  { input: [0.2, 0.0, 0.0, 0.1, 1], output: [0.493] }, // 180 jours
  { input: [0.5, 0.4, 0.5, 0.5, 0], output: [0] }, // 0 jours
  { input: [0.8, 0.3, 0.5, 0.6, 1], output: [0.082] }, // 30 jours
  { input: [0.1, 0.1, 0.0, 0.2, 0], output: [0] }, // 0 jours
  { input: [0.7, 0.5, 0.5, 0.4, 1], output: [0.033] }, // 12 jours
  { input: [0.3, 0.3, 0.5, 0.2, 0], output: [0] }, // 0 jours
  { input: [0.9, 0.1, 0.5, 0.7, 1], output: [0.068] }, // 25 jours
{ input: [1.0, 1.0, 1.0, 0.2, 0], output: [0] }, // Completed, tout fini → 0 jours
  { input: [0.5, 0.5, 0.5, 0.2, 0], output: [0] }, // In Progress, 50% → 0 si pas overdue
  { input: [0.5, 0.5, 0.5, 0.2, 1], output: [0.041] }, // In Progress, 50%, overdue → 15 jours
  // ... autres données ...
];

net.train(trainingData, {
  iterations: 20000,
  errorThresh: 0.005,
  log: true,
  logPeriod: 1000,
});

function predictDelay(project) {
  const { tasks, status, startDate, endDate } = project;
  const today = new Date();

  // Calculs de base
  const totalDuration = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
  const elapsedDays = Math.max((today - new Date(startDate)) / (1000 * 60 * 60 * 24), 0);
  const isOverdue = today > new Date(endDate) && status !== 'Completed' ? 1 : 0;

  let progressExpected = status === 'Pending' || totalDuration <= 0 || today < new Date(startDate)
    ? 0
    : Math.min(elapsedDays / totalDuration, 1);

  const tasksCompleted = tasks && tasks.length > 0
    ? tasks.filter(t => t.status === 'Done' || t.status === 'Tested').length / tasks.length
    : 0;

  const statusValue = status === 'Pending' ? 0 : (status === 'In Progress' ? 0.5 : 1);
  const taskCount = tasks ? tasks.length / 10 : 0;

  const input = [progressExpected, tasksCompleted, statusValue, taskCount, isOverdue];
  console.log("Entrées envoyées à Brain.js :", input);
  const output = net.run(input);
  console.log("Sortie de Brain.js :", output);

  let delayDays = Math.round(output[0] * 365);

  // Logique métier pour corriger delayDays
  if (status === 'Completed') {
    delayDays = 0; // Pas de retard si terminé
  } else if (isOverdue === 0) {
    // Si pas encore en retard, limiter delayDays à une prédiction raisonnable
    const remainingDays = Math.max((new Date(endDate) - today) / (1000 * 60 * 60 * 24), 0);
    delayDays = Math.min(delayDays, remainingDays > 0 ? 0 : Math.abs(remainingDays)); // 0 si dans les temps
  } else {
    // Si en retard, ajuster delayDays en fonction du dépassement réel + prédiction
    const overdueDays = Math.abs(elapsedDays - totalDuration);
    delayDays = Math.max(overdueDays, delayDays); // Minimum = retard réel
  }

  // riskOfDelay basé sur isOverdue et delayDays
  const riskOfDelay = (isOverdue === 1 || delayDays > 0) ? 'Oui' : 'Non';

  return {
    riskOfDelay: riskOfDelay,
    delayDays: delayDays,
    details: {
      progressExpected: (progressExpected * 100).toFixed(2) + '%',
      tasksCompleted: (tasksCompleted * 100).toFixed(2) + '%',
      status: status,
      taskCount: tasks ? tasks.length : 0,
      overdue: isOverdue ? 'Oui' : 'Non',
    },
  };
}

module.exports = { predictDelay };