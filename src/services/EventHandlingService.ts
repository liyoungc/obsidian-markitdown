import { App, Notice } from 'obsidian';
import { MarkitdownSettings } from '../settings';
import { FileConversionService } from './FileConversionService';
import { FileSystemService } from './FileSystemService';
import * as path from 'path';
import * as fs from 'fs';
import { FileSystemAdapter } from 'obsidian';

export type FileEventType = 'add' | 'change' | 'unlink';

export interface FileEvent {
    type: FileEventType;
    filePath: string;
    monitoredFolderPath: string;
    folderAlias: string;
}

export class EventHandlingService {
    private app: App;
    private settings: MarkitdownSettings;
    private fileConversionService: FileConversionService;
    private fileSystemService: FileSystemService;

    constructor(
        app: App,
        settings: MarkitdownSettings,
        fileConversionService: FileConversionService,
        fileSystemService: FileSystemService
    ) {
        this.app = app;
        this.settings = settings;
        this.fileConversionService = fileConversionService;
        this.fileSystemService = fileSystemService;
    }

    async handleFileEvent(event: FileEvent): Promise<void> {
        try {
            if (!event || !event.filePath || !event.monitoredFolderPath) {
                throw new Error('Invalid file event: missing required properties');
            }

            const ext = path.extname(event.filePath).toLowerCase();
            
            if (!this.settings.monitoredFileTypes[ext]) {
                console.log(`Skipping file: ${event.filePath} (type ${ext} not enabled for monitoring)`);
                return;
            }

            switch (event.type) {
                case 'add':
                case 'change':
                    await this.handleFileAddOrChange(event);
                    break;
                case 'unlink':
                    await this.handleFileUnlink(event);
                    break;
                default:
                    console.warn(`Unknown event type: ${event.type}`);
            }
        } catch (error) {
            console.error(`Error handling file event: ${event.filePath}`, error);
            new Notice(`Error handling file event: ${error.message}`);
        }
    }

    private async handleFileAddOrChange(event: FileEvent): Promise<void> {
        try {
            const { filePath, monitoredFolderPath, folderAlias } = event;
            
            if (!fs.existsSync(filePath)) {
                console.warn(`File no longer exists: ${filePath}`);
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            if (!this.settings.monitoredFileTypes[ext]) {
                return;
            }

            const outputRoot = folderAlias || path.basename(monitoredFolderPath);
            const relativeDir = path.relative(monitoredFolderPath, path.dirname(filePath));
            const outputDir = path.join(this.settings.externalSourceOutputFolder, outputRoot, relativeDir);
            
            await this.fileConversionService.ensureDirectoryExists(outputDir);
            
            const hash = await this.fileSystemService.computeFileHash(filePath);
            const baseName = path.basename(filePath, path.extname(filePath));
            const outputPath = path.join(outputDir, `${baseName}_${hash}.md`);

            // Check if this file already exists in the vault
            const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter 
                ? this.app.vault.adapter.getBasePath() 
                : '';
            
            if (!vaultBasePath) {
                throw new Error('Could not determine vault base path');
            }

            // Search for existing file with same hash
            const outputRootDir = path.join(vaultBasePath, this.settings.externalSourceOutputFolder);
            const findFileRecursively = async (dir: string): Promise<string | null> => {
                if (!fs.existsSync(dir)) return null;
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const entryPath = path.join(dir, entry.name);
                    if (entry.isDirectory() && entry.name !== '.archive') {
                        const result = await findFileRecursively(entryPath);
                        if (result) return result;
                    } else if (entry.isFile() && entry.name.endsWith(`_${hash}.md`)) {
                        return entryPath;
                    }
                }
                return null;
            };

            const existingFile = await findFileRecursively(outputRootDir);
            const fullOutputPath = path.join(vaultBasePath, outputPath);

            if (existingFile && existingFile !== fullOutputPath) {
                // File exists but in a different location - move it
                try {
                    await fs.promises.mkdir(path.dirname(fullOutputPath), { recursive: true });
                    await fs.promises.rename(existingFile, fullOutputPath);
                    console.log(`Moved existing file: ${existingFile} -> ${fullOutputPath}`);
                    new Notice(`Markitdown: Moved ${path.basename(filePath)} to new location`);
                    return;
                } catch (error) {
                    console.error(`Failed to move existing file: ${existingFile} -> ${fullOutputPath}`, error);
                    // Continue with conversion if move fails
                }
            } else if (fs.existsSync(fullOutputPath)) {
                // File exists in the correct location - no action needed
                console.log(`File already exists in correct location: ${fullOutputPath}`);
                return;
            }

            // Convert the file if it doesn't exist
            try {
                await this.fileConversionService.convertFile(filePath, outputPath);
                new Notice(`Successfully converted: ${path.basename(filePath)}`);
            } catch (error) {
                await this.fileConversionService.createErrorPlaceholder(outputPath, error);
                throw error;
            }
        } catch (error) {
            console.error(`Error handling file add/change: ${event.filePath}`, error);
            throw error;
        }
    }

