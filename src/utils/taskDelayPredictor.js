const brain = require('brain.js');

// Création du réseau neuronal pour les tâches
const taskNet = new brain.NeuralNetwork();

// Données d'entraînement adaptées à tes statuts (To Do, In Progress, Review, Done)
// Entrées : [progressExpected, isOverdue, statusValue, priorityValue, assignedCount]
// Sortie : [delayDays] (normalisé sur 365 jours)
const taskTrainingData = [
  { input: [0.2, 0, 0.5, 0.5, 0.2], output: [0] }, // 0 jours, 1 membre
  { input: [0.9, 1, 0.5, 1.0, 0.2], output: [0.027] }, // 10 jours, 1 membre
  { input: [0.0, 1, 0.0, 0.5, 0.4], output: [0.219] }, // 80 jours (réduit car 2 membres)
  { input: [0.0, 0, 0.0, 0.5, 0.2], output: [0] }, // 0 jours, 1 membre
  { input: [0.5, 0, 0.5, 0.5, 0.6], output: [0] }, // 0 jours, 3 membres
  { input: [0.7, 1, 0.5, 1.0, 0.2], output: [0.055] }, // 20 jours, 1 membre
  { input: [0.1, 1, 0.0, 0.5, 0.4], output: [0.110] }, // 40 jours (réduit car 2 membres)
  { input: [0.3, 0, 0.5, 0.5, 0.2], output: [0] }, // 0 jours, 1 membre
  { input: [0.8, 1, 0.5, 1.0, 0.6], output: [0.027] }, // 10 jours (réduit car 3 membres)
  { input: [0.0, 0, 0.0, 0.5, 0.2], output: [0] }, // 0 jours, 1 membre
  { input: [0.6, 0, 1.0, 0.5, 0.4], output: [0] }, // 0 jours, 2 membres
  { input: [0.9, 1, 0.5, 1.0, 0.2], output: [0.019] }, // 7 jours, 1 membre
  { input: [0.4, 0, 0.5, 0.5, 0.6], output: [0] }, // 0 jours, 3 membres
  { input: [0.2, 1, 0.0, 0.5, 0.4], output: [0.247] }, // 90 jours (réduit car 2 membres)
  { input: [0.5, 0, 0.5, 0.5, 0.2], output: [0] }, // 0 jours, 1 membre
  { input: [0.8, 1, 0.5, 1.0, 0.6], output: [0.055] }, // 20 jours (réduit car 3 membres)
  { input: [0.1, 0, 0.0, 0.5, 0.2], output: [0] }, // 0 jours, 1 membre
  { input: [0.7, 1, 0.5, 1.0, 0.4], output: [0.027] }, // 10 jours (réduit car 2 membres)
  { input: [0.3, 0, 0.5, 0.5, 0.2], output: [0] }, // 0 jours, 1 membre
  { input: [0.9, 1, 0.5, 1.0, 0.6], output: [0.041] }, // 15 jours (réduit car 3 membres)
  { input: [1.0, 0, 1.0, 0.5, 0.2], output: [0] }, // Done, pas de retard, 1 membre
  { input: [0.5, 1, 0.75, 0.5, 0.4], output: [0.033] }, // Review, overdue, 15 jours (réduit car 2 membres)
];

// Entraîner le réseau
taskNet.train(taskTrainingData, {
  iterations: 20000,
  errorThresh: 0.005,
  log: true,
  logPeriod: 1000,
});

// Fonction de prédiction
const predictTaskDelay = (task) => {
  const { status, startDate, dueDate, priority, assignedTo } = task;
  const today = new Date();

  // Calculs de base
  const totalDuration = dueDate && startDate
    ? (new Date(dueDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)
    : 1; // Éviter division par 0
  const elapsedDays = startDate
    ? Math.max((today - new Date(startDate)) / (1000 * 60 * 60 * 24), 0)
    : 0;
  const isOverdue = dueDate && today > new Date(dueDate) && status !== 'Done' ? 1 : 0;

  let progressExpected = status === 'To Do' || totalDuration <= 0 || !startDate || today < new Date(startDate)
    ? 0
    : Math.min(elapsedDays / totalDuration, 1);

  // Adapter statusValue à tes statuts
  const statusValue = status === 'To Do' ? 0
    : status === 'In Progress' ? 0.5
    : status === 'Review' ? 0.75
    : status === 'Done' ? 1
    : 0;
  const priorityValue = priority === 'High' ? 1
    : priority === 'Medium' ? 0.5
    : priority === 'Low' ? 0
    : 0;

  // Normaliser le nombre de membres assignés (max 5 membres)
  const assignedCount = Math.min(assignedTo ? assignedTo.length : 0, 5) / 5;

  const input = [progressExpected, isOverdue, statusValue, priorityValue, assignedCount];
  console.log(`Entrées Brain.js pour tâche ${task._id} :`, input);
  const output = taskNet.run(input);
  console.log(`Sortie Brain.js pour tâche ${task._id} :`, output);

  let delayDays = Math.round(output[0] * 365);

  // Logique métier
  if (status === 'Done') {
    delayDays = 0;
  } else if (isOverdue === 0) {
    const remainingDays = dueDate
      ? Math.max((new Date(dueDate) - today) / (1000 * 60 * 60 * 24), 0)
      : 0;
    delayDays = Math.min(delayDays, remainingDays > 0 ? 0 : Math.abs(remainingDays));
  } else {
    const overdueDays = dueDate ? Math.abs(elapsedDays - totalDuration) : delayDays;
    delayDays = Math.max(overdueDays, delayDays);
  }

  const riskOfDelay = (isOverdue === 1 || delayDays > 0) ? 'Oui' : 'Non';

  delayDays = Math.floor(delayDays);

  return {
    riskOfDelay,
    delayDays,
    details: {
      progressExpected: (progressExpected * 100).toFixed(2) + '%',
      status,
      priority,
      overdue: isOverdue ? 'Oui' : 'Non',
      assignedCount: assignedTo ? assignedTo.length : 0,
    },
  };
};

module.exports = { predictTaskDelay };