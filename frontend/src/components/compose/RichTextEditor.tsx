import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';

export interface RichTextValue {
  html: string;
  text: string;
}

interface ToolbarButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolbarButton({ icon: Icon, label, active, disabled, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()} // keep the editor selection
      onClick={onClick}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-40',
        active ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden />;

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      blockquote: e.isActive('blockquote'),
      link: e.isActive('link'),
      alignLeft: e.isActive({ textAlign: 'left' }),
      alignCenter: e.isActive({ textAlign: 'center' }),
      alignRight: e.isActive({ textAlign: 'right' }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const toggleLink = () => {
    if (state.link) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt('Link URL', 'https://');
    if (url && url !== 'https://') editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
      <ToolbarButton icon={Undo2} label="Undo" disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()} />
      <ToolbarButton icon={Redo2} label="Redo" disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()} />
      <Divider />
      <ToolbarButton icon={Bold} label="Bold" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton icon={Italic} label="Italic" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton icon={Underline} label="Underline" active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <ToolbarButton icon={Strikethrough} label="Strikethrough" active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <Divider />
      <ToolbarButton icon={AlignLeft} label="Align left" active={state.alignLeft} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
      <ToolbarButton icon={AlignCenter} label="Align center" active={state.alignCenter} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
      <ToolbarButton icon={AlignRight} label="Align right" active={state.alignRight} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
      <Divider />
      <ToolbarButton icon={List} label="Bulleted list" active={state.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarButton icon={ListOrdered} label="Numbered list" active={state.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolbarButton icon={Quote} label="Quote" active={state.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <ToolbarButton icon={Link2} label={state.link ? 'Remove link' : 'Add link'} active={state.link} onClick={toggleLink} />
    </div>
  );
}

interface RichTextEditorProps {
  onChange: (value: RichTextValue) => void;
  invalid?: boolean;
  placeholder?: string;
}

export function RichTextEditor({ onChange, invalid, placeholder = 'Type your message…' }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
    ],
    editorProps: { attributes: { 'aria-label': 'Email body', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: e }) => onChange({ html: e.isEmpty ? '' : e.getHTML(), text: e.getText().trim() }),
  });

  return (
    <div
      className={cn(
        'rich-text overflow-hidden rounded-xl border bg-white transition focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-100',
        invalid ? 'border-red-400' : 'border-gray-300',
      )}
    >
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
