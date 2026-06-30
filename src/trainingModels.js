// ===============================
// Load dataset → Split → Train → Evaluate → Export
// ===============================

// ── CONFIG ──────────────────────────────────────────────────────────────────
var SEED        = 42;
var TRAIN_RATIO = 0.8;
var EXPORT_PATH = 'projects/radjaneggolan/assets/';
var DRIVE_FOLDER = 'LULC_Evaluation_2024';

var CLASS_NAMES = [
  'Mangrove',    // 0
  'Palm Oil',    // 1
  'Scrub',       // 2
  'Wetland',     // 3
  'Bare Land',   // 4
  'Water',       // 5
  'Built-Up',    // 6
  'Forest'       // 7
];

var NUM_CLASSES = CLASS_NAMES.length;

// Ambil nama prediktor secara dinamis (semua properti kecuali 'class' dan 'random') 
var allProps     = dataset.first().propertyNames();
var nonPredictor = ee.List(['class', 'random', 'system:index', '.geo']);
var predictors   = allProps.removeAll(nonPredictor);

print('── Dataset Info ──');
print('Jumlah total sampel', dataset.size());
print('Prediktor yang digunakan', predictors);
print('Jumlah prediktor', predictors.size());
print('Distribusi kelas', dataset.aggregate_histogram('class'));

// ── TRAIN / TEST SPLIT ───────────────────────────────────────────────────────
var withRandom = dataset.randomColumn('random', SEED);
var training   = withRandom.filter(ee.Filter.lt('random',  TRAIN_RATIO));
var testing    = withRandom.filter(ee.Filter.gte('random', TRAIN_RATIO));

print('── Split Info ──');
print('Training size', training.size());
print('Testing  size', testing.size());

// ── CLASSIFIER DEFINITIONS ───────────────────────────────────────────────────
// 1. CART
var cartClassifier = ee.Classifier.smileCart({
  maxNodes:         50,
  minLeafPopulation: 1
});

// 2. Random Forest
var rfClassifier = ee.Classifier.smileRandomForest({
  numberOfTrees:     200,
  variablesPerSplit: null,   // default: sqrt(n_features)
  minLeafPopulation: 1,
  bagFraction:       0.5,
  maxNodes:          null,
  seed:              SEED
});

// 3. Gradient Boosting
var gbClassifier = ee.Classifier.smileGradientTreeBoost({
  numberOfTrees:     200,
  shrinkage:         0.05,   
  samplingRate:      0.7,
  maxNodes:          10,
  loss:              'LeastAbsoluteDeviation',
  seed:              SEED
});

var classifiers = {
  CART: cartClassifier,
  RF:   rfClassifier,
  GB:   gbClassifier
};

// ── TRAINING ──────────────────────────────────────────────────────────────────
print('── Training Models ──');

var trainedCart = classifiers.CART.train({
  features:        training,
  classProperty:   'class',
  inputProperties: predictors
});

var trainedRF = classifiers.RF.train({
  features:        training,
  classProperty:   'class',
  inputProperties: predictors
});

var trainedGB = classifiers.GB.train({
  features:        training,
  classProperty:   'class',
  inputProperties: predictors
});

print('CART explain', trainedCart.explain());
print('RF   explain', trainedRF.explain());
print('GB   explain', trainedGB.explain());



// ── EVALUATION HELPER ─────────────────────────────────────────────────────────
var EPS = ee.Number(1e-12);

/**
 * Hitung semua metrik dari ee.Array confusion matrix (N×N).
 * Row = actual class, Column = predicted class.
 */
