const brain = require('brain.js');

const net = new brain.NeuralNetwork({hiddenLayers:[10,5],activation:'sigmoid',learningRate:0.01});

const preTrainedModel = {"sizes":[6,10,5,1],"layers":[{"tasks":{},"high":{},"medium":{},"low":{},"urgent":{},"team":{}},{"0":{"bias":0.21138763427734375,"weights":{"tasks":-0.45092761516571045,"high":-0.13946738839149475,"medium":-0.22468535602092743,"low":0.269281268119812,"urgent":-0.9120752215385437,"team":0.2403460294008255}},"1":{"bias":0.4316534399986267,"weights":{"tasks":-0.745396614074707,"high":0.23709461092948914,"medium":-0.5184770226478577,"low":0.5341004133224487,"urgent":-2.2060165405273438,"team":0.6794464588165283}},"2":{"bias":-0.3105723261833191,"weights":{"tasks":1.4626346826553345,"high":-0.7533319592475891,"medium":0.31461217999458313,"low":-1.5138636827468872,"urgent":3.9896762371063232,"team":0.19212181866168976}},"3":{"bias":0.26880934834480286,"weights":{"tasks":-0.5200663208961487,"high":0.16860951483249664,"medium":-0.3358839452266693,"low":0.8621175289154053,"urgent":-2.3958024978637695,"team":0.7671359777450562}},"4":{"bias":0.3091227412223816,"weights":{"tasks":-0.9517898559570312,"high":0.5960320830345154,"medium":-0.2696419060230255,"low":0.6078353524208069,"urgent":-2.2640552520751953,"team":0.28933262825012207}},"5":{"bias":0.03068895824253559,"weights":{"tasks":0.004996635485440493,"high":-0.22079937160015106,"medium":-0.25642159581184387,"low":-0.0855785682797432,"urgent":0.18805980682373047,"team":0.15642431378364563}},"6":{"bias":-0.0502350777387619,"weights":{"tasks":0.4860614538192749,"high":-0.5094878673553467,"medium":0.32415473461151123,"low":-0.3299080729484558,"urgent":2.130106210708618,"team":-0.39658123254776}},"7":{"bias":-0.13719555735588074,"weights":{"tasks":0.29306915402412415,"high":0.038427215069532394,"medium":0.43118223547935486,"low":-0.19934096932411194,"urgent":1.2049593925476074,"team":-0.41434428095817566}},"8":{"bias":-0.19152429699897766,"weights":{"tasks":1.283805251121521,"high":-0.8247047066688538,"medium":0.004106393549591303,"low":-1.1818881034851074,"urgent":3.3207743167877197,"team":0.01046252716332674}},"9":{"bias":0.17375260591506958,"weights":{"tasks":-0.4970797002315521,"high":0.12742853164672852,"medium":-0.3294413685798645,"low":0.41848036646842957,"urgent":-2.125122547149658,"team":0.6992995142936707}}},{"0":{"bias":0.0570254810154438,"weights":{"0":0.12860898673534393,"1":-0.27193135023117065,"2":0.08910703659057617,"3":-0.3246571719646454,"4":-0.06921505928039551,"5":0.027853423729538918,"6":0.3335018455982208,"7":0.07779595255851746,"8":0.3117954730987549,"9":-0.0716773271560669}},"1":{"bias":0.19723695516586304,"weights":{"0":0.36457180976867676,"1":0.789092481136322,"2":-0.38624054193496704,"3":0.6869580745697021,"4":0.4976954758167267,"5":0.13671734929084778,"6":-0.24723318219184875,"7":-0.4219708740711212,"8":-0.25123149156570435,"9":0.6991714239120483}},"2":{"bias":-0.3228638470172882,"weights":{"0":-0.49036890268325806,"1":-0.879979133605957,"2":0.10551398992538452,"3":-0.9175780415534973,"4":-0.7035642266273499,"5":-0.31243908405303955,"6":0.5056998133659363,"7":0.2991526126861572,"8":0.38919851183891296,"9":-0.9135700464248657}},"3":{"bias":-0.4842401146888733,"weights":{"0":0.7014472484588623,"1":2.3762800693511963,"2":-4.643666744232178,"3":2.339726209640503,"4":2.5497546195983887,"5":-0.5050854086875916,"6":-2.380260467529297,"7":-1.221105933189392,"8":-3.961132764816284,"9":2.0176916122436523}},"4":{"bias":-0.5092354416847229,"weights":{"0":-0.8000139594078064,"1":-1.3671015501022339,"2":0.584770679473877,"3":-1.457342505455017,"4":-1.0881280899047852,"5":-0.39795202016830444,"6":0.5238790512084961,"7":0.5031406879425049,"8":0.4874624013900757,"9":-1.147250771522522}}},{"duration":{"bias":0.8890259861946106,"weights":{"0":0.9371671676635742,"1":-2.1060001850128174,"2":2.05076265335083,"3":-6.03616189956665,"4":2.951625347137451}}}],"outputLookup":true,"inputLookup":true,"activation":"sigmoid","trainOpts":{"iterations":200000,"errorThresh":0.001,"log":true,"logPeriod":1000,"learningRate":0.01,"momentum":0.1,"callbackPeriod":10,"beta1":0.9,"beta2":0.999,"epsilon":1e-8}};

