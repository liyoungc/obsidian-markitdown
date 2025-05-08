import { App } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { FileSystemAdapter } from 'obsidian';

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: Record<string, any>;
    error?: Error;
}

export class LoggingService {
    private app: App;
    private logFile: string;
    private maxLogSize: number;
    private maxLogFiles: number;
    private currentLogSize: number;

    constructor(app: App, logFile: string, maxLogSize: number = 5 * 1024 * 1024, maxLogFiles: number = 5) {
        this.app = app;
        this.logFile = logFile;
        this.maxLogSize = maxLogSize;
        this.maxLogFiles = maxLogFiles;
        this.currentLogSize = 0;
        this.initializeLogFile();
    }

    private initializeLogFile(): void {
        const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter 
            ? this.app.vault.adapter.getBasePath() 
            : '';
        
        if (!vaultBasePath) {
            throw new Error('Could not determine vault base path');
        }

        const fullLogPath = path.join(vaultBasePath, this.logFile);
        const logDir = path.dirname(fullLogPath);

        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        if (fs.existsSync(fullLogPath)) {
            this.currentLogSize = fs.statSync(fullLogPath).size;
        }
    }

    private async rotateLogs(): Promise<void> {
        const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter 
            ? this.app.vault.adapter.getBasePath() 
            : '';
        
        if (!vaultBasePath) {
            throw new Error('Could not determine vault base path');
        }

        const fullLogPath = path.join(vaultBasePath, this.logFile);
        const logDir = path.dirname(fullLogPath);
        const baseName = path.basename(this.logFile, path.extname(this.logFile));

        // Delete oldest log file if we've reached max files
        const oldestLog = path.join(logDir, `${baseName}.${this.maxLogFiles}${path.extname(this.logFile)}`);
        if (fs.existsSync(oldestLog)) {
            fs.unlinkSync(oldestLog);
        }

        // Rotate existing log files
        for (let i = this.maxLogFiles - 1; i > 0; i--) {
            const oldPath = path.join(logDir, `${baseName}.${i}${path.extname(this.logFile)}`);
            const newPath = path.join(logDir, `${baseName}.${i + 1}${path.extname(this.logFile)}`);
            if (fs.existsSync(oldPath)) {
                fs.renameSync(oldPath, newPath);
            }
        }

        // Rename current log file
        if (fs.existsSync(fullLogPath)) {
            fs.renameSync(fullLogPath, path.join(logDir, `${baseName}.1${path.extname(this.logFile)}`));
        }

        this.currentLogSize = 0;
    }

    private formatLogEntry(entry: LogEntry): string {
        const timestamp = new Date().toISOString();
        const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
        const errorStr = entry.error ? `\nError: ${entry.error.stack || entry.error.message}` : '';
        return `[${timestamp}] ${entry.level}: ${entry.message}${contextStr}${errorStr}\n`;
    }

    private async writeLog(entry: LogEntry): Promise<void> {
        const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter 
            ? this.app.vault.adapter.getBasePath() 
            : '';
        
        if (!vaultBasePath) {
            throw new Error('Could not determine vault base path');
        }

        const fullLogPath = path.join(vaultBasePath, this.logFile);
        const logEntry = this.formatLogEntry(entry);
        const logSize = Buffer.byteLength(logEntry, 'utf8');

        if (this.currentLogSize + logSize > this.maxLogSize) {
            await this.rotateLogs();
        }

        await fs.promises.appendFile(fullLogPath, logEntry);
        this.currentLogSize += logSize;
    }

    async debug(message: string, context?: Record<string, any>): Promise<void> {
        await this.writeLog({ timestamp: new Date().toISOString(), level: LogLevel.DEBUG, message, context });
    }

    async info(message: string, context?: Record<string, any>): Promise<void> {
        await this.writeLog({ timestamp: new Date().toISOString(), level: LogLevel.INFO, message, context });
    }

    async warn(message: string, context?: Record<string, any>, error?: Error): Promise<void> {
        await this.writeLog({ timestamp: new Date().toISOString(), level: LogLevel.WARN, message, context, error });
    }

    async error(message: string, context?: Record<string, any>, error?: Error): Promise<void> {
        await this.writeLog({ timestamp: new Date().toISOString(), level: LogLevel.ERROR, message, context, error });
    }
} 