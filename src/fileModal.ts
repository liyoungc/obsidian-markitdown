import { App, Modal, Notice, FileSystemAdapter, TFile } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import MarkitdownPlugin from './main';

export class MarkitdownFileModal extends Modal {
    plugin: MarkitdownPlugin;

    constructor(app: App, plugin: MarkitdownPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.addClass('markitdown-modal');
        contentEl.createEl('h2', {text: 'Convert file to markdown'});

        if (!this.plugin.markitdownInstalled) {
            contentEl.createEl('p', {
                text: 'Markitdown is not installed. Please install it in the settings tab.'
            });

            const buttonEl = contentEl.createEl('button', {
                text: 'Go to settings'
            });

            buttonEl.addEventListener('click', () => {
                this.close();
                if ('setting' in this.app) {
                    const appWithSetting = this.app as any;
                    appWithSetting.setting.open();
                    appWithSetting.setting.openTabById('obsidian-markitdown');
                }
            });
            return;
        }

        contentEl.createEl('p', {text: 'Select a file to convert:'});
        const fileInputContainer = contentEl.createDiv('markitdown-file-input-container');
        const fileInput = fileInputContainer.createEl('input', {
            attr: {
                type: 'file',
                accept: '.pdf,.docx,.pptx,.xlsx,.xls,.html,.htm,.txt,.csv,.json,.xml,.jpg,.jpeg,.png,.gif,.wav,.mp3,.zip'
            }
        });
        const buttonContainer = contentEl.createDiv('markitdown-button-container');
        const convertButton = buttonContainer.createEl('button', {
            text: 'Convert'
        });

        convertButton.addEventListener('click', async () => {
            if (fileInput.files && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                try {
                    let vaultPath = '';
                    if (this.app.vault.adapter instanceof FileSystemAdapter) {
                        vaultPath = this.app.vault.adapter.getBasePath();
                    }
                    if (!vaultPath) {
                        new Notice('Could not determine vault path. This plugin requires a local vault.');
                        return;
                    }
                    let outputFolder = this.plugin.settings.outputPath || '';
                    if (!outputFolder) {
                        outputFolder = path.join(vaultPath, 'markitdown-output');
                        if (!fs.existsSync(outputFolder)) {
                            fs.mkdirSync(outputFolder, { recursive: true });
                        }
                    } else {
                        outputFolder = path.join(vaultPath, outputFolder);
                        if (!path.isAbsolute(outputFolder) && vaultPath) {
                            outputFolder = path.join(vaultPath, this.plugin.settings.outputPath);
                        }
                        if (!fs.existsSync(outputFolder)) {
                            fs.mkdirSync(outputFolder, { recursive: true });
                        }
                    }
                    const baseName = path.basename(file.name, path.extname(file.name));
                    const outputPath = path.join(outputFolder, `${baseName}.md`);
                    new Notice('Converting file...');
                    const tempFilePath = path.join(outputFolder, `${Date.now()}_${file.name}`);
                    const buffer = await file.arrayBuffer();
                    await fs.promises.writeFile(tempFilePath, Buffer.from(buffer));

                    await this.plugin.convertFile(tempFilePath, outputPath);

                    if (fs.existsSync(tempFilePath)) {
                        await fs.promises.unlink(tempFilePath);
                    }
                    new Notice(`File converted and saved to ${outputPath}`);
                    this.close();

                    const relativeOutputFilePath = path.relative(vaultPath, outputPath).replace(/\\/g, '/');
                    const newFile = this.app.vault.getAbstractFileByPath(relativeOutputFilePath);
                    if (newFile instanceof TFile) {
                        this.app.workspace.getLeaf(true).openFile(newFile);
                    } else {
                        new Notice(`Converted file at: ${relativeOutputFilePath}. Please open manually if not shown.`);
                    }
                } catch (error) {
                    console.error('Error during conversion:', error);
                    new Notice(`Error: ${(error as Error).message}`);
                }
            } else {
                new Notice('Please select a file first');
            }
        });
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
} 