function computeMetricsFromCM(cmArray) {

  // ── True Positive per kelas
  var tp = cmArray
    .matrixDiagonal()
    .project([0]);   // penting → ubah jadi 1D [N]

  // ── Jumlah aktual per kelas (support)
  var rowSums = cmArray
    .reduce(ee.Reducer.sum(), [1])
    .project([0]);

  // ── Jumlah prediksi per kelas
  var colSums = cmArray
    .reduce(ee.Reducer.sum(), [0])
    .project([1]);

  // ── Precision = TP / (TP + FP)
  var precision = tp.divide(colSums);

  // ── Recall = TP / (TP + FN)
  var recall = tp.divide(rowSums);

  // ── F1-score
  var f1 = precision.multiply(recall).multiply(2)
    .divide(precision.add(recall));

  // ── Support
  var support = rowSums;

  // ── Total samples
  var totalSamples = rowSums
    .reduce(ee.Reducer.sum(), [0])
    .get([0]);

  // ── Macro average
  var macroPrecision = precision
    .reduce(ee.Reducer.mean(), [0])
    .get([0]);
  var macroRecall = recall
    .reduce(ee.Reducer.mean(), [0])
    .get([0]);
  var macroF1 = f1
    .reduce(ee.Reducer.mean(), [0])
    .get([0]);
  var wPrecision = precision.multiply(support)
    .reduce(ee.Reducer.sum(), [0])
    .get([0])
    .divide(totalSamples);
  var wRecall = recall.multiply(support)
    .reduce(ee.Reducer.sum(), [0])
    .get([0])
    .divide(totalSamples);
  var wF1 = f1.multiply(support)
    .reduce(ee.Reducer.sum(), [0])
    .get([0])
    .divide(totalSamples);

  return {
    tp: tp,
    precision: precision,
    recall: recall,
    f1: f1,
    support: support,
    totalSamples: totalSamples,
    macroPrecision: macroPrecision,
    macroRecall: macroRecall,
    macroF1: macroF1,
    wPrecision: wPrecision,
    wRecall: wRecall,
    wF1: wF1
  };
}

/**
 * Cetak classification report ke Console.
 */
function printClassificationReport(metrics, overallAcc, kappa, modelName) {
  print('══════════════════════════════════════════════');
  print('Classification Report —', modelName);
  print('──────────────────────────────────────────────');
  print('Overall Accuracy', overallAcc);
  print('Kappa', kappa);
  print('──────────────────────────────────────────────');
  print('Class → precision | recall | f1-score | support');

  for (var i = 0; i < NUM_CLASSES; i++) {
    print(
      CLASS_NAMES[i],
      '→ precision:', metrics.precision.get([i]),
      '| recall:', metrics.recall.get([i]),
      '| f1:', metrics.f1.get([i]),
      '| support:', metrics.support.get([i])
    );
  }

  print('──────────────────────────────────────────────');
  print('macro avg    → precision:', metrics.macroPrecision,
    '| recall:', metrics.macroRecall,
    '| f1:', metrics.macroF1,
    '| support:', metrics.totalSamples);

  print('weighted avg → precision:', metrics.wPrecision,
    '| recall:', metrics.wRecall,
    '| f1:', metrics.wF1,
    '| support:', metrics.totalSamples);
  print('══════════════════════════════════════════════');
}

/**
 * Evaluasi classifier → confusion matrix + semua metrik.
 */
function evaluateClassifier(trained, testSet, modelName) {
  var classified = testSet.classify(trained);
  var cm = classified.errorMatrix('class', 'classification');
  var overallAcc = cm.accuracy();
  var kappa = cm.kappa();
  var metrics = computeMetricsFromCM(cm.array());

  printClassificationReport(metrics, overallAcc, kappa, modelName);

  return {
    cm: cm,
    accuracy: overallAcc,
    kappa: kappa,
    metrics: metrics
  };
}

var evalCart = evaluateClassifier(trainedCart, testing, 'CART');
var evalRF   = evaluateClassifier(trainedRF, testing, 'Random Forest');
var evalGB   = evaluateClassifier(trainedGB, testing, 'Gradient Boosting');

// ── BUILD FEATURE COLLECTIONS UNTUK EXPORT ──────────────────────────────────

/**
 * Confusion matrix → FeatureCollection.
 * Satu baris per kelas aktual, plus metrik per kelas.
 */
