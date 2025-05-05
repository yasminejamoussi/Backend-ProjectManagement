const calculateProjectStatus = (tasks) => {
    // Si aucune tâche, le projet est "Pending"
    if (!tasks || tasks.length === 0) {
      return 'Pending';
    }
  
    // Compter les statuts des tâches
    const allDoneOrTested = tasks.every(task => task.status === 'Done' || task.status === 'Tested');
    const allToDo = tasks.every(task => task.status === 'To Do');
    const hasInProgressOrReview = tasks.some(task => task.status === 'In Progress' || task.status === 'Review');
  
    // Appliquer les règles
    if (allDoneOrTested) {
      return 'Completed'; // Toutes les tâches sont terminées
    }
    if (hasInProgressOrReview) {
      return 'In Progress'; // Au moins une tâche est en cours ou en revue
    }
    if (allToDo) {
      return 'Pending'; // Toutes les tâches sont "To Do"
    }
  
    // Cas par défaut (mélange de statuts, mais pas toutes terminées)
    return 'In Progress';
  };
  
  module.exports = calculateProjectStatus;