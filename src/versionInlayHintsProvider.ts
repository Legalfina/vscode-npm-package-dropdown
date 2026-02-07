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
    private linkIconDecorationType: vscode.TextEditorDecorationType;

    // Icon for the dropdown button
    private readonly DROPDOWN_ICON = ' ⏷';
    private readonly ICON_LENGTH = 2; // Space + icon

    constructor(private packageJsonProvider: PackageJsonProvider) {
        // Light blue for major updates
        this.majorDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                color: '#6CB6FF', // Light blue
            }
        });

        // Orange for minor updates
        this.minorDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                color: '#FFA500', // Orange
            }
        });

        // Green for patch updates
        this.patchDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                color: '#4EC9B0', // Green
            }
        });

        // Red for invalid versions
        this.invalidDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                color: '#F44747', // Red
            }
        });

        // Dropdown icon (shown separately after the closing quote)
        this.dropdownIconDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0',
                color: '#FFFFFF', // White
            }
        });

        // Link icon (shown before the package name opening quote)
        this.linkIconDecorationType = vscode.window.createTextEditorDecorationType({
            before: {
                margin: '0 2px 0 0',
                color: '#64B5F6', // Light blue
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
        const linkIconDecorations: vscode.DecorationOptions[] = [];
        const clickableZones: ClickableZone[] = [];

        // Fetch all package info in parallel
        const packageInfoPromises = dependencies.map(async (dep) => {
            const info = await this.packageJsonProvider.getPackageInfo(dep.packageName);
            return { dep, info };
        });

        const results = await Promise.all(packageInfoPromises);

        // First pass: find the max line end position to calculate alignment
        let maxEndPosition = 0;
        for (const { dep } of results) {
            const lineText = document.lineAt(dep.line).text;
            const charAfterQuote = lineText.charAt(dep.versionStartChar + dep.versionLength + 1);
            const hasComma = charAfterQuote === ',';
            const endPosition = dep.versionStartChar + dep.versionLength + (hasComma ? 2 : 1);
            if (endPosition > maxEndPosition) {
                maxEndPosition = endPosition;
            }
        }

        // Target column: max end position + a fixed gap (in character widths)
        const TARGET_COLUMN = maxEndPosition + 8;

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
            const currentEndPosition = dep.versionStartChar + dep.versionLength + (hasComma ? 2 : 1);
            const versionInfoRange = new vscode.Range(
                new vscode.Position(dep.line, currentEndPosition),
                new vscode.Position(dep.line, currentEndPosition)
            );

            // Calculate the per-decoration margin in ch units to align at TARGET_COLUMN
            const marginCh = Math.max(4, TARGET_COLUMN - currentEndPosition);

            if (!isValidVersion) {
                // Show link icon before the package name
                if (dep.packageNameStartChar > 0) {
                    const linkRange = new vscode.Range(
                        new vscode.Position(dep.line, dep.packageNameStartChar - 1),
                        new vscode.Position(dep.line, dep.packageNameStartChar - 1)
                    );
                    // linkIconDecorations.push({
                    //     range: linkRange,
                    //     renderOptions: {
                    //         before: {
                    //             contentText: '🔗',
                    //         }
                    //     }
                    // });
                }

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

                // Show version info with per-decoration margin for alignment
                const decorationText = `Version Not Found → ${latestVersion}`;
                const decoration: vscode.DecorationOptions = {
                    range: versionInfoRange,
                    renderOptions: {
                        after: {
                            contentText: decorationText,
                            margin: `0 0 0 ${marginCh}ch`,
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
                    versionLength: dep.versionLength,
                    latestVersion: latestVersion
                });
            } else if (changeType !== VersionChangeType.None) {
                // Show link icon before the package name
                if (dep.packageNameStartChar > 0) {
                    const linkRange = new vscode.Range(
                        new vscode.Position(dep.line, dep.packageNameStartChar - 1),
                        new vscode.Position(dep.line, dep.packageNameStartChar - 1)
                    );
                    // linkIconDecorations.push({
                    //     range: linkRange,
                    //     renderOptions: {
                    //         before: {
                    //             contentText: '🔗',
                    //         }
                    //     }
                    // });
                }

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

                // Show version info with per-decoration margin for alignment
                const decorationText = `→ ${latestVersion}`;
                const decoration: vscode.DecorationOptions = {
                    range: versionInfoRange,
                    renderOptions: {
                        after: {
                            contentText: decorationText,
                            margin: `0 0 0 ${marginCh}ch`,
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
                    versionLength: dep.versionLength,
                    latestVersion: latestVersion
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
            } else {
                // Package is at latest version — still show dropdown icon for version switching
                // Show link icon before the package name
                if (dep.packageNameStartChar > 0) {
                    const linkRange = new vscode.Range(
                        new vscode.Position(dep.line, dep.packageNameStartChar - 1),
                        new vscode.Position(dep.line, dep.packageNameStartChar - 1)
                    );
                    // linkIconDecorations.push({
                    //     range: linkRange,
                    //     renderOptions: {
                    //         before: {
                    //             contentText: '🔗',
                    //         }
                    //     }
                    // });
                }

                const iconDecoration: vscode.DecorationOptions = {
                    range: iconRange,
                    renderOptions: {
                        after: {
                            contentText: this.DROPDOWN_ICON + ' ',
                        }
                    }
                };
                dropdownIconDecorations.push(iconDecoration);

                // Track clickable zone so clicking still opens the version picker
                clickableZones.push({
                    line: dep.line,
                    startChar: dep.versionStartChar,
                    endChar: dep.versionStartChar + dep.versionLength + 5,
                    packageName: dep.packageName,
                    currentVersion: dep.currentVersion,
                    versionStartChar: dep.versionStartChar,
                    versionLength: dep.versionLength,
                    latestVersion: latestVersion
                });
            }
        }

        // Store clickable zones for click detection
        this.packageJsonProvider.setClickableZones(clickableZones);

        editor.setDecorations(this.majorDecorationType, majorDecorations);
        editor.setDecorations(this.minorDecorationType, minorDecorations);
        editor.setDecorations(this.patchDecorationType, patchDecorations);
        editor.setDecorations(this.invalidDecorationType, invalidDecorations);
        editor.setDecorations(this.dropdownIconDecorationType, dropdownIconDecorations);
        editor.setDecorations(this.linkIconDecorationType, linkIconDecorations);
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
        this.linkIconDecorationType.dispose();
    }
}
