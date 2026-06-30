// =============================================================================
//  LULC INFERENCE — RIAU (2018–2025)
//  Google Earth Engine | Random Forest (Pre-trained Model)
// =============================================================================


// ─────────────────────────────────────────────────────────────────────────────
// M1 · KONFIGURASI GLOBAL
// ─────────────────────────────────────────────────────────────────────────────

var CONFIG = {
  MODEL_ASSET        : 'projects/radjaneggolan/assets/randomforest',
  EXPORT_FOLDER      : 'projects/radjaneggolan/assets/',
  DRIVE_FOLDER       : 'LULC_Riau',
  AOI                : geometry,
  SCALE              : 30,
  CRS                : 'EPSG:32748',
  SEED               : 42,
  ORBIT_PASS         : 'DESCENDING',
  VOTE_KERNEL_RADIUS : 3,
  MMU_HA             : 0.5,
  SIEVE_PIXELS       : 3,   // disesuaikan: 0.5 ha @ 30m ≈ 6 piksel
  LABEL_COL          : 'class',
  N_CLASS            : 8,
};

// Tile scale global — naikkan ke 8 atau 16 jika masih OOM
var TILE_SCALE = 4;


// ─────────────────────────────────────────────────────────────────────────────
// M2 · LABEL & METADATA KELAS
// ─────────────────────────────────────────────────────────────────────────────

var CLASS_META = {
  0 : { name: 'Mangrove',  color: '#38a800' },
  1 : { name: 'Palm Oil',  color: '#ffaa00' },
  2 : { name: 'Scrub',     color: '#e9d84c' },
  3 : { name: 'Wetland',   color: '#4e9600' },
  4 : { name: 'Bare Land', color: '#d3d3d3' },
  5 : { name: 'Water',     color: '#1a6faf' },
  6 : { name: 'Built-Up',  color: '#df0101' },
  7 : { name: 'Forest',    color: '#267300' },
};

var CLASS_COLORS = Object.keys(CLASS_META).map(function(k) {
  return CLASS_META[k].color;
});

var CLASS_NAMES_DICT = ee.Dictionary({
  '0': 'Mangrove',  '1': 'Palm Oil', '2': 'Scrub',   '3': 'Wetland',
  '4': 'Bare Land', '5': 'Water',    '6': 'Built-Up', '7': 'Forest',
});

var VIS_PARAMS = { min: 0, max: 7, palette: CLASS_COLORS };


// ─────────────────────────────────────────────────────────────────────────────
// M3 · SENTINEL-2
// ─────────────────────────────────────────────────────────────────────────────

var maskS2 = function(img) {
  var qa  = img.select('QA60');
  var scl = img.select('SCL');
  var qaMask  = qa.bitwiseAnd(1 << 10).eq(0).and(qa.bitwiseAnd(1 << 11).eq(0));
  var sclMask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9))
                          .and(scl.neq(10)).and(scl.neq(11));
  return img.updateMask(qaMask.and(sclMask))
    .select(['B2','B3','B4','B8','B11','B12'],
            ['blue','green','red','nir','swir1','swir2'])
    .divide(10000);
};

var addS2Indices = function(img) {
  return img.addBands([
    img.normalizedDifference(['nir',   'red'  ]).rename('NDVI'),
    img.normalizedDifference(['green', 'nir'  ]).rename('NDWI'),
    img.normalizedDifference(['green', 'swir1']).rename('MNDWI'),
    img.normalizedDifference(['swir1', 'swir2']).rename('NDTI'),
    img.normalizedDifference(['swir1', 'nir'  ]).rename('NDBI'),
  ]);
};

var buildS2Composite = function(year, aoi) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi)
    .filterDate(ee.Date.fromYMD(year, 1, 1), ee.Date.fromYMD(year, 1, 1).advance(1, 'year'))
    .map(maskS2)
    .map(addS2Indices)
    .median()
    .clip(aoi);
};


// ─────────────────────────────────────────────────────────────────────────────
// M4 · SENTINEL-1 + GLCM
// ─────────────────────────────────────────────────────────────────────────────