    private async handleFileUnlink(event: FileEvent): Promise<void> {
        try {
            const { filePath, monitoredFolderPath, folderAlias } = event;
            const ext = path.extname(filePath).toLowerCase();
            
            if (!this.settings.monitoredFileTypes[ext]) {
                return;
            }

            const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter 
                ? this.app.vault.adapter.getBasePath() 
                : '';
            
            if (!vaultBasePath) {
                throw new Error('Could not determine vault base path');
            }

            const outputRoot = folderAlias || path.basename(monitoredFolderPath);
            const baseName = path.basename(filePath, ext);
            const outputRootDir = path.join(vaultBasePath, this.settings.externalSourceOutputFolder);

            // Search recursively for matching files
            const findMatchingFiles = async (dir: string): Promise<string[]> => {
                if (!fs.existsSync(dir)) return [];
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                const matches: string[] = [];
                
                for (const entry of entries) {
                    const entryPath = path.join(dir, entry.name);
                    if (entry.isDirectory() && entry.name !== '.archive') {
                        matches.push(...await findMatchingFiles(entryPath));
                    } else if (entry.isFile() && entry.name.startsWith(`${baseName}_`) && entry.name.endsWith('.md')) {
                        matches.push(entryPath);
                    }
                }
                return matches;
            };

            const matchingFiles = await findMatchingFiles(outputRootDir);

            if (matchingFiles.length === 0) {
                console.log(`No matching markdown files found for deleted file: ${filePath}`);
                return;
            }

            // Handle each matching file
            for (const fullOutputPath of matchingFiles) {
                const outputPath = path.relative(path.join(vaultBasePath, this.settings.externalSourceOutputFolder), fullOutputPath);

                // Check if this file exists in the new location
                const newOutputRoot = folderAlias || path.basename(monitoredFolderPath);
                const relativeDir = path.relative(monitoredFolderPath, path.dirname(filePath));
                const newOutputDir = path.join(this.settings.externalSourceOutputFolder, newOutputRoot, relativeDir);
                const newFullOutputPath = path.join(vaultBasePath, newOutputDir, path.basename(fullOutputPath));

                if (fs.existsSync(newFullOutputPath)) {
                    console.log(`File exists in new location, skipping archive: ${newFullOutputPath}`);
                    continue;
                }

                if (this.settings.archiveOldConvertedFiles) {
                    const archiveDir = path.join(vaultBasePath, this.settings.externalSourceOutputFolder, '.archive');
                    await this.fileSystemService.ensureDirectoryExists(archiveDir);
                    
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const archivePath = path.join(archiveDir, `${path.basename(outputPath)}_deleted_${timestamp}.md`);
                    
                    try {
                        await fs.promises.rename(fullOutputPath, archivePath);
                        console.log(`Archived deleted file: ${path.basename(outputPath)} to ${archivePath}`);
                    } catch (error) {
                        console.error(`Failed to archive file ${outputPath}:`, error);
                    }
                } else {
                    try {
                        await this.fileSystemService.deleteFile(outputPath);
                        console.log(`Deleted file: ${outputPath}`);
                    } catch (error) {
                        console.error(`Failed to delete file ${outputPath}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error(`Error handling file unlink: ${event.filePath}`, error);
            throw error;
        }
    }
} 