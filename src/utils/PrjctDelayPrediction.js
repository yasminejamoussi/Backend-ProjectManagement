const brain = require('brain.js');

// Création du réseau neuronal
const net = new brain.NeuralNetwork({
  hiddenLayers: [10, 5], // Plus de couches pour mieux capturer les nuances
  activation: 'sigmoid'
});

// Données d'entraînement enrichies
// Entrées : [progressExpected, tasksCompleted, statusValue, taskCount, isOverdue, progressGap]
// Sortie : [delayDays] (normalisé sur 365 jours)
const trainingData = [
  // Cas sans retard
  { input: [0.2, 0.1, 0.5, 0.3, 0, 0.1], output: [0] }, // Progression alignée
  { input: [0.5, 0.5, 0.5, 0.4, 0, 0.0], output: [0] }, // In Progress, 50%
  { input: [1.0, 1.0, 1.0, 0.2, 0, 0.0], output: [0] }, // Completed
  { input: [0.0, 0.0, 0.0, 0.1, 0, 0.0], output: [0] }, // Pending, rien commencé
  { input: [0.0, 1.0, 0.0, 0.1, 0, 1.0], output: [0] }, // Pending, tâches terminées

  // Cas avec retard faible (même sans isOverdue)
  { input: [0.8, 0.4, 0.5, 0.5, 0, 0.4], output: [0.019] }, // 7 jours, grand écart
  { input: [0.7, 0.3, 0.5, 0.4, 0, 0.4], output: [0.014] }, // 5 jours
  { input: [0.9, 0.6, 0.5, 0.6, 0, 0.3], output: [0.008] }, // 3 jours

  // Cas avec isOverdue = 1
  { input: [0.9, 0.2, 0.5, 0.5, 1, 0.7], output: [0.027] }, // 10 jours
  { input: [0.7, 0.2, 0.5, 0.6, 1, 0.5], output: [0.055] }, // 20 jours
  { input: [0.8, 0.4, 0.5, 0.5, 1, 0.4], output: [0.041] }, // 15 jours
  { input: [0.0, 0.0, 0.0, 0.1, 1, 0.0], output: [0.973] }, // 355 jours
  { input: [0.1, 0.0, 0.0, 0.2, 1, 0.1], output: [0.247] }, // 90 jours
  { input: [0.2, 0.0, 0.0, 0.1, 1, 0.2], output: [0.493] }, // 180 jours

  // Cas intermédiaires
  { input: [0.6, 0.2, 0.5, 0.5, 0, 0.4], output: [0.027] }, // 10 jours, grand écart
  { input: [0.5, 0.1, 0.5, 0.3, 0, 0.4], output: [0.033] }, // 12 jours
  { input: [0.4, 0.3, 0.5, 0.3, 0, 0.1], output: [0.005] }, // 2 jours
  { input: [0.877, 0.0, 0.5, 0.3, 0, 0.877], output: [0.019] }, // 7 jours (Weather App)
  { input: [0.7, 0.4, 0.5, 0.4, 0, 0.3], output: [0.011] }, // 4 jours
  { input: [0.0, 0.5, 0.0, 0.2, 0, 0.5], output: [0] } // Pending, 50% terminé
];

// Entraîner le modèle
net.train(trainingData, {
  iterations: 30000, // Plus d'itérations
  errorThresh: 0.002, // Seuil plus strict
  log: true,
  logPeriod: 1000
});

function predictDelay(project) {
  const { tasks, status, startDate, endDate } = project;
  const today = new Date();

  // Calculs de base
  const totalDuration = Math.max((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24), 1);
  const elapsedDays = Math.max((today - new Date(startDate)) / (1000 * 60 * 60 * 24), 0);
  const isOverdue = today > new Date(endDate) && status !== 'Completed' ? 1 : 0;

  // Progression attendue
  let progressExpected = status === 'Pending' || totalDuration <= 0 || today < new Date(startDate)
    ? 0
    : Math.min(elapsedDays / totalDuration, 1);

  // Progression réelle
  const tasksCompleted = tasks && tasks.length > 0
    ? tasks.filter(t => t.status === 'Done' || t.status === 'Tested').length / tasks.length
    : 0;

  // Ajuster progressExpected pour cas atypiques
  if (status === 'Pending' && tasksCompleted > 0) {
    progressExpected = tasksCompleted;
    console.warn(`Projet ${project.name}: Statut 'Pending' ajusté avec tasksCompleted=${tasksCompleted}`);
  }

  // Écart de progression
  const progressGap = Math.abs(progressExpected - tasksCompleted);

  const statusValue = status === 'Pending' ? 0 : (status === 'In Progress' ? 0.5 : 1);
  const taskCount = tasks ? tasks.length / 10 : 0;

  // Entrées pour le réseau
  const input = [progressExpected, tasksCompleted, statusValue, taskCount, isOverdue, progressGap];
  console.log("Entrées envoyées à Brain.js:", input);

  // Prédiction
  const output = net.run(input);
  console.log("Sortie de Brain.js:", output);

  // Arrondir immédiatement la prédiction pour éviter les décimales
  let delayDays = Math.round(output[0] * 365);

  // Logique métier ajustée
  if (status === 'Completed' || tasksCompleted >= 1) {
    delayDays = 0; // Pas de retard si terminé
  } else if (isOverdue) {
    const overdueDays = Math.round(Math.abs(elapsedDays - totalDuration)); // Arrondi ici
    delayDays = Math.max(overdueDays, delayDays); // Prendre le maximum, déjà arrondi
  } else if (progressGap > 0.3) {
    const remainingDays = Math.round(Math.max((new Date(endDate) - today) / (1000 * 60 * 60 * 24), 0)); // Arrondi ici
    const estimatedDaysNeeded = Math.round(tasks.length * (1 - tasksCompleted) * 2); // 2 jours par tâche, arrondi
    if (estimatedDaysNeeded > remainingDays) {
      delayDays = Math.round(Math.min(delayDays, estimatedDaysNeeded - remainingDays)); // Arrondi final
    } else if (delayDays > remainingDays) {
      delayDays = Math.round(Math.min(delayDays, remainingDays * progressGap)); // Arrondi final
    }
  } else {
    delayDays = 0; // Pas de retard si écart faible
  }

  // Garantir que delayDays est un entier
  delayDays = Math.round(delayDays);

  const riskOfDelay = delayDays > 0 || isOverdue ? 'Oui' : 'Non';

  return {
    delayDays, // Maintenant garanti comme entier
    riskOfDelay,
    details: {
      progressExpected: (progressExpected * 100).toFixed(2) + '%',
      tasksCompleted: (tasksCompleted * 100).toFixed(2) + '%',
      status,
      taskCount: tasks ? tasks.length : 0,
      overdue: isOverdue ? 'Oui' : 'Non',
      progressGap: (progressGap * 100).toFixed(2) + '%'
    }
  };
}

module.exports = { predictDelay };