var addS1Texture = function(img) {
  var vvQ = img.select('VV').multiply(100).toInt16();
  var vhQ = img.select('VH').multiply(100).toInt16();
  return img.addBands([
    vvQ.glcmTexture(1).select(['VV_contrast', 'VV_ent', 'VV_corr']),
    vhQ.glcmTexture(1).select(['VH_contrast', 'VH_ent', 'VH_corr']),
  ]);
};

var buildS1Composite = function(year, aoi) {
  return ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(aoi)
    .filterDate(ee.Date.fromYMD(year, 1, 1), ee.Date.fromYMD(year, 1, 1).advance(1, 'year'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.eq('orbitProperties_pass', CONFIG.ORBIT_PASS))
    .map(function(img) { return img.select(['VV', 'VH']); })
    .map(addS1Texture)
    .median()
    .clip(aoi);
};


// ─────────────────────────────────────────────────────────────────────────────
// M5 · GLO30 DEM
// ─────────────────────────────────────────────────────────────────────────────

// DEM bersifat statis — bangun sekali, pakai ulang semua tahun
var buildDEMComposite = function(aoi) {
  var col  = ee.ImageCollection('COPERNICUS/DEM/GLO30').filterBounds(aoi);
  var dem  = col.select('DEM').mosaic()
               .setDefaultProjection(col.first().projection())
               .rename('dem');
  var terr = ee.Terrain.products(dem);
  return dem.addBands(terr.select('slope')).addBands(terr.select('aspect')).clip(aoi);
};

// Bangun DEM satu kali di scope global agar tidak di-rebuild tiap tahun
var DEM_LAYER = buildDEMComposite(CONFIG.AOI);


// ─────────────────────────────────────────────────────────────────────────────
// M6 · FEATURE STACK (22 band, 30 m)
// ─────────────────────────────────────────────────────────────────────────────

var PREDICTOR_BANDS = [
  'blue','green','red','nir','swir1','swir2',
  'NDVI','NDWI','MNDWI','NDTI','NDBI',
  'VV','VH',
  'VV_contrast','VV_ent','VV_corr',
  'VH_contrast','VH_ent','VH_corr',
  'dem','slope','aspect'
];

var buildFeatureStack = function(year, aoi) {
  var proj30 = ee.Projection('EPSG:4326').atScale(CONFIG.SCALE);
  var s2  = buildS2Composite(year, aoi).reproject(proj30);
  var s1  = buildS1Composite(year, aoi).reproject(proj30);
  var dem = DEM_LAYER.reproject(proj30);

  var stack = s2.addBands(s1).addBands(dem).select(PREDICTOR_BANDS).clip(aoi);
  return stack.updateMask(stack.mask().reduce(ee.Reducer.min()));
};


// ─────────────────────────────────────────────────────────────────────────────
// M7 · LOAD PRE-TRAINED MODEL
// ─────────────────────────────────────────────────────────────────────────────

var loadClassifier = function() {
  return ee.Classifier.load(CONFIG.MODEL_ASSET);
};


// ─────────────────────────────────────────────────────────────────────────────
// M8 · KLASIFIKASI
// ─────────────────────────────────────────────────────────────────────────────

var classifyImage = function(featureStack, classifier) {
  return featureStack.classify(classifier).rename('class').toInt8();
};


// ─────────────────────────────────────────────────────────────────────────────
// M9 · WEIGHTED MAJORITY VOTING
// ─────────────────────────────────────────────────────────────────────────────

var applyWeightedMajorityVoting = function(classified, aoi) {
  var kernel = ee.Kernel.gaussian({
    radius: CONFIG.VOTE_KERNEL_RADIUS, sigma: CONFIG.VOTE_KERNEL_RADIUS / 2.0,
    units: 'pixels', normalize: true,
  });

  // Buat score per kelas lalu stack sekaligus — hindari loop berulang
  var classIds  = ee.List.sequence(0, CONFIG.N_CLASS - 1);
  var scoreList = classIds.map(function(id) {
    return classified.eq(ee.Number(id).toInt8()).unmask(0)
                     .toFloat().convolve(kernel);
  });

  var voted = ee.ImageCollection(scoreList).toBands()
                .toArray().arrayArgmax()
                .arrayFlatten([['class']]).toInt8()
                .rename('class').clip(aoi);

  return classified.unmask(voted).clip(aoi);
};


// ─────────────────────────────────────────────────────────────────────────────
// M10 · POST-PROCESSING: SIEVE + MMU
// ─────────────────────────────────────────────────────────────────────────────

var applyPostProcessing = function(classified) {
  var MMU_PIXELS = Math.max(1, Math.round(
    CONFIG.MMU_HA * 10000 / (CONFIG.SCALE * CONFIG.SCALE)
  ));

  // ── Helper: ganti patch kecil dengan focalMode tetangga ──
  var removeTinyPatches = function(img, threshold, focalRadius) {
    var patchSize = img.connectedPixelCount({
      maxSize: threshold + 1, eightConnected: true,
    });
    var tooSmall  = patchSize.lte(threshold);
    var filled    = img.focalMode({
      radius: focalRadius, kernelType: 'square', units: 'pixels',
    }).toInt8();
    return img.where(tooSmall, filled);
  };

  var sieved = removeTinyPatches(classified,   CONFIG.SIEVE_PIXELS, CONFIG.VOTE_KERNEL_RADIUS);
  var mmuOut = removeTinyPatches(sieved,        MMU_PIXELS,          5);
  return mmuOut;
};


// ─────────────────────────────────────────────────────────────────────────────
// M11 · VEKTORISASI
// ─────────────────────────────────────────────────────────────────────────────

var vectorizeClassification = function(classified, aoi, year) {
  var vectors = classified.reduceToVectors({
    geometry     : aoi,
    crs          : classified.projection(),
    scale        : CONFIG.SCALE,
    geometryType : 'polygon',
    eightConnected: true,
    labelProperty: 'class',
    maxPixels    : 1e13,
    tileScale    : TILE_SCALE,
    geometryInNativeProjection: false,
  });

  return vectors.map(function(feat) {
    var classId = feat.get('class');
    return feat
      .set('class_name', CLASS_NAMES_DICT.get(ee.Number(classId).toInt().format('%d')))
      .set('year',        year)
      .set('area_ha',     feat.geometry().area(1).divide(10000));
  });
};


// ─────────────────────────────────────────────────────────────────────────────
// M12 · FUNGSI EXPORT (DRY — tidak duplikat)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Satu titik masuk untuk semua export satu tahun.
 * @param {ee.Image}             raster
 * @param {ee.FeatureCollection} vectors
 * @param {number}               year
 * @param {object}               opts   — { toAsset, toDrive }
 */
var exportYear = function(raster, vectors, year, opts) {
  opts = opts || {};
  var tag = 'lulc_riau_' + year;

  // ── Raster → Asset ──
  if (opts.toAsset !== false) {
    Export.image.toAsset({
      image       : raster.toInt8(),
      description : tag + '_raster',
      assetId     : CONFIG.EXPORT_FOLDER + tag + '_raster',
      region      : CONFIG.AOI,
      scale       : CONFIG.SCALE,
      crs         : CONFIG.CRS,
      maxPixels   : 1e13,
    });
  }

  // ── Vektor → Asset ──
  if (opts.toAsset !== false) {
    Export.table.toAsset({
      collection  : vectors,
      description : tag + '_vector',
      assetId     : CONFIG.EXPORT_FOLDER + tag + '_vector',
    });
  }

  // ── Vektor → Drive (opsional) ──
  if (opts.toDrive === true) {
    Export.table.toDrive({
      collection    : vectors,
      description   : tag + '_vector_drive',
      folder        : CONFIG.DRIVE_FOLDER,
      fileNamePrefix: tag + '_vector',
      fileFormat    : 'SHP',
    });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// M13 · PIPELINE INFERENSI PER TAHUN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Jalankan seluruh pipeline untuk satu tahun.
 * Classifier diterima sebagai parameter — di-load sekali di luar loop.
 *
 * @param {number}         year
 * @param {ee.Classifier}  classifier
 * @param {object}         opts  — { addToMap, toAsset, toDrive }
 * @returns {{ raster, vectors }}
 */
var runInference = function(year, classifier, opts) {
  opts = opts || {};
  var doMap    = (opts.addToMap !== false);   // default true
  var doAsset  = (opts.toAsset  !== false);   // default true

  print('── Tahun', year, '──────────────────────────────────');

  var featureStack = buildFeatureStack(year, CONFIG.AOI);
  var classified   = classifyImage(featureStack, classifier);
  var filled       = applyWeightedMajorityVoting(classified, CONFIG.AOI);
  var cleaned      = applyPostProcessing(filled);
  var vectors      = vectorizeClassification(cleaned, CONFIG.AOI, year);

  if (doMap) {
    Map.addLayer(cleaned,  VIS_PARAMS, 'LULC ' + year, false);
    Map.addLayer(vectors,  {},         'Vektor ' + year, false);
  }

  exportYear(cleaned, vectors, year, { toAsset: doAsset, toDrive: opts.toDrive || false });

  print('✓', year, '— export dijadwalkan.');
  return { raster: cleaned, vectors: vectors };
};


// ─────────────────────────────────────────────────────────────────────────────
// M14 · TEMPORAL CONSISTENCY FILTER
// ─────────────────────────────────────────────────────────────────────────────

var applyTemporalConsistency = function(prev, curr, next) {
  var isAnomaly = prev.neq(curr).and(next.neq(curr)).and(prev.eq(next));
  return curr.where(isAnomaly, prev).rename('class').toInt8();
};

/**
 * Terapkan temporal consistency ke semua tahun tengah (bukan ujung).
 * Kembalikan objek berisi raster yang sudah dikoreksi.
 */
var applyTemporalConsistencyBatch = function(rasterMap, years) {
  var corrected = {};
  corrected[years[0]]                = rasterMap[years[0]];
  corrected[years[years.length - 1]] = rasterMap[years[years.length - 1]];

  for (var i = 1; i < years.length - 1; i++) {
    corrected[years[i]] = applyTemporalConsistency(
      rasterMap[years[i - 1]],
      rasterMap[years[i]],
      rasterMap[years[i + 1]]
    );
    print('✓ Temporal correction → tahun', years[i]);
  }
  return corrected;
};


// ─────────────────────────────────────────────────────────────────────────────
// ▶  EKSEKUSI
// ─────────────────────────────────────────────────────────────────────────────

var YEARS = [2024, 2025, 2026];

// Load model satu kali
print('⏳ Loading model...');
var CLASSIFIER = loadClassifier();
print('✓ Model siap.');

// ── Pass 1: inferensi per tahun, simpan raster (tanpa export dulu) ──
var rasterMap = {};
YEARS.forEach(function(yr) {
  // addToMap: false pada pass pertama — hindari render 8 layer sekaligus
  // toAsset:  false — export dilakukan setelah temporal correction
  var res = runInference(yr, CLASSIFIER, { addToMap: false, toAsset: false });
  rasterMap[yr] = res.raster;
});

// ── Pass 2: temporal consistency ──
print('── Temporal Consistency Filter ──────────────────');
var correctedMap = applyTemporalConsistencyBatch(rasterMap, YEARS);

// ── Pass 3: export final + tambah ke map ──
print('── Export & Visualisasi Final ───────────────────');
YEARS.forEach(function(yr) {
  var raster  = correctedMap[yr];
  var vectors = vectorizeClassification(raster, CONFIG.AOI, yr);

  // Tambah ke Map hanya tahun terakhir sebagai default, sisanya off
  var isLatest = (yr === YEARS[YEARS.length - 1]);
  Map.addLayer(raster,  VIS_PARAMS, 'LULC '   + yr, isLatest);
  Map.addLayer(vectors, {},         'Vektor '  + yr, false);

  exportYear(raster, vectors, yr, { toAsset: true, toDrive: false });
});

print('✓ Semua export dijadwalkan — cek Tasks panel.');


// ─────────────────────────────────────────────────────────────────────────────
// LEGENDA
// ─────────────────────────────────────────────────────────────────────────────

var legend = ui.Panel({ style: { position: 'bottom-left', padding: '8px 15px' } });
legend.add(ui.Label({ value: 'LULC Riau', style: { fontWeight: 'bold', fontSize: '14px' } }));
Object.keys(CLASS_META).forEach(function(k) {
  var row = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal') });
  row.add(ui.Label({ style: {
    backgroundColor: CLASS_META[k].color,
    padding: '8px', margin: '0 6px 4px 0'
  }}));
  row.add(ui.Label({ value: k + ' – ' + CLASS_META[k].name, style: { margin: '0 0 4px 6px' } }));
  legend.add(row);
});
Map.add(legend);
Map.centerObject(CONFIG.AOI, 9);