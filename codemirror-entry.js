// Minimal CodeMirror 6 bundle entry — annotation editor only.
// Exposed as window.CM.{EditorView, EditorState, basicSetup, keymap, placeholder, lineWrapping, ...}
export { EditorView, keymap, placeholder } from '@codemirror/view';
export { EditorState }                                   from '@codemirror/state';
export { defaultKeymap, history, historyKeymap }         from '@codemirror/commands';
export { basicSetup }                                    from 'codemirror';