function cmToFeatureCollection(evalResult, modelName) {
  var cmArray = evalResult.cm.array();
  var m = evalResult.metrics;

  var rowList = ee.List.sequence(0, NUM_CLASSES - 1).map(function(i) {
    i = ee.Number(i).toInt();
    var row = cmArray.slice(0, i, i.add(1)).project([1]); // baris ke-i → 1D

    var predCols = ee.Dictionary.fromLists(
      CLASS_NAMES.map(function(name) { return 'pred_' + name; }),
      ee.List.sequence(0, NUM_CLASSES - 1).map(function(j) {
        return row.get([ee.Number(j).toInt()]);
      })
    );

    return ee.Feature(null, predCols
      .set('model', modelName)
      .set('row_type', 'per_class')
      .set('class_id', i)
      .set('class_name', ee.List(CLASS_NAMES).get(i))
      .set('precision', m.precision.get([i]))
      .set('recall', m.recall.get([i]))
      .set('f1_score', m.f1.get([i]))
      .set('support', m.support.get([i]))
    );
  });

  return ee.FeatureCollection(rowList);
}

/**
 * Baris ringkasan: accuracy, macro avg, weighted avg.
 */
function summaryRowsToFC(evalResult, modelName) {
  var m = evalResult.metrics;

  var accuracyRow = ee.Feature(null, {
    model: modelName,
    row_type: 'accuracy',
    class_id: -3,
    class_name: 'accuracy',
    precision: null,
    recall: null,
    f1_score: evalResult.accuracy,
    support: m.totalSamples,
    kappa: evalResult.kappa
  });

  var macroRow = ee.Feature(null, {
    model: modelName,
    row_type: 'macro avg',
    class_id: -2,
    class_name: 'macro avg',
    precision: m.macroPrecision,
    recall: m.macroRecall,
    f1_score: m.macroF1,
    support: m.totalSamples
  });

  var weightedRow = ee.Feature(null, {
    model: modelName,
    row_type: 'weighted avg',
    class_id: -1,
    class_name: 'weighted avg',
    precision: m.wPrecision,
    recall: m.wRecall,
    f1_score: m.wF1,
    support: m.totalSamples
  });

  return ee.FeatureCollection([accuracyRow, macroRow, weightedRow]);
}

// ── Gabung semua model ──────────────────────────────────────────────────────
var allCM = ee.FeatureCollection([])
  .merge(cmToFeatureCollection(evalCart, 'CART'))
  .merge(summaryRowsToFC(evalCart, 'CART'))
  .merge(cmToFeatureCollection(evalRF, 'RF'))
  .merge(summaryRowsToFC(evalRF, 'RF'))
  .merge(cmToFeatureCollection(evalGB, 'GB'))
  .merge(summaryRowsToFC(evalGB, 'GB'));

// ── EXPORT KE DRIVE ─────────────────────────────────────────────────────────

// 1. Report lengkap per kelas + summary semua model
Export.table.toDrive({
  collection: allCM,
  description: 'classification_report_all_models',
  folder: DRIVE_FOLDER,
  fileNamePrefix: 'classification_report_all_models',
  fileFormat: 'CSV'
});

// 2. Hanya summary untuk perbandingan cepat
var summaryOnly = allCM.filter(
  ee.Filter.inList('row_type', ee.List(['accuracy', 'macro avg', 'weighted avg']))
);

Export.table.toDrive({
  collection: summaryOnly,
  description: 'summary_metrics_all_models',
  folder: DRIVE_FOLDER,
  fileNamePrefix: 'summary_metrics_all_models',
  fileFormat: 'CSV'
});



// ── SIMPAN CLASSIFIER ke ASSET ───────────────────────────────────────────────
Export.classifier.toAsset({
  classifier:  trainedCart,
  description: 'cart_lulc_2024',
  assetId:     EXPORT_PATH + 'cart_lulc_2024'
});

Export.classifier.toAsset({
  classifier:  trainedRF,
  description: 'rf_lulc_2024',
  assetId:     EXPORT_PATH + 'rf_lulc_2024'
});

Export.classifier.toAsset({
  classifier:  trainedGB,
  description: 'gb_lulc_2024',
  assetId:     EXPORT_PATH + 'gb_lulc_2024'
});

print('── Export Tasks Registered ──');
print('Drive folder target:', DRIVE_FOLDER);
print('Asset path target:',   EXPORT_PATH);