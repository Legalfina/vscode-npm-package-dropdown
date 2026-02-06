import * as vscode from 'vscode';
import * as https from 'https';

export interface PackageInfo {
    latestVersion: string;
    allVersions: string[];
}

export interface DependencyLocation {
    packageName: string;
    currentVersion: string;
    line: number;
    versionStartChar: number;
    versionLength: number;
}

export enum VersionChangeType {
    None = 'none',
    Patch = 'patch',
    Minor = 'minor',
    Major = 'major'
}

// Store clickable zones for single-click detection
export interface ClickableZone {
    line: number;
    startChar: number;
    endChar: number;
    packageName: string;
    currentVersion: string;
    versionStartChar: number;
    versionLength: number;
    latestVersion: string;
}

export class PackageJsonProvider implements vscode.DocumentLinkProvider {
    private cache: Map<string, PackageInfo> = new Map();
    private pendingRequests: Map<string, Promise<PackageInfo | null>> = new Map();
    private clickableZones: ClickableZone[] = [];

    constructor() {}

    getClickableZones(): ClickableZone[] {
        return this.clickableZones;
    }

    setClickableZones(zones: ClickableZone[]): void {
        this.clickableZones = zones;
    }

    provideDocumentLinks(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentLink[]> {
        return [];
    }

    parseDependencies(document: vscode.TextDocument): DependencyLocation[] {
        const text = document.getText();
        const dependencies: DependencyLocation[] = [];

        try {
            // Find dependencies and devDependencies sections
            const depSections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
            
            for (const section of depSections) {
                const sectionRegex = new RegExp(`"${section}"\\s*:\\s*\\{([^}]*)\\}`, 'g');
                let sectionMatch;

                while ((sectionMatch = sectionRegex.exec(text)) !== null) {
                    const sectionContent = sectionMatch[1];
                    const sectionStartIndex = sectionMatch.index + sectionMatch[0].indexOf('{') + 1;

                    // Match each package in the section
                    const packageRegex = /"([^"]+)"\s*:\s*"([^"]+)"/g;
                    let packageMatch;

                    while ((packageMatch = packageRegex.exec(sectionContent)) !== null) {
                        const packageName = packageMatch[1];
                        const version = packageMatch[2];
                        
                        // Skip packages that start with file:, link:, git:, etc.
                        if (/^(file:|link:|git:|git\+|github:|http:|https:)/.test(version)) {
                            continue;
                        }

                        // Calculate the position in the document
                        const absoluteIndex = sectionStartIndex + packageMatch.index;
                        const position = document.positionAt(absoluteIndex);
                        
                        // Find the version string position
                        const lineText = document.lineAt(position.line).text;
                        const versionMatch = lineText.match(new RegExp(`"${this.escapeRegex(packageName)}"\\s*:\\s*"([^"]+)"`));
                        
                        if (versionMatch) {
                            const versionStartInLine = lineText.indexOf(`"${version}"`);
                            if (versionStartInLine !== -1) {
                                dependencies.push({
                                    packageName,
                                    currentVersion: version,
                                    line: position.line,
                                    versionStartChar: versionStartInLine + 1, // +1 to skip the opening quote
                                    versionLength: version.length
                                });
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error parsing package.json:', e);
        }

        return dependencies;
    }

    private escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    async getPackageInfo(packageName: string): Promise<PackageInfo | null> {
        // Check cache first
        if (this.cache.has(packageName)) {
            return this.cache.get(packageName)!;
        }

        // Check if there's already a pending request for this package
        if (this.pendingRequests.has(packageName)) {
            return this.pendingRequests.get(packageName)!;
        }

        // Create a new request and store the promise
        const requestPromise = this.fetchPackageInfo(packageName);
        this.pendingRequests.set(packageName, requestPromise);

        try {
            const result = await requestPromise;
            return result;
        } finally {
            this.pendingRequests.delete(packageName);
        }
    }

    private async fetchPackageInfo(packageName: string): Promise<PackageInfo | null> {
        try {
            const data = await this.fetchFromNpm(packageName);
            
            if (!data || !data['dist-tags'] || !data['dist-tags'].latest) {
                return null;
            }

            const latestVersion = data['dist-tags'].latest;
            const allVersions = Object.keys(data.versions || {}).reverse();

            const info: PackageInfo = {
                latestVersion,
                allVersions
            };

            this.cache.set(packageName, info);
            return info;
        } catch (e) {
            console.error(`Error fetching info for ${packageName}:`, e);
            return null;
        }
    }

    // Prefetch all packages in parallel for faster loading
    async prefetchPackages(packageNames: string[]): Promise<void> {
        const uncachedPackages = packageNames.filter(name => !this.cache.has(name));
        await Promise.all(uncachedPackages.map(name => this.getPackageInfo(name)));
    }

    private fetchFromNpm(packageName: string): Promise<any> {
        return new Promise((resolve, reject) => {
            // Handle scoped packages
            const encodedName = packageName.startsWith('@') 
                ? `@${encodeURIComponent(packageName.slice(1))}` 
                : encodeURIComponent(packageName);
            
            // Use abbreviated metadata endpoint for faster response
            const url = `https://registry.npmjs.org/${encodedName}`;
            
            const request = https.get(url, { 
                headers: { 
                    // Request abbreviated metadata - much smaller payload
                    'Accept': 'application/vnd.npm.install-v1+json',
                    'User-Agent': 'vscode-npm-version-lens'
                },
                timeout: 5000 // 5 second timeout
            }, (res) => {
                if (res.statusCode === 404) {
                    resolve(null);
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            request.on('error', reject);
            request.on('timeout', () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    async getAllVersions(packageName: string): Promise<string[]> {
        const info = await this.getPackageInfo(packageName);
        return info?.allVersions || [];
    }

    getVersionChangeType(current: string, latest: string): VersionChangeType {
        const currentParts = this.parseVersion(current);
        const latestParts = this.parseVersion(latest);

        if (!currentParts || !latestParts) {
            return VersionChangeType.None;
        }

        // Check if versions are the same
        if (currentParts.major === latestParts.major &&
            currentParts.minor === latestParts.minor &&
            currentParts.patch === latestParts.patch) {
            return VersionChangeType.None;
        }

        // Check for major version change
        if (latestParts.major > currentParts.major) {
            return VersionChangeType.Major;
        }

        // Check for minor version change
        if (latestParts.major === currentParts.major && latestParts.minor > currentParts.minor) {
            return VersionChangeType.Minor;
        }

        // Check for patch version change
        if (latestParts.major === currentParts.major && 
            latestParts.minor === currentParts.minor && 
            latestParts.patch > currentParts.patch) {
            return VersionChangeType.Patch;
        }

        return VersionChangeType.None;
    }

    private parseVersion(version: string): { major: number; minor: number; patch: number } | null {
        const cleanVersion = version.replace(/[\^~>=<]/g, '');
        const match = cleanVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
        
        if (!match) {
            return null;
        }

        return {
            major: parseInt(match[1], 10),
            minor: parseInt(match[2], 10),
            patch: parseInt(match[3], 10)
        };
    }

    clearCache(): void {
        this.cache.clear();
    }

    dispose(): void {}
}
