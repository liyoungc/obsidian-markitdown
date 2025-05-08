import { App, Notice, FileSystemAdapter } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { MarkitdownSettings } from '../settings';

export class FileConversionService {
    private app: App;
    private settings: MarkitdownSettings;

    constructor(app: App, settings: MarkitdownSettings) {
        this.app = app;
        this.settings = settings;
    }

    async convertFile(filePath: string, outputPath: string): Promise<string> {
        try {
            // Validate input paths
            if (!filePath || !outputPath) {
                throw new Error('Input and output paths are required');
            }

            // Ensure input file exists
            if (!fs.existsSync(filePath)) {
                throw new Error(`Input file does not exist: ${filePath}`);
            }

            // Ensure output directory exists
            const outputDir = path.dirname(outputPath);
            await this.ensureDirectoryExists(outputDir);

            // Get absolute path for output
            const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter 
                ? this.app.vault.adapter.getBasePath() 
                : '';
            
            if (!vaultBasePath) {
                throw new Error('Could not determine vault base path');
            }

            const absoluteOutputPath = path.join(vaultBasePath, outputPath);

            // Create temporary Python script in system temp directory
            const tempScriptPath = path.join(os.tmpdir(), `markitdown_script_${Date.now()}.py`);
            const pythonCode = [
                'import sys',
                'from markitdown.converters import convert',
                'from markitdown.config import Config',
                '',
                'config = Config()',
                this.settings.enablePlugins ? 'config.enable_plugins = True' : '',
                this.settings.docintelEndpoint ? `config.azure_docintel_endpoint = "${this.settings.docintelEndpoint}"` : '',
                this.settings.docintelKey ? `config.azure_docintel_key = "${this.settings.docintelKey}"` : '',
                '',
                `convert("${filePath}", output_file="${absoluteOutputPath}", config=config)`
            ].filter(Boolean).join('\n');

            try {
                // Write Python script to temporary file
                await fs.promises.writeFile(tempScriptPath, pythonCode, 'utf-8');

                // Execute Python script
                const command = `${this.settings.pythonPath} "${tempScriptPath}"`;
                await this.execCommand(command);

                // Clean up temporary script
                try {
                    await fs.promises.unlink(tempScriptPath);
                } catch (cleanupError) {
                    console.warn('Failed to clean up temporary script:', cleanupError);
                }

                return outputPath;
            } catch (conversionError) {
                // Create error placeholder if conversion fails
                await this.createErrorPlaceholder(absoluteOutputPath, conversionError);
                throw conversionError;
            }
        } catch (error) {
            console.error(`Failed to convert file: ${filePath}`, error);
            throw new Error(`File conversion failed: ${error.message}`);
        }
    }

    async execCommand(command: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Command execution timed out after 30 seconds'));
            }, 30000);

            exec(command, { env }, (error, stdout, stderr) => {
                clearTimeout(timeout);
                if (error) {
                    reject(new Error(`Command failed: ${error.message}\n${stderr}`));
                    return;
                }
                resolve(stdout);
            });
        });
    }

    async createErrorPlaceholder(filePath: string, error: Error): Promise<void> {
        try {
            const errorContent = `# Conversion Error\n\nFailed to convert file: ${filePath}\n\nError: ${error.message}\n\nTimestamp: ${new Date().toISOString()}`;
            await fs.promises.writeFile(filePath, errorContent, 'utf-8');
        } catch (writeError) {
            console.error('Failed to create error placeholder:', writeError);
        }
    }

    async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter 
                ? this.app.vault.adapter.getBasePath() 
                : '';
            
            if (!vaultBasePath) {
                throw new Error('Could not determine vault base path');
            }

            const fullPath = path.join(vaultBasePath, dirPath);
            
            if (!fs.existsSync(fullPath)) {
                await fs.promises.mkdir(fullPath, { recursive: true });
            }
        } catch (error) {
            console.error(`Failed to ensure directory exists: ${dirPath}`, error);
            throw error;
        }
    }
} 