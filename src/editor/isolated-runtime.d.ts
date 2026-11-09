declare module 'virtual:isolated-editor' {
	export function createEditorRuntime(): typeof import('./compact');
}
