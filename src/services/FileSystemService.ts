import { App, FileSystemAdapter } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class FileSystemService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    async computeFileHash(filePath: string): Promise<string> {
        if (!filePath || !fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`);
        }

        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            
            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', err => reject(err));
        });
    }

    async moveFile(sourcePath: string, targetPath: string): Promise<void> {
        try {
            if (!sourcePath || !targetPath) {
                throw new Error('Source and target paths are required');
            }

            const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter 
                ? this.app.vault.adapter.getBasePath() 
                : '';
            
            if (!vaultBasePath) {
                throw new Error('Could not determine vault base path');
            }

            const fullSourcePath = path.join(vaultBasePath, sourcePath);
            const fullTargetPath = path.join(vaultBasePath, targetPath);

            if (!fs.existsSync(fullSourcePath)) {
                throw new Error(`Source file does not exist: ${sourcePath}`);
            }

            await this.ensureDirectoryExists(path.dirname(targetPath));
            await fs.promises.rename(fullSourcePath, fullTargetPath);
        } catch (error) {
            console.error(`Failed to move file from ${sourcePath} to ${targetPath}:`, error);
            throw error;
        }
    }

    async deleteFile(filePath: string): Promise<void> {
        try {
            if (!filePath) {
                throw new Error('File path is required');
            }

            const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter 
                ? this.app.vault.adapter.getBasePath() 
                : '';
            
            if (!vaultBasePath) {
                throw new Error('Could not determine vault base path');
            }

            const fullPath = path.join(vaultBasePath, filePath);

            if (!fs.existsSync(fullPath)) {
                console.warn(`File does not exist, skipping deletion: ${filePath}`);
                return;
            }

            await fs.promises.unlink(fullPath);
        } catch (error) {
            console.error(`Failed to delete file ${filePath}:`, error);
            throw error;
        }
    }

    async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            if (!dirPath) {
                throw new Error('Directory path is required');
            }

            const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter 
                ? this.app.vault.adapter.getBasePath() 
                : '';
            
            if (!vaultBasePath) {
                throw new Error('Could not determine vault base path');
            }

            const fullPath = path.join(vaultBasePath, dirPath);
            await fs.promises.mkdir(fullPath, { recursive: true });
        } catch (error) {
            console.error(`Failed to ensure directory exists: ${dirPath}`, error);
            throw error;
        }
    }

    async fileExists(filePath: string): Promise<boolean> {
        try {
            if (!filePath) {
                throw new Error('File path is required');
            }

            const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter 
                ? this.app.vault.adapter.getBasePath() 
                : '';
            
            if (!vaultBasePath) {
                throw new Error('Could not determine vault base path');
            }

            const fullPath = path.join(vaultBasePath, filePath);
            try {
                await fs.promises.access(fullPath);
                return true;
            } catch {
                return false;
            }
        } catch (error) {
            console.error(`Failed to check if file exists: ${filePath}`, error);
            throw error;
        }
    }

    async listDirectory(dirPath: string): Promise<string[]> {
        try {
            if (!dirPath) {
                throw new Error('Directory path is required');
            }

            if (!fs.existsSync(dirPath)) {
                throw new Error(`Directory does not exist: ${dirPath}`);
            }

            return await fs.promises.readdir(dirPath);
        } catch (error) {
            console.error(`Error listing directory ${dirPath}:`, error);
            throw error;
        }
    }

    async deleteDirectory(dirPath: string): Promise<void> {
        try {
            if (!dirPath) {
                throw new Error('Directory path is required');
            }

            const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter 
                ? this.app.vault.adapter.getBasePath() 
                : '';
            
            if (!vaultBasePath) {
                throw new Error('Could not determine vault base path');
            }

            const fullPath = path.join(vaultBasePath, dirPath);

            if (!fs.existsSync(fullPath)) {
                console.warn(`Directory does not exist, skipping deletion: ${dirPath}`);
                return;
            }

            await fs.promises.rm(fullPath, { recursive: true, force: true });
        } catch (error) {
            console.error(`Failed to delete directory ${dirPath}:`, error);
            throw error;
        }
    }
} 