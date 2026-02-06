import * as vscode from 'vscode';
import { PackageJsonProvider, DependencyLocation, VersionChangeType, ClickableZone } from './packageJsonProvider';

export class VersionInlayHintsProvider implements vscode.InlayHintsProvider {
    private _onDidChangeInlayHints: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeInlayHints: vscode.Event<void> = this._onDidChangeInlayHints.event;

    // Decoration types for different version change types
    private majorDecorationType: vscode.TextEditorDecorationType;
    private minorDecorationType: vscode.TextEditorDecorationType;
    private patchDecorationType: vscode.TextEditorDecorationType;
    private invalidDecorationType: vscode.TextEditorDecorationType;
    private dropdownIconDecorationType: vscode.TextEditorDecorationType;

    // Icon for the dropdown button
    private readonly DROPDOWN_ICON = ' ⏷';
    private readonly ICON_LENGTH = 2; // Space + icon

    constructor(private packageJsonProvider: PackageJsonProvider) {
        // Light blue for major updates
        this.majorDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 20em',
                color: '#6CB6FF', // Light blue
            }
        });

        // Orange for minor updates
        this.minorDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 20em',
                color: '#FFA500', // Orange
            }
        });

        // Green for patch updates
        this.patchDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 20em',
                color: '#4EC9B0', // Green
            }
        });

        // Red for invalid versions
        this.invalidDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 20em',
                color: '#F44747', // Red
            }
        });

        // Dropdown icon (shown separately after the closing quote)
        this.dropdownIconDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0',
                color: '#858585', // Gray
            }
        });

        // Listen for active editor changes to apply decorations
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && editor.document.fileName.endsWith('package.json')) {
                this.prefetchAndUpdate(editor);
            }
        });

        // Apply decorations to current editor if it's a package.json
        if (vscode.window.activeTextEditor?.document.fileName.endsWith('package.json')) {
            this.prefetchAndUpdate(vscode.window.activeTextEditor);
        }
    }

    private async prefetchAndUpdate(editor: vscode.TextEditor): Promise<void> {
        const dependencies = this.packageJsonProvider.parseDependencies(editor.document);
        // Prefetch all packages in parallel for speed
        await this.packageJsonProvider.prefetchPackages(dependencies.map(d => d.packageName));
        await this.updateDecorations(editor);
    }

    refresh(): void {
        this._onDidChangeInlayHints.fire();
        if (vscode.window.activeTextEditor?.document.fileName.endsWith('package.json')) {
            this.updateDecorations(vscode.window.activeTextEditor);
        }
    }

    private async updateDecorations(editor: vscode.TextEditor): Promise<void> {
        const document = editor.document;
        const dependencies = this.packageJsonProvider.parseDependencies(document);

        const majorDecorations: vscode.DecorationOptions[] = [];
        const minorDecorations: vscode.DecorationOptions[] = [];
        const patchDecorations: vscode.DecorationOptions[] = [];
        const invalidDecorations: vscode.DecorationOptions[] = [];
        const dropdownIconDecorations: vscode.DecorationOptions[] = [];
        const clickableZones: ClickableZone[] = [];

        // Fetch all package info in parallel
        const packageInfoPromises = dependencies.map(async (dep) => {
            const info = await this.packageJsonProvider.getPackageInfo(dep.packageName);
            return { dep, info };
        });

        const results = await Promise.all(packageInfoPromises);

        for (const { dep, info } of results) {
            if (!info) {
                continue;
            }

            const currentVersionClean = dep.currentVersion.replace(/[\^~>=<]/g, '');
            const latestVersion = info.latestVersion;
            
            // Check if current version is valid (exists in the list of all versions)
            const isValidVersion = info.allVersions.includes(currentVersionClean);
            
            const changeType = this.packageJsonProvider.getVersionChangeType(currentVersionClean, latestVersion);

            // Check if there's a comma after the closing quote
            const lineText = document.lineAt(dep.line).text;
            const charAfterQuote = lineText.charAt(dep.versionStartChar + dep.versionLength + 1);
            const hasComma = charAfterQuote === ',';

            // Position for the icon (inside the quotes, right before the closing quote)
            const iconRange = new vscode.Range(
                new vscode.Position(dep.line, dep.versionStartChar + dep.versionLength),
                new vscode.Position(dep.line, dep.versionStartChar + dep.versionLength)
            );

            // Position for the version info (after the closing quote and comma if present)
            const versionInfoRange = new vscode.Range(
                new vscode.Position(dep.line, dep.versionStartChar + dep.versionLength + (hasComma ? 2 : 1)),
                new vscode.Position(dep.line, dep.versionStartChar + dep.versionLength + (hasComma ? 2 : 1))
            );

            if (!isValidVersion) {
                // Show icon with space inside quotes
                const iconDecoration: vscode.DecorationOptions = {
                    range: iconRange,
                    renderOptions: {
                        after: {
                            contentText: this.DROPDOWN_ICON + ' ',
                        }
                    }
                };
                dropdownIconDecorations.push(iconDecoration);

                // Show version info outside quotes
                const decorationText = `Version Not Found → ${latestVersion}`;
                const decoration: vscode.DecorationOptions = {
                    range: versionInfoRange,
                    renderOptions: {
                        after: {
                            contentText: decorationText,
                        }
                    }
                };
                invalidDecorations.push(decoration);

                // Track clickable zone
                clickableZones.push({
                    line: dep.line,
                    startChar: dep.versionStartChar,
                    endChar: dep.versionStartChar + dep.versionLength + decorationText.length + 5,
                    packageName: dep.packageName,
                    currentVersion: dep.currentVersion,
                    versionStartChar: dep.versionStartChar,
                    versionLength: dep.versionLength
                });
            } else if (changeType !== VersionChangeType.None) {
                // Show icon with space inside quotes
                const iconDecoration: vscode.DecorationOptions = {
                    range: iconRange,
                    renderOptions: {
                        after: {
                            contentText: this.DROPDOWN_ICON + ' ',
                        }
                    }
                };
                dropdownIconDecorations.push(iconDecoration);

                // Show version info outside quotes
                const decorationText = `→ ${latestVersion}`;
                const decoration: vscode.DecorationOptions = {
                    range: versionInfoRange,
                    renderOptions: {
                        after: {
                            contentText: decorationText,
                        }
                    }
                };

                // Track clickable zone
                clickableZones.push({
                    line: dep.line,
                    startChar: dep.versionStartChar,
                    endChar: dep.versionStartChar + dep.versionLength + decorationText.length + 5,
                    packageName: dep.packageName,
                    currentVersion: dep.currentVersion,
                    versionStartChar: dep.versionStartChar,
                    versionLength: dep.versionLength
                });

                switch (changeType) {
                    case VersionChangeType.Major:
                        majorDecorations.push(decoration);
                        break;
                    case VersionChangeType.Minor:
                        minorDecorations.push(decoration);
                        break;
                    case VersionChangeType.Patch:
                        patchDecorations.push(decoration);
                        break;
                }
            }
        }

        // Store clickable zones for click detection
        this.packageJsonProvider.setClickableZones(clickableZones);

        editor.setDecorations(this.majorDecorationType, majorDecorations);
        editor.setDecorations(this.minorDecorationType, minorDecorations);
        editor.setDecorations(this.patchDecorationType, patchDecorations);
        editor.setDecorations(this.invalidDecorationType, invalidDecorations);
        editor.setDecorations(this.dropdownIconDecorationType, dropdownIconDecorations);
    }

    async provideInlayHints(
        document: vscode.TextDocument,
        range: vscode.Range,
        token: vscode.CancellationToken
    ): Promise<vscode.InlayHint[]> {
        // We're using decorations instead of inlay hints for better click support
        return [];
    }

    dispose(): void {
        this.majorDecorationType.dispose();
        this.minorDecorationType.dispose();
        this.patchDecorationType.dispose();
        this.invalidDecorationType.dispose();
        this.dropdownIconDecorationType.dispose();
    }
}
