import * as vscode from 'vscode';
import { PackageJsonProvider } from './packageJsonProvider';
import { VersionInlayHintsProvider } from './versionInlayHintsProvider';
import { VersionCompletionProvider } from './versionCompletionProvider';

let packageJsonProvider: PackageJsonProvider;
let inlayHintsProvider: VersionInlayHintsProvider;
let completionProvider: VersionCompletionProvider;
let lastSelectionTime = 0;
let lastSelectionPosition: vscode.Position | null = null;
let suggestionWidgetVisible = false;
let currentVersionStringRange: { line: number; startChar: number; endChar: number } | null = null;
let suppressSelectionHandler = false;
let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function activate(context: vscode.ExtensionContext) {
    console.log('NPM Version Dropdown is now active!');

    packageJsonProvider = new PackageJsonProvider();
    inlayHintsProvider = new VersionInlayHintsProvider(packageJsonProvider);
    completionProvider = new VersionCompletionProvider(packageJsonProvider);
    
    // Register InlayHints provider (kept for compatibility but returns empty)
    const inlayHintsProviderDisposable = vscode.languages.registerInlayHintsProvider(
        { language: 'json', pattern: '**/package.json' },
        inlayHintsProvider
    );

    // Register completion provider for showing version dropdown
    const completionProviderDisposable = vscode.languages.registerCompletionItemProvider(
        { language: 'json', pattern: '**/package.json' },
        completionProvider,
        '"', '.', '-' // Trigger characters
    );

    // Track when suggestion widget is closed
    vscode.window.onDidChangeVisibleTextEditors(() => {
        suggestionWidgetVisible = false;
    });

    // Click detection and keyboard navigation for version strings
    const onDidChangeSelection = vscode.window.onDidChangeTextEditorSelection((event) => {
        const editor = event.textEditor;
        if (!editor.document.fileName.endsWith('package.json')) {
            return;
        }

        // Suppress after programmatic edits (e.g. version replacement)
        if (suppressSelectionHandler) {
            return;
        }

        // Check if this is a click (single selection, no text selected)
        if (event.selections.length !== 1 || !event.selections[0].isEmpty) {
            return;
        }

        const position = event.selections[0].active;
        const clickableZones = packageJsonProvider.getClickableZones();

        // Handle KEYBOARD navigation (right/left arrow keys)
        if (event.kind === vscode.TextEditorSelectionChangeKind.Keyboard || 
            event.kind === vscode.TextEditorSelectionChangeKind.Command) {
            
            // Check if we entered a version string range
            let foundZone = null;
            for (const zone of clickableZones) {
                if (position.line === zone.line && 
                    position.character >= zone.versionStartChar && 
                    position.character < zone.versionStartChar + zone.versionLength) {
                    foundZone = zone;
                    break;
                }
            }

            if (foundZone) {
                // We're inside a version string
                if (!currentVersionStringRange || 
                    currentVersionStringRange.line !== foundZone.line ||
                    currentVersionStringRange.startChar !== foundZone.versionStartChar) {
                    // Just entered this version string - show dropdown
                    currentVersionStringRange = {
                        line: foundZone.line,
                        startChar: foundZone.versionStartChar,
                        endChar: foundZone.versionStartChar + foundZone.versionLength
                    };
                    
                    if (!suggestionWidgetVisible) {
                        suggestionWidgetVisible = true;
                        triggerVersionDropdown(
                            foundZone.packageName,
                            foundZone.currentVersion,
                            foundZone.line,
                            foundZone.versionStartChar,
                            foundZone.versionLength
                        );
                        
                        setTimeout(() => {
                            suggestionWidgetVisible = false;
                        }, 500);
                    }
                }
                // Else: already in this version string with dropdown showing, do nothing
            } else {
                // We're outside any version string - hide dropdown
                if (currentVersionStringRange) {
                    currentVersionStringRange = null;
                    vscode.commands.executeCommand('closeParameterHints');
                }
            }
            return;
        }

        // Handle MOUSE click
        if (suggestionWidgetVisible) {
            return;
        }

        const now = Date.now();
        
        // Check if this is the same position as last time (likely keyboard navigation)
        if (lastSelectionPosition && 
            position.line === lastSelectionPosition.line && 
            position.character === lastSelectionPosition.character &&
            now - lastSelectionTime < 300) {
            return;
        }

        lastSelectionTime = now;
        lastSelectionPosition = position;

        // Check if click is in a clickable zone
        for (const zone of clickableZones) {
            if (position.line === zone.line && 
                position.character >= zone.startChar && 
                position.character <= zone.endChar) {
                
                // Check if click is beyond the version string (on the arrow/latest version decoration)
                const afterVersionString = position.character > zone.versionStartChar + zone.versionLength + 1;
                
                if (afterVersionString && zone.latestVersion) {
                    // Clicked on the arrow/latest version - directly replace
                    updatePackageVersion(
                        zone.latestVersion,
                        zone.line,
                        zone.versionStartChar,
                        zone.versionLength
                    );
                } else {
                    // Clicked on the version string itself - show dropdown
                    suggestionWidgetVisible = true;
                    triggerVersionDropdown(
                        zone.packageName,
                        zone.currentVersion,
                        zone.line,
                        zone.versionStartChar,
                        zone.versionLength
                    );
                    
                    setTimeout(() => {
                        suggestionWidgetVisible = false;
                    }, 1000);
                }
                
                return;
            }
        }
    });

    // Register command to show version dropdown at cursor position
    const showVersionsCommand = vscode.commands.registerCommand(
        'npmVersionLens.showVersions',
        async (packageName: string, currentVersion: string, line: number, character: number, versionLength: number) => {
            await triggerVersionDropdown(packageName, currentVersion, line, character, versionLength);
        }
    );

    // Register command to update version directly
    const updateVersionCommand = vscode.commands.registerCommand(
        'npmVersionLens.updateVersion',
        async (packageName: string, newVersion: string, line: number, character: number, versionLength: number) => {
            await updatePackageVersion(newVersion, line, character, versionLength);
        }
    );

    // Register refresh command
    const refreshCommand = vscode.commands.registerCommand(
        'npmVersionLens.refresh',
        () => {
            packageJsonProvider.clearCache();
            inlayHintsProvider.refresh();
        }
    );

    // Listen for document changes to refresh inlay hints (debounced)
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.fileName.endsWith('package.json')) {
            if (refreshDebounceTimer) {
                clearTimeout(refreshDebounceTimer);
            }
            refreshDebounceTimer = setTimeout(() => {
                inlayHintsProvider.refresh();
                refreshDebounceTimer = null;
            }, 300);
        }
    });

    context.subscriptions.push(
        inlayHintsProviderDisposable,
        completionProviderDisposable,
        showVersionsCommand,
        updateVersionCommand,
        refreshCommand,
        onDidChangeTextDocument,
        onDidChangeSelection
    );
}

async function triggerVersionDropdown(
    packageName: string,
    currentVersion: string,
    line: number,
    character: number,
    versionLength: number
) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    // Set the trigger context for the completion provider (including version position for replacement)
    completionProvider.setTriggerContext(packageName, line, character, versionLength);

    // Position cursor at the start of the version (don't select - selection causes filtering)
    const position = new vscode.Position(line, character);
    editor.selection = new vscode.Selection(position, position);
    
    // Trigger the completion dropdown
    await vscode.commands.executeCommand('editor.action.triggerSuggest');
}

async function updatePackageVersion(
    newVersion: string,
    line: number,
    character: number,
    versionLength: number
) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    // Suppress selection handler during and after the edit
    suppressSelectionHandler = true;

    const range = new vscode.Range(
        new vscode.Position(line, character),
        new vscode.Position(line, character + versionLength)
    );

    await editor.edit((editBuilder) => {
        editBuilder.replace(range, newVersion);
    });
    
    // Re-enable selection handler after a delay
    setTimeout(() => {
        suppressSelectionHandler = false;
    }, 500);
}

export function deactivate() {
    if (packageJsonProvider) {
        packageJsonProvider.dispose();
    }
}
