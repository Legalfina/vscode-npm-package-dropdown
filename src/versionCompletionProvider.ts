import * as vscode from 'vscode';
import { PackageJsonProvider } from './packageJsonProvider';

interface ParsedVersion {
    major: number;
    minor: number;
    patch: number;
    prerelease: string;
    original: string;
}

export class VersionCompletionProvider implements vscode.CompletionItemProvider {
    private triggerPackage: string | null = null;
    private triggerLine: number | null = null;
    private triggerVersionStart: number | null = null;
    private triggerVersionLength: number | null = null;

    constructor(private packageJsonProvider: PackageJsonProvider) {}

    setTriggerContext(packageName: string, line: number, versionStart: number, versionLength: number): void {
        this.triggerPackage = packageName;
        this.triggerLine = line;
        this.triggerVersionStart = versionStart;
        this.triggerVersionLength = versionLength;
    }

    clearTriggerContext(): void {
        this.triggerPackage = null;
        this.triggerLine = null;
        this.triggerVersionStart = null;
        this.triggerVersionLength = null;
    }

    private parseVersion(version: string): ParsedVersion {
        // Match semver: major.minor.patch[-prerelease] or major.minor.patch
        // Also handle versions that might have extra parts like 1.0.0-beta.1
        const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?/);
        if (match) {
            return {
                major: parseInt(match[1], 10),
                minor: parseInt(match[2], 10),
                patch: parseInt(match[3], 10),
                prerelease: match[4] || '',
                original: version
            };
        }
        // Fallback for non-standard versions - put them at the end
        return {
            major: -1,
            minor: -1,
            patch: -1,
            prerelease: version,
            original: version
        };
    }

    private compareVersions = (a: ParsedVersion, b: ParsedVersion): number => {
        // Sort by major (descending)
        if (b.major !== a.major) {
            return b.major - a.major;
        }
        // Sort by minor (descending)
        if (b.minor !== a.minor) {
            return b.minor - a.minor;
        }
        // Sort by patch (descending)
        if (b.patch !== a.patch) {
            return b.patch - a.patch;
        }
        // Stable versions come before prereleases
        if (!a.prerelease && b.prerelease) {
            return -1;
        }
        if (a.prerelease && !b.prerelease) {
            return 1;
        }
        // Sort prereleases alphabetically (descending)
        return b.prerelease.localeCompare(a.prerelease);
    };

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionList | null> {
        // Capture trigger context before any async operations
        const packageName = this.triggerPackage;
        const triggerLine = this.triggerLine;
        const versionStart = this.triggerVersionStart;
        const versionLength = this.triggerVersionLength;

        // Only provide completions if we have a trigger context
        if (!packageName || triggerLine === null || versionStart === null || versionLength === null) {
            return null;
        }

        // Only show completions on the triggered line
        if (position.line !== triggerLine) {
            return null;
        }

        try {
            const versions = await this.packageJsonProvider.getAllVersions(packageName);

            if (!versions || versions.length === 0) {
                console.log(`No versions found for ${packageName}`);
                return null;
            }

            const info = await this.packageJsonProvider.getPackageInfo(packageName);
            const latestVersion = info?.latestVersion || '';

            // Get current version from the line to preserve prefix
            const lineText = document.lineAt(position.line).text;
            const versionMatch = lineText.match(/"([^"]+)"\s*:\s*"([\^~>=<]*)([^"]+)"/);
            const prefix = versionMatch?.[2] || '';
            const currentVersionClean = versionMatch?.[3]?.replace(/[\^~>=<x*]/g, '') || '';

            // The range should start AFTER any prefix symbols (~, ^, >=, etc.)
            // This way VS Code's filter only sees the numeric version part.
            // e.g. for "~16.2.12": range starts at "1", prefix "~" is left untouched.
            // As user arrows through "16", VS Code extracts "16" and filters versions starting with 16.
            const cleanVersionStart = versionStart + prefix.length;
            const cleanVersionLength = versionLength - prefix.length;

            // Parse and sort versions
            const parsedVersions = versions.map(v => this.parseVersion(v));
            parsedVersions.sort(this.compareVersions);

            const completionItems: vscode.CompletionItem[] = parsedVersions.map((parsed, index) => {
                const version = parsed.original;
                const item = new vscode.CompletionItem(
                    version,
                    vscode.CompletionItemKind.Value
                );

                // Range covers only the numeric version (after prefix symbols)
                // The prefix (~, ^, etc.) is outside the range and stays in place
                const replaceRange = new vscode.Range(
                    new vscode.Position(position.line, cleanVersionStart),
                    new vscode.Position(position.line, cleanVersionStart + cleanVersionLength)
                );

                // insertText is just the version (no prefix, since prefix is outside the range)
                item.insertText = version;
                item.range = {
                    inserting: replaceRange,
                    replacing: replaceRange
                };
                
                // filterText is just the clean version — VS Code matches the text between
                // range.start (after prefix) and cursor position against this.
                // So arrowing through "16" extracts "16" and matches "16.3.0", "16.2.14", etc.
                item.filterText = version;
                
                // Sort text to maintain our sorted order
                item.sortText = index.toString().padStart(5, '0');
                
                // Build detail string
                const details: string[] = [];
                
                // Mark current version
                if (version === currentVersionClean) {
                    details.push('📌 Current');
                }
                
                // Mark latest version
                if (version === latestVersion) {
                    details.push('⭐ Latest');
                    item.sortText = '00000'; // Put latest at top
                    item.preselect = true;
                }

                // Add prerelease indicator
                if (parsed.prerelease) {
                    details.push('(prerelease)');
                }
                
                if (details.length > 0) {
                    item.detail = details.join(' · ');
                }

                item.documentation = new vscode.MarkdownString(`Install **${packageName}@${version}**`);

                return item;
            });

            // Return a CompletionList - this allows us to control filtering behavior
            return new vscode.CompletionList(completionItems, false);
        } catch (error) {
            console.error('Error providing completions:', error);
            return null;
        } finally {
            // Clear context after providing completions
            setTimeout(() => this.clearTriggerContext(), 500);
        }
    }
}
