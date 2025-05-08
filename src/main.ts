import {
    App,
    Notice,
    Plugin,
    TFile,
    FileSystemAdapter
} from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import * as chokidar from 'chokidar';
import { MarkitdownSettings, DEFAULT_SETTINGS, MonitoredFolder } from './settings';
import { MarkitdownSettingTab } from './settingTab';
import { MarkitdownFileModal } from './fileModal';
import { MarkitdownFolderModal } from './folderModal';
import { MarkitdownSetupModal } from './setupModal';
import { ExternalFileMonitor } from './externalFileMonitor';
import * as crypto from 'crypto';
import { FileConversionService } from './services/FileConversionService';
import { FileSystemService } from './services/FileSystemService';
import { EventHandlingService } from './services/EventHandlingService';
import { LoggingService } from './services/LoggingService';

// Add type for the app with setting property.
export interface AppWithSetting extends App {
    setting: {
        open: () => void;
        openTabById: (id: string) => void;
    }
}

export default class MarkitdownPlugin extends Plugin {
    settings: MarkitdownSettings;
    pythonInstalled = false;
    markitdownInstalled = false;
    private externalFileMonitorService: ExternalFileMonitor;
    public fileConversionService: FileConversionService;
    public fileSystemService: FileSystemService;
    public eventHandlingService: EventHandlingService;
    public recentlyMoved: Map<string, { dest: string; timestamp: number }> = new Map();
    private recentlyMovedCleanupInterval: NodeJS.Timeout | null = null;
    public loggingService: LoggingService;

