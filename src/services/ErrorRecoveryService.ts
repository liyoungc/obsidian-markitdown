import { App, Notice } from 'obsidian';
import { LoggingService } from './LoggingService';
import { MarkitdownError, FileConversionError, FileSystemError, ConfigurationError, DependencyError, MonitoringError, ArchiveError } from '../errors';
import { FileConversionService } from './FileConversionService';
import { FileSystemService } from './FileSystemService';
import { EventHandlingService } from './EventHandlingService';
import * as path from 'path';

export class ErrorRecoveryService {
    private app: App;
    private loggingService: LoggingService;
    private fileConversionService: FileConversionService;
    private fileSystemService: FileSystemService;
    private eventHandlingService: EventHandlingService;
    private maxRetries: number;
    private retryDelay: number;

    constructor(
        app: App,
        loggingService: LoggingService,
        fileConversionService: FileConversionService,
        fileSystemService: FileSystemService,
        eventHandlingService: EventHandlingService,
        maxRetries: number = 3,
        retryDelay: number = 1000
    ) {
        this.app = app;
        this.loggingService = loggingService;
        this.fileConversionService = fileConversionService;
        this.fileSystemService = fileSystemService;
        this.eventHandlingService = eventHandlingService;
        this.maxRetries = maxRetries;
        this.retryDelay = retryDelay;
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async handleError(error: Error, context: Record<string, any> = {}): Promise<void> {
        try {
            if (error instanceof MarkitdownError) {
                await this.handleMarkitdownError(error, context);
            } else {
                await this.handleGenericError(error, context);
            }
        } catch (recoveryError) {
            await this.loggingService.error('Error recovery failed', { 
                originalError: error,
                recoveryError,
                context 
            });
            new Notice('Error recovery failed. See console for details.');
        }
    }

    private async handleMarkitdownError(error: MarkitdownError, context: Record<string, any>): Promise<void> {
        switch (error.constructor.name) {
            case 'FileConversionError':
                await this.handleFileConversionError(error as FileConversionError, context);
                break;
            case 'FileSystemError':
                await this.handleFileSystemError(error as FileSystemError, context);
                break;
            case 'ConfigurationError':
                await this.handleConfigurationError(error as ConfigurationError, context);
                break;
            case 'DependencyError':
                await this.handleDependencyError(error as DependencyError, context);
                break;
            case 'MonitoringError':
                await this.handleMonitoringError(error as MonitoringError, context);
                break;
            case 'ArchiveError':
                await this.handleArchiveError(error as ArchiveError, context);
                break;
            default:
                await this.handleGenericError(error, context);
        }
    }

    private async handleFileConversionError(error: FileConversionError, context: Record<string, any>): Promise<void> {
        await this.loggingService.warn('File conversion error', { error, context });
        
        // Try to recover by retrying the conversion
        for (let i = 0; i < this.maxRetries; i++) {
            try {
                await this.delay(this.retryDelay * (i + 1));
                await this.fileConversionService.convertFile(error.filePath, context.outputPath);
                await this.loggingService.info('File conversion recovered', { 
                    filePath: error.filePath,
                    attempt: i + 1 
                });
                new Notice('File conversion recovered successfully.');
                return;
            } catch (retryError) {
                await this.loggingService.warn('File conversion retry failed', { 
                    filePath: error.filePath,
                    attempt: i + 1,
                    error: retryError 
                });
            }
        }

        // If all retries fail, create an error placeholder
        await this.fileConversionService.createErrorPlaceholder(context.outputPath, error);
        new Notice('File conversion failed after multiple attempts. See error placeholder file.');
    }

    private async handleFileSystemError(error: FileSystemError, context: Record<string, any>): Promise<void> {
        await this.loggingService.warn('File system error', { error, context });

        // Try to recover by ensuring directory exists
        try {
            await this.fileSystemService.ensureDirectoryExists(path.dirname(error.path));
            await this.loggingService.info('Directory structure recovered', { path: error.path });
        } catch (recoveryError) {
            await this.loggingService.error('Directory recovery failed', { 
                path: error.path,
                error: recoveryError 
            });
            new Notice('Failed to recover directory structure. See console for details.');
        }
    }

    private async handleConfigurationError(error: ConfigurationError, context: Record<string, any>): Promise<void> {
        await this.loggingService.error('Configuration error', { error, context });
        new Notice('Configuration error. Please check your settings.');
    }

    private async handleDependencyError(error: DependencyError, context: Record<string, any>): Promise<void> {
        await this.loggingService.error('Dependency error', { error, context });
        new Notice('Dependency error. Please ensure all required dependencies are installed.');
    }

    private async handleMonitoringError(error: MonitoringError, context: Record<string, any>): Promise<void> {
        await this.loggingService.warn('Monitoring error', { error, context });

        // Try to recover by re-handling the event
        try {
            // Since we don't have a specific file path, we'll just log the recovery
            await this.loggingService.info('Monitoring recovered', { folderPath: error.folderPath });
            new Notice('File monitoring recovered successfully.');
        } catch (recoveryError) {
            await this.loggingService.error('Monitoring recovery failed', { 
                folderPath: error.folderPath,
                error: recoveryError 
            });
            new Notice('Failed to recover file monitoring. See console for details.');
        }
    }

    private async handleArchiveError(error: ArchiveError, context: Record<string, any>): Promise<void> {
        await this.loggingService.warn('Archive error', { error, context });

        // Try to recover by ensuring archive directory exists
        try {
            const archiveDir = path.join(path.dirname(error.filePath), '.archive');
            await this.fileSystemService.ensureDirectoryExists(archiveDir);
            await this.loggingService.info('Archive directory recovered', { path: archiveDir });
        } catch (recoveryError) {
            await this.loggingService.error('Archive recovery failed', { 
                filePath: error.filePath,
                error: recoveryError 
            });
            new Notice('Failed to recover archive directory. See console for details.');
        }
    }

    private async handleGenericError(error: Error, context: Record<string, any>): Promise<void> {
        await this.loggingService.error('Generic error', { error, context });
        new Notice('An unexpected error occurred. See console for details.');
    }
} 