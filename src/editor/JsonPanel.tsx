import { json } from '@codemirror/lang-json';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { basicSetup, EditorView } from 'codemirror';
import { useEffect, useRef } from 'react';
import { parseJsonText } from '@/validator';

/** Синтаксические ошибки JSON прямо в тексте — тем же разбором, что у валидатора. */
const syntaxLinter = linter(
  (view) => {
    const text = view.state.doc.toString();
    const res = parseJsonText(text);
    if (res.ok) return [];
    const from = Math.min(res.position?.offset ?? text.length, text.length);
    const diagnostic: Diagnostic = {
      from,
      to: Math.min(from + 1, text.length),
      severity: 'error',
      message: res.message,
    };
    return [diagnostic];
  },
  { delay: 300 },
);

/** Редактор JSON конфига. Внешние изменения (из формы) подменяют текст без потери позиции прокрутки. */
export function JsonPanel({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const external = useRef(false);

  useEffect(() => {
    const v = new EditorView({
      doc: text,
      parent: host.current!,
      extensions: [
        basicSetup,
        json(),
        lintGutter(),
        syntaxLinter,
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !external.current) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    view.current = v;
    return () => v.destroy();
    // Редактор создаётся один раз; текст дальше синхронизируется эффектом ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === text) return;
    external.current = true;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
    external.current = false;
  }, [text]);

  return <div className="json-panel" ref={host} data-testid="json-editor" />;
}
