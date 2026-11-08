export type EditorIconName =
	| 'select'
	| 'node'
	| 'line'
	| 'arrow'
	| 'rectangle'
	| 'circle'
	| 'freehand'
	| 'undo'
	| 'redo'
	| 'delete'
	| 'fit'
	| 'inspector'
	| 'code';
const paths: Record<EditorIconName, string> = {
	select: 'M5 3l14 9-7 1-3 7-4-17Z',
	node: 'M4 5h16v14H4z M8 9h8 M12 9v6',
	line: 'M4 20 10 6 20 12',
	arrow: 'M4 20 20 4 M9 4h11v11',
	rectangle: 'M4 5h16v14H4z',
	circle: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
	freehand: 'M3 17c3-15 5 7 9-5s4 7 9-5',
	undo: 'M9 5 4 10l5 5 M4 10h9a6 6 0 0 1 6 8',
	redo: 'm15 5 5 5-5 5 M20 10h-9a6 6 0 0 0-6 8',
	delete: 'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
	fit: 'M9 3H3v6 M15 3h6v6 M3 15v6h6 M15 21h6v-6',
	inspector: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
	code: 'm8 6-6 6 6 6 m8-12 6 6-6 6 M14 3l-4 18',
};
export function EditorIcon({ name }: { name: EditorIconName }) {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d={paths[name]} />
		</svg>
	);
}