    async onload() {
        await this.loadSettings();

        // Initialize logging service
        this.loggingService = new LoggingService(
            this.app,
            this.settings.logging.logFile,
            this.settings.logging.maxLogSize,
            this.settings.logging.maxLogFiles
        );

        // Initialize services first
        this.fileSystemService = new FileSystemService(this.app);
        this.fileConversionService = new FileConversionService(this.app, this.settings);
        this.eventHandlingService = new EventHandlingService(
            this.app,
            this.settings,
            this.fileConversionService,
            this.fileSystemService
        );
        this.externalFileMonitorService = new ExternalFileMonitor(this);

        // Then check dependencies
        await this.checkDependencies();

        this.addRibbonIcon(
            'file-text',
            'Convert to Markdown with Markitdown',
            () => {
                new MarkitdownFileModal(this.app, this).open();
            }
        );

        this.addCommand({
            id: 'convert-file-markitdown',
            name: 'Convert file to Markdown with Markitdown',
            callback: () => {
                if (!this.markitdownInstalled) {
                    new MarkitdownSetupModal(this.app, this).open();
                    return;
                }
                new MarkitdownFileModal(this.app, this).open();
            }
        });

        this.addCommand({
            id: 'convert-folder-markitdown',
            name: 'Convert folder contents to Markdown with Markitdown',
            callback: () => {
                if (!this.markitdownInstalled) {
                    new MarkitdownSetupModal(this.app, this).open();
                    return;
                }
                new MarkitdownFolderModal(this.app, this).open();
            }
        });

        this.addCommand({
            id: 'markitdown-rescan-external-folders',
            name: 'Rescan external monitored folders now',
            callback: () => {
                this.scanMonitoredFoldersOnce();
            }
        });

        this.addSettingTab(new MarkitdownSettingTab(this.app, this));

        console.log('External Monitored Folders from settings:', this.settings.externalMonitoredFolders);
        console.log('External Source Output Folder from settings:', this.settings.externalSourceOutputFolder);

        this.startExternalFolderMonitoring();

        // Start cleanup interval for recentlyMoved
        if (this.recentlyMovedCleanupInterval) clearInterval(this.recentlyMovedCleanupInterval);
        this.recentlyMovedCleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [hash, { timestamp }] of this.recentlyMoved.entries()) {
                if (now - timestamp > 15000) this.recentlyMoved.delete(hash);
            }
        }, 10000);

        // Start monitoring if enabled
        if (this.settings.monitoringEnabled) {
            this.externalFileMonitorService.start();
            this.loggingService.info('Started monitoring external folders');
        }

        // Add commands
        this.addCommand({
            id: 'scan-monitored-folders',
            name: 'Rescan external monitored folders now',
            callback: () => {
                this.loggingService.info('Manual rescan triggered');
                this.scanMonitoredFoldersOnce();
            }
        });
    }

    async checkDependencies() {
        try {
            await this.fileConversionService.execCommand(`${this.settings.pythonPath} --version`);
            this.pythonInstalled = true;
            try {
                await this.fileConversionService.execCommand(`${this.settings.pythonPath} -m pip show markitdown`);
                this.markitdownInstalled = true;
            } catch (error) {
                this.markitdownInstalled = false;
            }
        } catch (error) {
            this.pythonInstalled = false;
            this.markitdownInstalled = false;
            console.error("Failed to check Python installation", error);
        }
    }

    async installMarkitdown(): Promise<boolean> {
        try {
            await this.fileConversionService.execCommand(`${this.settings.pythonPath} -m pip install 'markitdown[all]'`);
            this.markitdownInstalled = true;
            return true;
        } catch (error) {
            console.error("Failed to install Markitdown", error);
            return false;
        }
    }

    async scanMonitoredFoldersOnce(): Promise<void> {
        const foldersToScan = this.settings.externalMonitoredFolders
            .filter(folder => folder.enabled && folder.path && folder.path.trim() !== "")
            .map(folder => folder.path);

        if (!foldersToScan || foldersToScan.length === 0) {
            new Notice("Markitdown: No external folders configured to scan.");
            return;
        }

        if (!this.settings.externalSourceOutputFolder || this.settings.externalSourceOutputFolder.trim() === "") {
            new Notice("Markitdown: Vault output folder for external sources is not configured.");
            return;
        }

        new Notice(`Markitdown: Starting scan of ${foldersToScan.length} folder(s)...`);
        this.loggingService.info('Starting rescan of monitored folders');

        try {
            // First rescan to sync folder structure
            await this.externalFileMonitorService.rescan();

            // Then scan for files
            for (const folderPath of foldersToScan) {
                const monitoredFolder = this.settings.externalMonitoredFolders.find(f => f.path === folderPath);
                if (!monitoredFolder) continue;

                try {
                    const scanDirectory = async (dirPath: string) => {
                        if (!fs.existsSync(dirPath)) {
                            console.warn(`Directory does not exist: ${dirPath}`);
                            return;
                        }

                        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
                        for (const entry of entries) {
                            const fullPath = path.join(dirPath, entry.name);
                            if (entry.isDirectory()) {
                                await scanDirectory(fullPath);
                            } else {
                                const ext = path.extname(entry.name).toLowerCase();
                                if (this.settings.monitoredFileTypes[ext]) {
                                    await this.eventHandlingService.handleFileEvent({
                                        type: 'add',
                                        filePath: fullPath,
                                        monitoredFolderPath: folderPath,
                                        folderAlias: monitoredFolder.alias
                                    });
                                }
                            }
                        }
                    };

                    await scanDirectory(folderPath);
                } catch (error) {
                    console.error(`Error scanning folder ${folderPath}:`, error);
                    this.loggingService.error(`Error scanning folder ${folderPath}: ${error.message}`);
                }
            }

            new Notice(`Markitdown: Scan complete.`);
            this.loggingService.info('Rescan complete');
        } catch (error) {
            console.error('Error during rescan:', error);
            this.loggingService.error(`Error during rescan: ${error.message}`);
            new Notice(`Markitdown: Error during scan. See console for details.`);
        }
    }

    async convertFile(filePath: string, outputPath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const command = `markitdown "${filePath}" > "${outputPath}"`;
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    const moduleCommand = `${this.settings.pythonPath} -c "from markitdown import convert; convert('${filePath}', output_file='${outputPath}')"`;
                    exec(moduleCommand, (moduleError, moduleStdout, moduleStderr) => {
                        if (moduleError) {
                            const basicCommand = `${this.settings.pythonPath} -m markitdown "${filePath}" > "${outputPath}"`;
                            exec(basicCommand, (basicError, basicStdout, basicStderr) => {
                                if (basicError) {
                                    reject(new Error(`Markitdown failed to convert the file: ${basicError.message}\n${basicStderr}`));
                                    return;
                                }
                                resolve(basicStdout);
                            });
                            return;
                        }
                        resolve(moduleStdout);
                    });
                    return;
                }
                resolve(stdout);
            });
        });
    }

    startExternalFolderMonitoring() {
        if (this.settings.monitoringEnabled) {
            this.externalFileMonitorService.start();
        }
    }

    stopExternalFolderMonitoring() {
        this.externalFileMonitorService.stop();
    }

    // Utility: Compute SHA-256 hash of a file
    async computeFileHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', err => reject(err));
        });
    }

    async handleExternalFileEvent(
        sourceFilePath: string,
        monitoredFolderBasePath: string,
        folderAlias: string,
        eventType: 'add' | 'change' | 'unlink'
    ): Promise<void> {
        console.log(`Handling event '${eventType}' for source file: ${sourceFilePath} (base: ${monitoredFolderBasePath})`);

        const sourceFileExtension = path.extname(sourceFilePath).toLowerCase();

        if (!this.settings.monitoredFileTypes || this.settings.monitoredFileTypes[sourceFileExtension] !== true) {
            console.log(`Skipping file: ${sourceFilePath} (type ${sourceFileExtension} not enabled for monitoring).`);
            return;
        }

        const vaultOutputFolderName = this.settings.externalSourceOutputFolder;
        if (!vaultOutputFolderName || vaultOutputFolderName.trim() === "") {
            console.warn("Vault output folder for external sources is not configured.");
            new Notice("Markitdown: Please configure the 'External source output folder' in settings.");
            return;
        }

        let vaultBasePath = "";
        if (this.app.vault.adapter instanceof FileSystemAdapter) {
            vaultBasePath = this.app.vault.adapter.getBasePath();
        }
        if (!vaultBasePath) {
            console.error("Could not determine vault base path.");
            new Notice("Markitdown: Could not determine vault path.");
            return;
        }

        // Get the parent folder name from the source file path
        const parentFolderName = path.basename(path.dirname(sourceFilePath));
        const sourceFileNameWithoutExt = path.basename(sourceFilePath, sourceFileExtension);
        
        // Create a sanitized parent folder name for use in the output path
        const sanitizedParentFolderName = parentFolderName.replace(/[^a-zA-Z0-9-_]/g, '_');
        
        // Use the folder alias if provided, otherwise use the sanitized parent folder name
        const outputRoot = folderAlias || path.basename(monitoredFolderBasePath).replace(/[^a-zA-Z0-9-_]/g, '_');
        // Set relativeDir to the path from the monitored root to the file's parent directory
        const relativeDir = path.relative(monitoredFolderBasePath, path.dirname(sourceFilePath));
        // Join as: vaultBasePath / vaultOutputFolderName / outputRoot / relativeDir
        const fullVaultOutputSubdirectory = path.join(vaultBasePath, vaultOutputFolderName, outputRoot, relativeDir);
        const archiveDir = path.join(vaultBasePath, vaultOutputFolderName, '.archive', outputRoot, relativeDir);

        // Handle file deletion
        if (eventType === 'unlink') {
            try {
                // Only proceed if the output directory exists
                if (fs.existsSync(fullVaultOutputSubdirectory)) {
                    // Find all markdown files in the output directory that match the source filename pattern
                    const files = await fs.promises.readdir(fullVaultOutputSubdirectory);
                    const matchingFiles = files.filter(file => 
                        file.startsWith(`${sourceFileNameWithoutExt}_`) && file.endsWith('.md')
                    );

                    if (matchingFiles.length > 0) {
                        // Check if any of the matching files were recently moved
                        const wasRecentlyMoved = Array.from(this.recentlyMoved.values()).some(
                            ({ dest }) => matchingFiles.some(file => 
                                path.join(fullVaultOutputSubdirectory, file) === dest
                            )
                        );

                        if (wasRecentlyMoved) {
                            console.log(`File ${sourceFilePath} was recently moved, skipping archive`);
                            return;
                        }

                        // Create archive directory if it doesn't exist
                        await fs.promises.mkdir(archiveDir, { recursive: true });

                        // Move each matching file to the archive
                        for (const file of matchingFiles) {
                            const sourcePath = path.join(fullVaultOutputSubdirectory, file);
                            const archivePath = path.join(archiveDir, `${file}_deleted_${Date.now()}.md`);
                            
                            try {
                                // Add deletion metadata to the file before archiving
                                const content = await fs.promises.readFile(sourcePath, 'utf-8');
                                const deletionMetadata = `\n\n## Deletion Information\n- Deleted on: ${new Date().toLocaleString()}\n- Original Source: ${sourceFilePath}\n- Archive Location: ${archivePath}`;
                                await fs.promises.writeFile(sourcePath, content + deletionMetadata);
                                await fs.promises.rename(sourcePath, archivePath);
                                console.log(`Archived deleted file: ${file} to ${archivePath}`);
                            } catch (fileError) {
                                console.error(`Error archiving file ${file}:`, fileError);
                                // Try to move the file without modifying it if we can't read/write
                                try {
                                    await fs.promises.rename(sourcePath, archivePath);
                                    console.log(`Moved file to archive without modification: ${file}`);
                                } catch (moveError) {
                                    console.error(`Failed to move file to archive: ${file}`, moveError);
                                }
                            }
                        }
                        new Notice(`Markitdown: Archived ${matchingFiles.length} file(s) from ${sourceFileNameWithoutExt} (source deleted).`);
                    } else {
                        console.log(`No matching markdown files found for deleted source: ${sourceFilePath}`);
                    }
                } else {
                    console.log(`Output directory does not exist for deleted source: ${sourceFilePath}`);
                }
            } catch (error) {
                console.error(`Error handling file deletion for ${sourceFilePath}:`, error);
                new Notice(`Markitdown: Error archiving deleted file ${sourceFileNameWithoutExt}.`);
            }
            return;
        }

        // For add/change events, ensure the source file exists
        if (!fs.existsSync(sourceFilePath)) {
            console.log(`Source file no longer exists: ${sourceFilePath}`);
            return;
        }

        // --- HASH-BASED DEDUPLICATION LOGIC ---
        let fileHash = '';
        try {
            fileHash = await this.computeFileHash(sourceFilePath);
        } catch (hashError) {
            console.error(`Failed to compute hash for ${sourceFilePath}:`, hashError);
            new Notice(`Markitdown: Failed to compute hash for ${path.basename(sourceFilePath)}.`);
            return;
        }
        const markdownFileName = `${sourceFileNameWithoutExt}_${fileHash}.md`;
        const markdownFullOutputPath = path.join(fullVaultOutputSubdirectory, markdownFileName);

        // Check if this hash-named file already exists anywhere in the vault output structure
        let foundPath: string | null = null;
        if (vaultBasePath) {
            const outputRootDir = path.join(vaultBasePath, vaultOutputFolderName);
            const findFileRecursively = async (dir: string): Promise<string | null> => {
                if (!fs.existsSync(dir)) return null;
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const entryPath = path.join(dir, entry.name);
                    if (entry.isDirectory() && entry.name !== '.archive') {
                        const result: string | null = await findFileRecursively(entryPath);
                        if (result) return result;
                    } else if (entry.isFile() && entry.name === markdownFileName) {
                        return entryPath;
                    }
                }
                return null;
            };
            foundPath = await findFileRecursively(outputRootDir);
        }
        if (foundPath && foundPath !== markdownFullOutputPath) {
            // Move the found file to the new location
            try {
                await fs.promises.mkdir(fullVaultOutputSubdirectory, { recursive: true });
                await fs.promises.rename(foundPath, markdownFullOutputPath);
                this.recentlyMoved.set(fileHash, { dest: markdownFullOutputPath, timestamp: Date.now() });
                console.log(`[Ultimate Move] Moved existing converted file: ${foundPath} -> ${markdownFullOutputPath}`);
                new Notice(`Markitdown: Moved existing converted file for renamed/moved source.`);
            } catch (e) {
                console.error(`[Ultimate Move] Failed to move existing converted file: ${foundPath} -> ${markdownFullOutputPath}`, e);
            }
            return;
        }
        // If not found, check the archive
        let foundInArchive: string | null = null;
        if (vaultBasePath) {
            const archiveRootDir = path.join(vaultBasePath, vaultOutputFolderName, '.archive');
            const findFileInArchive = async (dir: string): Promise<string | null> => {
                if (!fs.existsSync(dir)) return null;
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const entryPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        const result: string | null = await findFileInArchive(entryPath);
                        if (result) return result;
                    } else if (entry.isFile() && entry.name.startsWith(`${sourceFileNameWithoutExt}_`) && entry.name.endsWith(`${fileHash}.md`)) {
                        return entryPath;
                    }
                }
                return null;
            };
            foundInArchive = await findFileInArchive(archiveRootDir);
        }
        if (foundInArchive) {
            // Move the found archive file to the new location
            try {
                await fs.promises.mkdir(fullVaultOutputSubdirectory, { recursive: true });
                await fs.promises.rename(foundInArchive, markdownFullOutputPath);
                console.log(`[Ultimate Move] Restored file from archive: ${foundInArchive} -> ${markdownFullOutputPath}`);
                new Notice(`Markitdown: Restored converted file from archive for renamed/moved source.`);
            } catch (e) {
                console.error(`[Ultimate Move] Failed to restore file from archive: ${foundInArchive} -> ${markdownFullOutputPath}`, e);
            }
            return;
        }

        // Archive old converted files if setting is enabled
        try {
            if (fs.existsSync(fullVaultOutputSubdirectory)) {
                const files = await fs.promises.readdir(fullVaultOutputSubdirectory);
                const oldFiles = files.filter(file =>
                    file.startsWith(`${sourceFileNameWithoutExt}_`) &&
                    file.endsWith('.md') &&
                    file !== markdownFileName
                );
                if (oldFiles.length > 0 && this.settings.archiveOldConvertedFiles) {
                    await fs.promises.mkdir(archiveDir, { recursive: true });
                    for (const file of oldFiles) {
                        const sourcePath = path.join(fullVaultOutputSubdirectory, file);
                        const archivePath = path.join(archiveDir, `${file}_archived_${Date.now()}.md`);
                        try {
                            const content = await fs.promises.readFile(sourcePath, 'utf-8');
                            const archiveMetadata = `\n\n## Archive Information\n- Archived on: ${new Date().toLocaleString()}\n- Original Source: ${sourceFilePath}\n- Archive Location: ${archivePath}`;
                            await fs.promises.writeFile(sourcePath, content + archiveMetadata);
                            await fs.promises.rename(sourcePath, archivePath);
                            console.log(`Archived old converted file: ${file} to ${archivePath}`);
                        } catch (fileError) {
                            console.error(`Error archiving old file ${file}:`, fileError);
                            try {
                                await fs.promises.rename(sourcePath, archivePath);
                                console.log(`Moved old file to archive without modification: ${file}`);
                            } catch (moveError) {
                                console.error(`Failed to move old file to archive: ${file}`, moveError);
                            }
                        }
                    }
                }
            }
        } catch (archiveError) {
            console.error(`Error archiving old converted files for ${sourceFileNameWithoutExt}:`, archiveError);
        }

        // --- END HASH-BASED DEDUPLICATION LOGIC ---

        try {
            console.log(`Ensuring vault output subdirectory exists: ${fullVaultOutputSubdirectory}`);
            await fs.promises.mkdir(fullVaultOutputSubdirectory, { recursive: true });
        } catch (error) {
            console.error(`Error creating vault output subdirectory ${fullVaultOutputSubdirectory}:`, error);
            new Notice(`Markitdown: Error creating output subdirectory in vault.`);
            return;
        }

        if (eventType === 'add' || eventType === 'change') {
            try {
                // Convert the file using markitdown
                try {
                    await this.convertFile(sourceFilePath, markdownFullOutputPath);
                    // Add metadata to the converted file
                    const content = await fs.promises.readFile(markdownFullOutputPath, 'utf-8');
                    const metadata = `---\n# Converted: ${sourceFileNameWithoutExt}\n\n## File Information\n- Original Name: ${sourceFileNameWithoutExt}\n- File Type: ${sourceFileExtension}\n- Source Location: ${sourceFilePath}\n- Parent Folder: ${parentFolderName}\n- Conversion Hash: ${fileHash}\n- Conversion Timestamp: ${Date.now()}\n- Event Type: ${eventType}\n---\n\n${content}`;
                    await fs.promises.writeFile(markdownFullOutputPath, metadata);
                    if (eventType === 'add') {
                        console.log(`Successfully converted file: ${markdownFullOutputPath}`);
                        new Notice(`Markitdown: Converted ${path.basename(sourceFilePath)} to vault.`);
                    } else {
                        console.log(`Successfully updated converted file: ${markdownFullOutputPath}`);
                        new Notice(`Markitdown: Updated ${path.basename(sourceFilePath)} in vault.`);
                    }
                } catch (conversionError) {
                    console.error(`Error converting file ${sourceFilePath}:`, conversionError);
                    new Notice(`Markitdown: Error converting ${sourceFileNameWithoutExt}. See console for details.`);
                    // Create a placeholder file with error information
                    const errorContent = `# Conversion Error: ${sourceFileNameWithoutExt}\n\n## Error Information\n- Original Name: ${sourceFileNameWithoutExt}\n- File Type: ${sourceFileExtension}\n- Source Location: ${sourceFilePath}\n- Parent Folder: ${parentFolderName}\n- Error Time: ${new Date().toLocaleString()}\n- Error Details: ${conversionError.message}\n\nPlease check the console for more information about the conversion error.`;
                    await fs.promises.writeFile(markdownFullOutputPath, errorContent);
                }
            } catch (error) {
                console.error(`Error processing file ${sourceFilePath}:`, error);
                new Notice(`Markitdown: Error processing ${sourceFileNameWithoutExt}. See console for details.`);
            }
        }
    }

    onunload() {
        console.log("Unloading Markitdown plugin");
        if (this.externalFileMonitorService) {
            this.externalFileMonitorService.stop();
        }
        if (this.recentlyMovedCleanupInterval) clearInterval(this.recentlyMovedCleanupInterval);
        this.recentlyMoved.clear();
        this.loggingService.info('Plugin unloading');
    }

    async loadSettings() {
        const loadedData = await this.loadData();
        
        // Migrate old string-based externalMonitoredFolders to new MonitoredFolder objects
        if (loadedData && Array.isArray(loadedData.externalMonitoredFolders)) {
            loadedData.externalMonitoredFolders = loadedData.externalMonitoredFolders.map((folder: string | MonitoredFolder) => {
                if (typeof folder === 'string') {
                    return {
                        path: folder,
                        alias: '',
                        enabled: true
                    };
                }
                return folder;
            });
        }

        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.loggingService.debug('Settings saved', { settings: this.settings });
    }
} 