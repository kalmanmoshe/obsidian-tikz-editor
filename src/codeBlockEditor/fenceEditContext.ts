import type { Editor, TFile } from 'obsidian';
import type TikzEditorPlugin from '../main';

export const codeBlockDelimiterRegex = /^ {0,3}(?:`{3,}|~{3,})/;
export const latexCodeBlockLanguageRegex = /^ {0,3}(?:`{3,}|~{3,})[ \t]*(tikz|luatikz)(?=\s|$)/i;
export function extractCodeBlockLanguage(text: string): string | undefined {
  return text.split('\n')[0]?.match(latexCodeBlockLanguageRegex)?.[1]?.toLowerCase();
}

/** Parse complete top-level fences from the live buffer, including unsaved edits. */
export function parseNestedCodeBlocks(text: string): { start: number; end: number }[] {
  const lines = text.split('\n');
  const sections: { start: number; end: number }[] = [];
  for (let start = 0; start < lines.length; start++) {
    const opening = lines[start]?.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!opening || (opening[1]![0] === '`' && opening[2]!.includes('`'))) continue;
    const delimiter = opening[1]!;
    const closing = new RegExp(`^ {0,3}${delimiter[0]}{${delimiter.length},}[ \t]*$`);
    let end = start + 1;
    while (end < lines.length && !closing.test(lines[end]!)) end++;
    if (end === lines.length) break;
    sections.push({ start, end });
    start = end;
  }
  return sections;
}

export class FenceEditContext {
  private snapshot: string;
  private constructor(
    private plugin: TikzEditorPlugin,
    private editor: Editor | undefined,
    private file: TFile | null | undefined,
    private start: number,
    private end: number,
  ) { this.snapshot = editor?.getValue() ?? ''; }

  static create(plugin: TikzEditorPlugin, editor = plugin.app.workspace.activeEditor?.editor,
    file = plugin.app.workspace.activeEditor?.file) {
    const cursor = editor?.getCursor();
    const section = editor && cursor ? parseNestedCodeBlocks(editor.getValue())
      .find(({ start, end }) => start <= cursor.line && cursor.line <= end
        && extractCodeBlockLanguage(editor.getLine(start))) : undefined;
    return new FenceEditContext(plugin, editor, file, section?.start ?? -1, section?.end ?? -1);
  }

  isInFence(): boolean { return !!this.file && this.start >= 0; }
  getFenceData() {
    if (!this.editor || !this.isInFence()) return null;
    return { content: this.snapshot.split('\n').slice(this.start + 1, this.end).join('\n'),
      language: extractCodeBlockLanguage(this.editor.getLine(this.start))! };
  }
  getEditor() { return this.editor; }
  getBounds() { return [this.start, this.end]; }

  replaceFenceContent(value: string): void {
    if (!this.editor || !this.isInFence()) throw new Error('The TikZ block is no longer available.');
    const stillOpen = this.plugin.app.workspace.getLeavesOfType('markdown').some(({ view }) => {
      const note = view as unknown as { editor?: Editor; file?: TFile };
      return note.editor === this.editor && note.file === this.file;
    });
    if (!stillOpen || this.editor.getValue() !== this.snapshot) {
      throw new Error('The note changed while the editor was open. Copy your TikZ source before reopening the block.');
    }
    const opening = this.editor.getLine(this.start).match(/^ {0,3}(`{3,}|~{3,})/)!;
    const delimiter = opening[1]!;
    const closing = new RegExp(`^ {0,3}${delimiter[0]}{${delimiter.length},}[ \t]*$`, 'm');
    if (closing.test(value)) throw new Error('The source contains a closing code fence. Remove it before saving.');
    const body = value.length ? `${value}\n` : '';
    this.editor.replaceRange(body, { line: this.start + 1, ch: 0 }, { line: this.end, ch: 0 });
    this.end = this.start + 1 + (body.match(/\n/g)?.length ?? 0);
    this.snapshot = this.editor.getValue();
  }
}