try {
  net.fromJSON(preTrainedModel);
} catch (error) {
  throw new Error("Failed to load pre-trained model");
}

function predictDuration(projectData) {
  if (!projectData || !projectData.tasks || !Array.isArray(projectData.tasks)) {
    throw new Error("Project data must include a valid tasks array");
  }

  const { startDate, tasks, teamMembers } = projectData;

  if (tasks.length === 0) {
    return 1;
  }

  const maxTasks = 10;
  const maxTeam = 5;
  const validPriorities = ["Urgent", "High", "Medium", "Low"];
  const high = tasks.filter(t => t.priority === "High").length;
  const medium = tasks.filter(t => t.priority === "Medium").length;
  const low = tasks.filter(t => t.priority === "Low").length;
  const urgent = tasks.filter(t => t.priority === "Urgent").length;

  const invalidTasks = tasks.filter(t => !t.priority || !validPriorities.includes(t.priority));
  if (invalidTasks.length > 0) {
    throw new Error(`Invalid priorities detected: ${invalidTasks.map(t => t.priority || 'undefined').join(", ")}`);
  }

  const input = {
    tasks: Math.min(tasks.length / maxTasks, 1),
    high: Math.min(high / maxTasks, 1),
    medium: Math.min(medium / maxTasks, 1),
    low: Math.min(low / maxTasks, 1),
    urgent: Math.min(urgent / maxTasks, 1),
    team: Math.min((teamMembers?.length || 0) / maxTeam, 1) || 0.2
  };

  let output;
  try {
    output = net.run(input);
  } catch (error) {
    throw new Error("Model prediction failed");
  }

  let predictedDays = Math.round(output.duration * 30);
  predictedDays = Math.max(predictedDays, Math.round(tasks.length * 1.0));
  if (urgent > 0) {
    predictedDays = Math.max(predictedDays, 7 + urgent * 7);
  }
  if (high > 0) {
    predictedDays = Math.max(predictedDays, 3 + high * 4);
  }
  if (medium >= 3) {
    predictedDays = Math.max(predictedDays, 5 + medium * 2);
  }
  if (teamMembers?.length >= 3) {
    predictedDays = Math.round(predictedDays * 0.9);
  }

  // Calculer la durée minimale basée sur les dueDate des tâches par rapport à startDate
  let minDaysBasedOnTasks = 1; // Par défaut, 1 jour minimum
  if (startDate && tasks.some(task => task.dueDate)) {
    const start = new Date(startDate);
    const latestDueDate = tasks
      .filter(task => task.dueDate)
      .map(task => new Date(task.dueDate))
      .reduce((latest, current) => (current > latest ? current : latest), start);

    // Calculer le nombre de jours entre startDate et la dueDate la plus tardive
    const timeDiff = latestDueDate - start;
    minDaysBasedOnTasks = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)); // Convertir en jours
    minDaysBasedOnTasks = Math.max(minDaysBasedOnTasks, 1); // S'assurer qu'il y a au moins 1 jour
  }

  // S'assurer que la durée prédite est au moins égale à la durée minimale basée sur les dueDate
  predictedDays = Math.max(predictedDays, minDaysBasedOnTasks);

  // Limiter la durée maximale à 30 jours (conserver la contrainte existante)
  predictedDays = Math.min(predictedDays, 30);

  return predictedDays;
}

module.exports = { predictDuration };