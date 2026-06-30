// ==============================
// key   = nama layer/tahun
// value = image LULC
// ==============================

var LULC_DICT = {
  '2018': lulc_2018,
  '2019': lulc_2019,
  '2020': lulc_2020,
  '2021': lulc_2021,
  '2022': lulc_2022,
  '2023': lulc_2023,
  '2024': lulc_2024,
  '2025': lulc_2025,
  '2026': lulc_2026
};

// ==============================
// DEM
// ==============================

var dem = ee.Image('USGS/SRTMGL1_003');

// ==============================
// CLASS META
// ==============================

var CLASS_META = {
  0 : { name: 'Mangrove',   color: '#38a800' },
  1 : { name: 'Palm Oil',   color: '#ffaa00' },
  2 : { name: 'Scrub',      color: '#e9d84c' },
  3 : { name: 'Peatland',    color: '#4e9600' },
  4 : { name: 'Bare Land',  color: '#d3d3d3' },
  5 : { name: 'Water',      color: '#1a6faf' },
  6 : { name: 'Built-Up',   color: '#df0101' },
  7 : { name: 'Dryland Forest',     color: '#267300' },
};

// ==============================
// PALETTE
// ==============================

var palette = [
  CLASS_META[0].color,
  CLASS_META[1].color,
  CLASS_META[2].color,
  CLASS_META[3].color,
  CLASS_META[4].color,
  CLASS_META[5].color,
  CLASS_META[6].color,
  CLASS_META[7].color
];


// ==============================
// TERRAIN HILLSHADE
// ==============================

var terrainHillshade = ee.Terrain.hillshade(dem)
  .divide(255)
  .multiply(0.7)
  .add(0.3);

// ==============================
// FUNCTION DISPLAY LULC
// ==============================

function addLulcLayer(label, lulcImage) {

  // RGB visualize
  var lulcRGB = lulcImage.visualize({
    min: 0,
    max: 7,
    palette: palette
  });

  // Blend dengan hillshade
  var lulcTerrain = lulcRGB.multiply(terrainHillshade);

  // Tambahkan layer
  Map.addLayer(
    lulcTerrain,
    {},
    'LULC ' + label,
    label === '2023' // default visible
  );
}

// ==============================
// LOOP SEMUA TAHUN
// ==============================

Object.keys(LULC_DICT).forEach(function(label) {
  addLulcLayer(label, LULC_DICT[label]);
});

// ==============================
// OPTIONAL DEM
// ==============================

Map.addLayer(
  dem,
  {
    min: 0,
    max: 1000
  },
  'DEM',
  false
);

// ==============================
// LEGEND
// ==============================

var legend = ui.Panel({ style: { position: 'bottom-left', padding: '8px 15px' } });
legend.add(ui.Label({ value: 'Legend', style: { fontWeight: 'bold', fontSize: '14px' } }));
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
Map.centerObject(geometry, 9);

// ==============================
// CENTER MAP
// ==============================

// gunakan geometry jika tersedia
Map.centerObject(geometry, 9);