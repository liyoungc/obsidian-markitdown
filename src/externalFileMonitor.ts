import * as chokidar from 'chokidar';
import * as path from 'path';
import { Notice } from 'obsidian';
import MarkitdownPlugin from './main';
import { FileEvent } from './services/EventHandlingService';
import * as fs from 'fs';
import { FileSystemAdapter } from 'obsidian';

export class ExternalFileMonitor {
    private watcher: chokidar.FSWatcher | null = null;
    private plugin: MarkitdownPlugin;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private static CLEANUP_TIMEOUT_MS = 15000; // 15 seconds

    constructor(plugin: MarkitdownPlugin) {
        this.plugin = plugin;
    }

    public start() {
        if (this.watcher) {
            console.log("MonitorService: Stopping existing watcher.");
            this.watcher.close();
            this.watcher = null;
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.cleanupInterval = setInterval(() => this.cleanupOldEntries(), 10000);

        const foldersToWatch = this.plugin.settings.externalMonitoredFolders
            .filter(folder => folder.enabled && folder.path && folder.path.trim() !== "")
            .map(folder => folder.path);

        if (foldersToWatch.length > 0) {
            console.log("MonitorService: Starting chokidar for paths:", foldersToWatch);
            this.watcher = chokidar.watch(foldersToWatch, {
                ignored: /(^|[\/\\])\../,
                persistent: true,
                ignoreInitial: true,
                depth: Infinity
            });

            this.watcher
                .on('add', async (filePath: string) => {
                    const monitoredFolder = this.findMonitoredFolder(filePath);
                    if (monitoredFolder) {
                        console.log(`MonitorService: 'add' event for: ${filePath} (base: ${monitoredFolder.path})`);
                        await this.plugin.eventHandlingService.handleFileEvent({
                            type: 'add',
                            filePath,
                            monitoredFolderPath: monitoredFolder.path,
                            folderAlias: monitoredFolder.alias
                        });
                    } else {
                        console.warn(`MonitorService: Could not determine base for added file: ${filePath}`);
                    }
                })
                .on('change', async (filePath: string) => {
                    const monitoredFolder = this.findMonitoredFolder(filePath);
                    if (monitoredFolder) {
                        console.log(`MonitorService: 'change' event for: ${filePath} (base: ${monitoredFolder.path})`);
                        await this.plugin.eventHandlingService.handleFileEvent({
                            type: 'change',
                            filePath,
                            monitoredFolderPath: monitoredFolder.path,
                            folderAlias: monitoredFolder.alias
                        });
                    } else {
                        console.warn(`MonitorService: Could not determine base for changed file: ${filePath}`);
                    }
                })
                .on('unlink', async (filePath: string) => {
                    const monitoredFolder = this.findMonitoredFolder(filePath);
                    if (monitoredFolder) {
                        console.log(`MonitorService: 'unlink' event for: ${filePath} (base: ${monitoredFolder.path})`);
                        await this.plugin.eventHandlingService.handleFileEvent({
                            type: 'unlink',
                            filePath,
                            monitoredFolderPath: monitoredFolder.path,
                            folderAlias: monitoredFolder.alias
                        });
                    } else {
                        console.warn(`MonitorService: Could not determine base for unlinked file: ${filePath}`);
                    }
                })
                .on('unlinkDir', async (dirPath: string) => {
                    const monitoredFolder = this.findMonitoredFolder(dirPath);
                    if (monitoredFolder) {
                        try {
                            const outputRoot = monitoredFolder.alias || path.basename(monitoredFolder.path);
                            const relativeDir = path.relative(monitoredFolder.path, dirPath);
                            const vaultDirToDelete = path.join(
                                this.plugin.settings.externalSourceOutputFolder,
                                outputRoot,
                                relativeDir
                            );
                            
                            const vaultBasePath = this.plugin.app.vault.adapter instanceof FileSystemAdapter 
                                ? this.plugin.app.vault.adapter.getBasePath() 
                                : '';
                            
                            if (!vaultBasePath) {
                                throw new Error('Could not determine vault base path');
                            }

                            const fullVaultDirPath = path.join(vaultBasePath, vaultDirToDelete);
                            
                            if (fs.existsSync(fullVaultDirPath)) {
                                await this.plugin.fileSystemService.deleteDirectory(vaultDirToDelete);
                                console.log(`Deleted vault folder: ${vaultDirToDelete}`);
                                new Notice(`Markitdown: Deleted vault folder for removed external subfolder.`);
                            }
                        } catch (e) {
                            console.error('Failed to delete vault folder for removed external subfolder:', e);
                            new Notice(`Markitdown: Failed to delete vault folder. See console for details.`);
                        }
                    } else {
                        console.warn(`MonitorService: Could not determine base for unlinked directory: ${dirPath}`);
                    }
                })
                .on('error', (error: Error) => {
                    console.error(`MonitorService: Watcher error for [${foldersToWatch.join(', ')}]:`, error);
                    new Notice(`Markitdown: Error watching folder. See console.`);
                })
                .on('ready', () => {
                    console.log(`MonitorService: Initial scan complete for: ${foldersToWatch.join(', ')}`);
                });

            new Notice(`Markitdown: Started monitoring ${foldersToWatch.length} folder(s).`);
        } else {
            console.log("MonitorService: No valid folders to watch.");
        }
    }

    private findMonitoredFolder(filePath: string): { path: string; alias: string } | null {
        return this.plugin.settings.externalMonitoredFolders.find(folder => {
            if (!folder.enabled) return false;
            // Normalize paths for comparison
            const normalizedFolderPath = path.normalize(folder.path);
            const normalizedFilePath = path.normalize(filePath);
            return normalizedFilePath.startsWith(normalizedFolderPath + path.sep) || 
                   normalizedFilePath.startsWith(normalizedFolderPath + '/');
        }) || null;
    }

    private cleanupOldEntries() {
        // This method is now handled by the EventHandlingService
    }

    public stop() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    public async rescan() {
        console.log("MonitorService: Starting rescan of monitored folders");
        
        const foldersToWatch = this.plugin.settings.externalMonitoredFolders
            .filter(folder => folder.enabled && folder.path && folder.path.trim() !== "");

        for (const folder of foldersToWatch) {
            try {
                const outputRoot = folder.alias || path.basename(folder.path);
                const vaultBasePath = this.plugin.app.vault.adapter instanceof FileSystemAdapter 
                    ? this.plugin.app.vault.adapter.getBasePath() 
                    : '';
                
                if (!vaultBasePath) {
                    throw new Error('Could not determine vault base path');
                }

                const vaultOutputDir = path.join(vaultBasePath, this.plugin.settings.externalSourceOutputFolder, outputRoot);
                
                // If external folder doesn't exist, delete corresponding vault folder
                if (!fs.existsSync(folder.path)) {
                    if (fs.existsSync(vaultOutputDir)) {
                        await this.plugin.fileSystemService.deleteDirectory(path.join(this.plugin.settings.externalSourceOutputFolder, outputRoot));
                        console.log(`Deleted vault folder for non-existent external folder: ${outputRoot}`);
                        new Notice(`Markitdown: Deleted vault folder for non-existent external folder.`);
                    }
                    continue;
                }

                // Recursively check and sync folder structure
                const syncFolderStructure = async (externalPath: string, vaultPath: string) => {
                    if (!fs.existsSync(externalPath)) {
                        if (fs.existsSync(vaultPath)) {
                            await this.plugin.fileSystemService.deleteDirectory(path.relative(vaultBasePath, vaultPath));
                            console.log(`Deleted vault folder for removed external subfolder: ${path.relative(folder.path, externalPath)}`);
                        }
                        return;
                    }

                    const externalEntries = await fs.promises.readdir(externalPath, { withFileTypes: true });
                    const vaultEntries = fs.existsSync(vaultPath) 
                        ? await fs.promises.readdir(vaultPath, { withFileTypes: true })
                        : [];

                    // Delete vault folders that don't exist in external
                    for (const vaultEntry of vaultEntries) {
                        if (vaultEntry.isDirectory() && vaultEntry.name !== '.archive') {
                            const externalSubPath = path.join(externalPath, vaultEntry.name);
                            if (!fs.existsSync(externalSubPath)) {
                                const vaultSubPath = path.join(vaultPath, vaultEntry.name);
                                await this.plugin.fileSystemService.deleteDirectory(path.relative(vaultBasePath, vaultSubPath));
                                console.log(`Deleted vault subfolder for removed external subfolder: ${path.relative(folder.path, externalSubPath)}`);
                            }
                        }
                    }

                    // Check for files that exist in vault but not in external
                    for (const vaultEntry of vaultEntries) {
                        if (vaultEntry.isFile() && vaultEntry.name.endsWith('.md')) {
                            const vaultFilePath = path.join(vaultPath, vaultEntry.name);
                            const baseName = vaultEntry.name.split('_')[0]; // Get the original file name before the hash
                            
                            // Check if any external file matches this base name
                            const hasMatchingExternalFile = externalEntries.some(entry => {
                                if (!entry.isFile()) return false;
                                const ext = path.extname(entry.name).toLowerCase();
                                return this.plugin.settings.monitoredFileTypes[ext] && 
                                       path.basename(entry.name, ext) === baseName;
                            });

                            if (!hasMatchingExternalFile) {
                                // File doesn't exist in external folder anymore
                                if (this.plugin.settings.archiveOldConvertedFiles) {
                                    const archiveDir = path.join(vaultBasePath, this.plugin.settings.externalSourceOutputFolder, '.archive');
                                    await this.plugin.fileSystemService.ensureDirectoryExists(archiveDir);
                                    
                                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                                    const archivePath = path.join(archiveDir, `${vaultEntry.name}_deleted_${timestamp}.md`);
                                    
                                    try {
                                        await fs.promises.rename(vaultFilePath, archivePath);
                                        console.log(`Archived deleted file: ${vaultEntry.name} to ${archivePath}`);
                                    } catch (error) {
                                        console.error(`Failed to archive file ${vaultEntry.name}:`, error);
                                    }
                                } else {
                                    try {
                                        await this.plugin.fileSystemService.deleteFile(path.relative(vaultBasePath, vaultFilePath));
                                        console.log(`Deleted file: ${vaultEntry.name}`);
                                    } catch (error) {
                                        console.error(`Failed to delete file ${vaultEntry.name}:`, error);
                                    }
                                }
                            }
                        }
                    }

                    // Recursively check subfolders
                    for (const entry of externalEntries) {
                        if (entry.isDirectory()) {
                            const externalSubPath = path.join(externalPath, entry.name);
                            const vaultSubPath = path.join(vaultPath, entry.name);
                            await syncFolderStructure(externalSubPath, vaultSubPath);
                        }
                    }
                };

                await syncFolderStructure(folder.path, vaultOutputDir);
            } catch (error) {
                console.error(`Error during rescan of folder ${folder.path}:`, error);
                new Notice(`Markitdown: Error during rescan. See console for details.`);
            }
        }

        console.log("MonitorService: Rescan complete");
        new Notice(`Markitdown: Rescan complete.`);
    }
} 