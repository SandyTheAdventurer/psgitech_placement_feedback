// Bundles the 3D scene (three.js, tree-shaken) into public/js/scene.js
const path = require('path');
const esbuild = require('esbuild');

esbuild
  .build({
    entryPoints: [path.join(__dirname, '..', 'src', 'scene.js')],
    outfile: path.join(__dirname, '..', 'public', 'js', 'scene.js'),
    bundle: true, minify: true, format: 'esm', target: 'es2020', legalComments: 'none',
  })
  .then(() => console.log('Built public/js/scene.js'))
  .catch(() => process.exit(1));
