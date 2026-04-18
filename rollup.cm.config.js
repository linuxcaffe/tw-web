import resolve from '@rollup/plugin-node-resolve';

export default {
    input:  'codemirror-entry.js',
    output: { file: 'codemirror-bundle.js', format: 'iife', name: 'CM' },
    plugins: [resolve()],
};
